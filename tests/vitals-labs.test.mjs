import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenario, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents, eventKey } from '../js/engine/scheduler.js';
import { prnWarnings, prnOptions } from '../js/engine/prn.js';
import { releaseLab, initLabs } from '../js/engine/labs.js';
import { measureManual } from '../js/engine/vitals.js';
import { delegationDelay } from '../js/engine/delegation.js';

const student = { userId: 'student-1', role: 'student' };
const instructor = { userId: 'instructor', role: 'instructor' };
const RM = 'p1-robert-miller';
const LG = 'p4-linda-garcia';
const JC = 'p6-james-carter';

function started(settings = {}) {
  const scenario = scenarioWith(settings);
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  let s = session.createSession(scenario, templatesById, catalogs);
  s = session.controlClock(s, 'start', { now: 0, user: instructor });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById, catalogs }).state;
  return { s, refs, tick };
}
const ctx = (min, user = student) => ({ now: min * MIN, user, templatesById, catalogs });

test('monitor cycle: q5 readings use the vitals current at each reading', () => {
  let { s, tick } = started();
  s = chart.setMonitor(s, RM, { intervalMin: 5 }, ctx(65));
  s = tick(s, 80);
  const rows = s.patients[RM].flowsheet.filter((r) => r.source === 'monitor');
  assert.deepEqual(rows.map((r) => r.atMin), [65, 70, 75, 80]);
  assert.equal(rows[1].values.hr, 96, '08:10 still baseline');
  assert.equal(rows[2].values.hr, 108, '08:15 reading sees the 08:15 vitals change');
  assert.deepEqual(Object.keys(rows[0].values).sort(), ['bp', 'hr', 'o2', 'spo2'], 'monitor gives BP/HR/SpO₂/O₂ only');
  s = chart.setMonitor(s, RM, { intervalMin: 0 }, ctx(81));
  s = tick(s, 120);
  assert.equal(s.patients[RM].flowsheet.filter((r) => r.source === 'monitor').length, 4, 'off stops readings');
  assert.throws(() => chart.setMonitor(s, RM, { intervalMin: 7 }, ctx(121)));
});

test('charted vitals: device values from the patient, manual values as typed, scripted kept for debrief', () => {
  let { s, tick } = started();
  s = tick(s, 76);
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', fields: { bp: '999/1', tempF: '99.1', rr: '22', pain: '7' } }, ctx(77));
  const entry = s.log.at(-1);
  assert.equal(entry.details.fields.bp, '158/92', 'typed BP ignored; device value used');
  assert.equal(entry.details.fields.rr, '22', 'manual value as typed');
  assert.equal(entry.details.scripted.rr, 24, 'scripted RR kept for comparison');
  assert.equal(s.patients[RM].flowsheet.at(-1).source, 'charted');
});

test('revealManualVitals: Measure shows scripted temp/RR/pain only when on', () => {
  const on = started().s;
  assert.deepEqual(measureManual(on, RM, catalogs.vitals), { tempF: 98.6, rr: 20, pain: '3/10 intermittent chest pressure' });
  const off = started({ revealManualVitals: false }).s;
  assert.deepEqual(measureManual(off, RM, catalogs.vitals), {});
});

test('labs: drawing starts the delay; scripted values result on time', () => {
  let { s, tick } = started();
  const fire = (st, pid, eid, min) => session.fireNow(st, started().refs.find((r) => r.key === eventKey(pid, eid)), { now: min * MIN, refs: started().refs, templatesById, user: instructor });
  s = tick(s, 151);                       // James admitted
  s = fire(s, JC, 'e-p6-admit-orders', 152);
  assert.equal(s.patients[JC].labs.find((l) => l.code === 'bnp').drawnAtMin, undefined, 'undrawn until the order is done');
  s = chart.chartIntervention(s, JC, { interventionId: 'lab-draw', orderId: 'o-p6-labs' }, ctx(160));
  s = tick(s, 190);
  assert.equal(s.patients[JC].labs.find((l) => l.code === 'bnp').status, 'resulted', 'BNP at +30');
  assert.equal(s.patients[JC].labs.find((l) => l.code === 'trop-hs').status, 'pending', 'troponin needs +45');
  s = tick(s, 206);
  assert.equal(s.patients[JC].labs.find((l) => l.code === 'trop-hs').resultedAtMin, 205);
  assert.ok(s.alerts.some((a) => a.kind === 'lab-result' && a.patientId === JC));
});

