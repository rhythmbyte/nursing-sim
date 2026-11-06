import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenario, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents, eventKey } from '../js/engine/scheduler.js';
import { evaluateRules } from '../js/engine/rules/index.js';
import { allergyMatch } from '../js/engine/rules/allergy-conflict.js';
import { markLeftUnattended } from '../js/engine/instructor.js';
import { buildDebrief } from '../js/engine/debrief.js';
import { studentIdsForGroup, groupOfStudent } from '../js/engine/assignment.js';
import { joinSim } from '../js/engine/roster.js';
import { prnWarnings, prnOptions } from '../js/engine/prn.js';

const S1 = { userId: 'student-1', role: 'student' };
const INS = { userId: 'instructor', role: 'instructor' };
const RM = 'p1-robert-miller';
const LG = 'p4-linda-garcia';
const JC = 'p6-james-carter';

function started(settings = {}) {
  const scenario = scenarioWith(settings);
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  let s = session.createSession(scenario, templatesById, catalogs, { joinCode: 'ABC123' });
  s = joinSim(s, { userId: 'student-1', name: 'Pat', code: 'abc123' }, { scenario, now: 0 }).state;
  s = session.controlClock(s, 'start', { now: 0, user: INS });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById, catalogs }).state;
  const fire = (st, pid, eid, min) => session.fireNow(st, refs.find((r) => r.key === eventKey(pid, eid)), { now: min * MIN, refs, templatesById, catalogs, user: INS });
  const rctx = (simMin, st = s) => ({ templatesById, catalogs, simMin, studentIdsForGroup: (g) => studentIdsForGroup(st.roster, g), groupOfStudent: (u) => groupOfStudent(st.roster, u) });
  const flags = (st, simMin, ruleId) => evaluateRules(st, rctx(simMin, st)).filter((f) => !ruleId || f.ruleId === ruleId);
  return { s, tick, fire, flags, rctx };
}
const ctx = (min) => ({ now: min * MIN, user: S1, templatesById, catalogs });
const iv = (s, pid, interventionId, min, extra = {}) => chart.chartIntervention(s, pid, { interventionId, ...extra }, ctx(min));

test('no flags for a quiet start', () => {
  const { s, flags } = started();
  assert.deepEqual(flags(s, 1), []);
});

test('priority-order: Foley before the fluid bolus in the sepsis set (amber)', () => {
  let { s, fire, flags } = started();
  s = fire(s, LG, 'e-p4-sepsis-orders', 60);
  s = iv(s, LG, 'foley', 62, { orderId: 'o-p4-foley' });
  const f = flags(s, 62, 'priority-order');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'amber');
  assert.match(f[0].message, /Foley|catheter/i);
  assert.deepEqual(f[0].userIds, ['student-1']);
});

test('tier-timeout: tier 1 ECG after the call light: flagged while open, then as late', () => {
  let { s, tick, flags } = started();
  s = tick(s, 76);
  assert.equal(flags(s, 79, 'tier-timeout').length, 0, 'inside the 5 min window');
  const open = flags(s, 81, 'tier-timeout');
  assert.equal(open.length, 1);
  assert.equal(open[0].severity, 'red');
  assert.match(open[0].message, /still not done/);
  s = iv(s, RM, 'ecg-12lead', 83, { orderId: 'o-p1-ecg' });
  const late = flags(s, 90, 'tier-timeout');
  assert.match(late[0].message, /done 8 min after/);
});

test('tier-timeout: shift-start orders are not timed by default, configurable per scenario', () => {
  const quiet = started();
  assert.equal(quiet.flags(quiet.s, 120, 'tier-timeout').length, 0);
  const strict = started({ rules: { 'tier-timeout': { includeShiftStartOrders: true } } });
  assert.ok(strict.flags(strict.s, 120, 'tier-timeout').some((f) => f.patientId === RM && /troponin/i.test(f.message)));
});

test('call-light-response: amber after 5 min, red after 10, and open lights count', () => {
  let { s, tick, flags } = started();
  s = tick(s, 76);
  assert.equal(flags(s, 79, 'call-light-response').length, 0);
  assert.equal(flags(s, 82, 'call-light-response')[0].severity, 'amber');
  assert.equal(flags(s, 86, 'call-light-response')[0].severity, 'red');
  s = session.answerCallLight(s, RM, { now: 82 * MIN, user: S1 });
  const f = flags(s, 100, 'call-light-response');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /answered after 7 min/);
});

test('parameter-breach: Linda SBP < 90 at 08:00 needs the provider notified within 5 min', () => {
  let { s, tick, flags } = started();
  s = tick(s, 61);
  assert.equal(flags(s, 64, 'parameter-breach').length, 0, 'still in window');
  assert.equal(flags(s, 66, 'parameter-breach').length, 1);
  s = iv(s, LG, 'notify-provider', 63);
  assert.equal(flags(s, 90, 'parameter-breach').filter((f) => f.patientId === LG).length, 0, 'notified in time');
});

