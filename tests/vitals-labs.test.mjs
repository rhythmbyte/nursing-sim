import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents, eventKey } from '../js/engine/scheduler.js';
import { prnWarnings } from '../js/engine/prn.js';
import { releaseLab } from '../js/engine/labs.js';
import { measureManual } from '../js/engine/vitals.js';
import { delegationDelay } from '../js/engine/delegation.js';

const load = (rel) => JSON.parse(readFileSync(new URL(`../data/${rel}`, import.meta.url), 'utf8'));
const manifest = load('manifest.json');
const templatesById = Object.fromEntries(manifest.patients.map((rel) => load(rel)).map((p) => [p.id, p]));
const baseScenario = load('scenarios/busy-medsurg-shift.json');
const catalogs = { interventions: load('catalogs/interventions.json'), labs: load('catalogs/labs.json') };
const MIN = 60000;
const student = { userId: 'student-1', role: 'student' };
const instructor = { userId: 'instructor', role: 'instructor' };
const RM = 'p1-robert-miller';
const LG = 'p4-linda-garcia';
const JC = 'p6-james-carter';

function started(settings = {}) {
  const scenario = { ...baseScenario, settings: { ...baseScenario.settings, ...settings } };
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  let s = session.createSession(scenario, templatesById);
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
  assert.deepEqual(measureManual(on, RM), { tempF: 98.6, rr: 20, pain: '3/10 intermittent chest pressure' });
  const off = started({ revealManualVitals: false }).s;
  assert.deepEqual(measureManual(off, RM), {});
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
  const lactates = s.patients[LG].labs.filter((l) => l.code === 'lactate' && l.status === 'pending');
  assert.equal(lactates.length, 2);
  assert.equal(lactates[1].unscripted, true);
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

test('delegation: delay is configurable per role or as one number', () => {
  assert.equal(delegationDelay({ delegationDelayMin: { LPN: 4, CNA: 12 } }, 'LPN'), 4);
  assert.equal(delegationDelay({ delegationDelayMin: 7 }, 'CNA'), 7);
  assert.equal(delegationDelay({}, 'CNA'), 10);
});

test('PRN pre-check: a delegated BP counts only once reported; full vitals include BP', () => {
  let { s, tick } = started({ delegationDelayMin: 5 });
  const ntg = templatesById[RM].orders.find((o) => o.id === 'o-p1-ntg');
  const includesOf = (id) => catalogs.interventions.interventions.find((i) => i.id === id)?.includes || [];
  const warn = (st, min) => prnWarnings(ntg, { log: st.log, patientId: RM, simMin: min, includesOf }).map((w) => w.code);
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-bp', delegatedTo: 'LPN' }, ctx(10));
  assert.deepEqual(warn(s, 11), ['requires'], 'request alone is not a BP');
  s = tick(s, 16);
  assert.deepEqual(warn(s, 16), [], 'LPN reported a BP at 15');
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', fields: {} }, ctx(40));
  assert.deepEqual(warn(s, 41), [], 'full vitals include a BP');
  s = chart.setMonitor(s, RM, { intervalMin: 5 }, ctx(60));
  s = tick(s, 70);
  assert.deepEqual(warn(s, 70), ['requires'], 'monitor readings do not count as the pre-check');
});

test('delegation with revealManualVitals=false reports device values only', () => {
  let { s, tick } = started({ revealManualVitals: false });
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', delegatedTo: 'CNA' }, ctx(5));
  s = tick(s, 16);
  const row = s.patients[RM].flowsheet.at(-1);
  assert.deepEqual(Object.keys(row.values).sort(), ['bp', 'hr', 'o2', 'spo2']);
  assert.doesNotMatch(s.alerts.at(-1).message, /Temp|RR|pain/);
});