test('labs: an unscripted (null) result waits for the instructor', () => {
  let { s, tick } = started();
  s = chart.chartIntervention(s, RM, { interventionId: 'lab-draw', orderId: 'o-p1-trop' }, ctx(10));
  s = tick(s, 60);
  const trop = s.patients[RM].labs.find((l) => l.label === 'Repeat hs-troponin');
  assert.equal(trop.status, 'pending');
  assert.equal(trop.awaitingValue, true);
  assert.deepEqual(s.alerts.at(-1).audience, ['instructor']);
  assert.throws(() => releaseLab(s, RM, { uid: trop.uid }, { now: 61 * MIN, user: instructor, simMin: 61 }));
  s = releaseLab(s, RM, { uid: trop.uid, value: '31' }, { now: 61 * MIN, user: instructor, simMin: 61 });
  assert.deepEqual([trop.uid, s.patients[RM].labs.find((l) => l.uid === trop.uid).value], [trop.uid, '31']);
});

test('labs: a second draw of the same code creates an unscripted lab', () => {
  let { s } = started();
  s = chart.chartIntervention(s, LG, { interventionId: 'lab-draw', orderId: 'o-p4-lactate' }, ctx(5));
  s = chart.chartIntervention(s, LG, { interventionId: 'lab-draw', orderId: 'o-p4-lactate' }, ctx(6));
  const drawn = s.patients[LG].labs.filter((l) => l.code === 'lactate' && l.drawnAtMin != null);
  assert.equal(drawn.length, 2);
  assert.ok(drawn.every((l) => l.unscripted), 'the scripted repeat lactate is reserved for the STAT order');
});

test('delegation: CNA vitals report back after the delay, with a flowsheet row and a staff message', () => {
  let { s, tick } = started();
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', orderId: 'o-p1-vs', delegatedTo: 'CNA' }, ctx(70));
  assert.equal(s.patients[RM].flowsheet.length, 1, 'nothing until the CNA reports');
  assert.equal(s.log.at(-1).details.dueAt, 80);
  s = tick(s, 81);
  const row = s.patients[RM].flowsheet.at(-1);
  assert.deepEqual([row.source, row.by, row.values.hr, row.values.rr], ['delegated', 'CNA', 108, 24]);
  const done = s.log.find((l) => l.action === 'delegation-completed');
  assert.deepEqual([done.role, done.userId, done.simMin], ['staff', 'staff-cna', 80]);
  assert.match(s.alerts.find((a) => a.message.startsWith('CNA:')).message, /HR 108/);
});

test('delegation: delay is configurable per role or as one number (merged with scenario-defaults)', () => {
  assert.equal(delegationDelay(scenarioWith({ delegationDelayMin: { LPN: 4 } }).settings, 'LPN'), 4);
  assert.equal(delegationDelay(scenarioWith({ delegationDelayMin: { LPN: 4 } }).settings, 'CNA'), 10, 'CNA from the starter scenario');
  assert.equal(delegationDelay(scenarioWith({ delegationDelayMin: 7 }).settings, 'CNA'), 7);
  assert.throws(() => delegationDelay({ delegationDelayMin: {} }, 'CNA'));
});

test('delegated assessment reveals findings only when the scenario setting allows', () => {
  let { s, tick } = started();
  s = chart.chartIntervention(s, RM, { interventionId: 'assess-full', delegatedTo: 'LPN' }, ctx(5));
  s = tick(s, 16);
  assert.equal(s.patients[RM].revealed.length, 0, 'default: false');
  ({ s, tick } = started({ delegatedAssessmentRevealsFindings: true }));
  s = chart.chartIntervention(s, RM, { interventionId: 'assess-full', delegatedTo: 'LPN' }, ctx(5));
  assert.equal(s.patients[RM].revealed.length, 0, 'nothing until the LPN reports');
  s = tick(s, 16);
  assert.deepEqual(s.patients[RM].revealed.map((r) => [r.source, r.atMin]), [['baseline', 15]]);
});

test('PRN pre-check window comes from the scenario setting when the order has none', () => {
  const { s } = started({ prnPreCheckWindowMin: 30 });
  let st = chart.chartIntervention(s, RM, { interventionId: 'vs-bp' }, ctx(0));
  const ntg = { ...templatesById[RM].orders.find((o) => o.id === 'o-p1-ntg') };
  ntg.prn = { ...ntg.prn };
  delete ntg.prn.requiresWithinMin;
  const warn = (min, settings) => prnWarnings(ntg, { log: st.log, patientId: RM, simMin: min, ...prnOptions(catalogs, st.patients[RM], settings) }).map((w) => w.code);
  assert.deepEqual(warn(25, st.settings), [], '25 min ago is inside a 30 min window');
  assert.deepEqual(warn(25, scenario.settings), ['requires'], 'default 15 min window');
});