test('parameter-breach: watched event (Robert pain returns) and lab threshold (James K < 3.5)', () => {
  let { s, tick, fire, flags } = started();
  s = tick(s, 76);
  assert.ok(flags(s, 90, 'parameter-breach').some((f) => f.patientId === RM));
  s = tick(s, 151);
  s = fire(s, JC, 'e-p6-admit-orders', 152);
  s = iv(s, JC, 'lab-draw', 153, { orderId: 'o-p6-labs' });
  s = tick(s, 184); // K resulted at 183
  assert.equal(flags(s, 190, 'parameter-breach').filter((f) => f.patientId === JC).length, 0, 'in window');
  assert.equal(flags(s, 199, 'parameter-breach').filter((f) => f.patientId === JC).length, 1);
});

test('inappropriate-delegation: head-to-toe to a CNA, non-delegable order to an LPN', () => {
  let { s, tick, flags } = started();
  s = iv(s, RM, 'assess-full', 5, { delegatedTo: 'CNA' });
  s = tick(s, 76);
  s = iv(s, RM, 'ecg-12lead', 77, { orderId: 'o-p1-ecg', delegatedTo: 'LPN' });
  const f = flags(s, 80, 'inappropriate-delegation');
  assert.equal(f.length, 2);
  assert.match(f[0].message, /isn't delegable to CNA/);
  assert.match(f[1].message, /order .* isn't delegable/);
  s = iv(s, RM, 'vs-full', 81, { delegatedTo: 'CNA' });
  assert.equal(flags(s, 82, 'inappropriate-delegation').length, 2, 'vitals to a CNA is fine');
});

test('allergy-conflict: name and class matching (data-driven)', () => {
  const classes = catalogs.rules.rules['allergy-conflict'].classes;
  assert.equal(allergyMatch('Penicillin', 'Amoxicillin 500 mg PO', classes), 'amoxicillin');
  assert.equal(allergyMatch('Sulfa medications', 'Bactrim DS PO', classes), 'bactrim');
  assert.equal(allergyMatch('Penicillin', 'Aspirin 81 mg PO', classes), null);
  // No ordered med in the starter cases conflicts with an allergy.
  let { s, flags } = started();
  s = chart.medAction(s, RM, { orderId: 'o-p1-asa', result: 'given' }, ctx(5));
  assert.equal(flags(s, 6, 'allergy-conflict').length, 0);
});

test('prn-limit: nitro given over a warning is a red flag', () => {
  let { s, flags } = started();
  const ntg = templatesById[RM].orders.find((o) => o.id === 'o-p1-ntg');
  const warnings = prnWarnings(ntg, { log: s.log, patientId: RM, simMin: 5, ...prnOptions(catalogs, s.patients[RM], s.settings) });
  s = chart.medAction(s, RM, { orderId: 'o-p1-ntg', result: 'given', warnings }, ctx(5));
  const f = flags(s, 6, 'prn-limit');
  assert.equal(f[0].severity, 'red');
  assert.match(f[0].message, /without the required pre-check/);
});

test('left-unattended: instructor mark becomes a red flag for that student', () => {
  let { s, flags } = started();
  s = markLeftUnattended(s, LG, { studentIds: ['student-1'], note: 'went to break during hypotension' }, { now: 70 * MIN, user: INS });
  const f = flags(s, 71, 'left-unattended');
  assert.deepEqual([f[0].severity, f[0].userIds], ['red', ['student-1']]);
});

test('debrief: counts, response times, order sequence, charted vs scripted, timeline', () => {
  let { s, tick, fire, rctx } = started();
  s = tick(s, 76);
  s = session.answerCallLight(s, RM, { now: 79 * MIN, user: S1 });
  s = iv(s, RM, 'vs-full', 80, { fields: { tempF: '98.6', rr: '16', pain: '7' } }); // RR scripted 24
  s = fire(s, LG, 'e-p4-sepsis-orders', 81);
  s = iv(s, LG, 'foley', 82, { orderId: 'o-p4-foley' });
  s = iv(s, LG, 'iv-fluids', 84, { orderId: 'o-p4-bolus' });
  const d = buildDebrief(s, 'student-1', rctx(90, s));
  assert.ok(d.counts.red >= 1 && d.counts.amber >= 1);
  assert.deepEqual(d.responseTimes.callLights[0], { patientId: RM, litAtMin: 75, answeredAtMin: 79, responseMin: 4, by: 'student-1' });
  const sepsis = d.orderSequences.find((o) => o.orderSet === 'os-p4-sepsis');
  assert.equal(sepsis.done[0].id, 'o-p4-foley');
  assert.equal(sepsis.correct[0].tier, 1);
  const rr = d.vitalsCompare.find((v) => v.field === 'rr');
  assert.deepEqual([rr.charted, rr.scripted, rr.differs], ['16', 24, true]);
  assert.equal(d.vitalsCompare.find((v) => v.field === 'tempF').differs, false);
  assert.ok(d.timeline.some((t) => t.kind === 'action' && t.flags.length));
  assert.ok(d.shouldRecognize.find((x) => x.patientId === RM).items.length);
});

test('CSV: quotes commas, quotes, newlines; JSON for objects', async () => {
  const { toCsv } = await import('../js/screens/debrief/csv.js');
  const text = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', { k: 1 }]]);
  assert.equal(text, 'a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak","{""k"":1}"\r\n');
});