test('lab delay falls back to the labs catalog fallbackDelayMin', () => {
  const t = { ...templatesById[RM], labs: [{ code: 'zz-unknown', value: '1', status: 'pending' }], orders: [] };
  const labs = initLabs(t, catalogs);
  assert.equal(labs[0].resultAtMin, catalogs.labs.fallbackDelayMin);
  assert.throws(() => initLabs(t, { labs: { labs: [] } }));
});

test('PRN pre-check: delegated BP counts once reported; full vitals include BP; monitor BP counts', () => {
  let { s, tick } = started({ delegationDelayMin: 5 });
  const ntg = templatesById[RM].orders.find((o) => o.id === 'o-p1-ntg');
  const warn = (st, min) => prnWarnings(ntg, { log: st.log, patientId: RM, simMin: min, ...prnOptions(catalogs, st.patients[RM], st.settings) }).map((w) => w.code);
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-bp', delegatedTo: 'LPN' }, ctx(10));
  assert.deepEqual(warn(s, 11), ['requires'], 'request alone is not a BP');
  s = tick(s, 16);
  assert.deepEqual(warn(s, 16), [], 'LPN reported a BP at 15');
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', fields: {} }, ctx(40));
  assert.deepEqual(warn(s, 41), [], 'full vitals include a BP');
  assert.deepEqual(warn(s, 60), ['requires'], 'nothing in the last 15 min');
  s = chart.setMonitor(s, RM, { intervalMin: 15 }, ctx(60));
  s = tick(s, 60); // first cycle reading is taken on the next tick
  assert.deepEqual(warn(s, 60), [], 'monitor BP at 60 counts (vs-bp is satisfiedByMonitor)');
  assert.deepEqual(warn(s, 76), ['requires'], 'reading 16 min ago is outside the window');
  s = chart.takeBpNow(s, RM, {}, ctx(76));
  assert.deepEqual(warn(s, 77), [], 'Take BP now counts');
  assert.equal(s.log.at(-1).action, 'nibp-now');
  assert.equal(s.log.at(-1).role, 'student');
});

test('Take BP now does not change the auto cycle', () => {
  let { s, tick } = started();
  s = chart.setMonitor(s, RM, { intervalMin: 10 }, ctx(0));
  s = chart.takeBpNow(s, RM, {}, ctx(3));
  s = tick(s, 21);
  const times = s.patients[RM].flowsheet.filter((r) => r.source === 'monitor').map((r) => r.atMin).sort((a, b) => a - b);
  assert.deepEqual(times, [0, 3, 10, 20]);
});

test('Linda: the STAT lactate takes the scripted 4.1; the 2–4 h repeat is unscripted', () => {
  let { s, refs } = started();
  // Repeat order drawn first: must NOT take the scripted value reserved for the STAT order.
  s = chart.chartIntervention(s, LG, { interventionId: 'lab-draw', orderId: 'o-p4-lactate' }, ctx(5));
  let pending = s.patients[LG].labs.filter((l) => l.code === 'lactate' && l.status === 'pending');
  assert.equal(pending.find((l) => l.drawnAtMin === 5).unscripted, true);
  const sepsis = refs.find((r) => r.key === eventKey(LG, 'e-p4-sepsis-orders'));
  s = session.fireNow(s, sepsis, { now: 30 * MIN, refs, templatesById, user: instructor });
  s = chart.chartIntervention(s, LG, { interventionId: 'lab-draw', orderId: 'o-p4-stat-lactate' }, ctx(31));
  pending = s.patients[LG].labs.filter((l) => l.code === 'lactate' && l.status === 'pending');
  const stat = pending.find((l) => l.drawnAtMin === 31);
  assert.deepEqual([stat.value, stat.forOrder], ['4.1', 'o-p4-stat-lactate']);
});

test('delegation with revealManualVitals=false reports device values only', () => {
  let { s, tick } = started({ revealManualVitals: false });
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', delegatedTo: 'CNA' }, ctx(5));
  s = tick(s, 16);
  const row = s.patients[RM].flowsheet.at(-1);
  assert.deepEqual(Object.keys(row.values).sort(), ['bp', 'hr', 'o2', 'spo2']);
  assert.doesNotMatch(s.alerts.at(-1).message, /Temp|RR|pain/);
});
