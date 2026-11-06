import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { adjustVitals, vitalsAt, presetTarget, cleanValues } from '../js/engine/vitals-control.js';
import { measureManual } from '../js/engine/vitals.js';
import { evaluateRules } from '../js/engine/rules/index.js';

const INS = { userId: 'instructor', role: 'instructor' };
const S1 = { userId: 'student-1', role: 'student' };
const RM = 'p1-robert-miller';
const HT = 'p3-harold-thompson';

function started(settings = {}) {
  const sc = scenarioWith(settings);
  const refs = collectEvents(session.scenarioPatients(sc).map((p) => p.id), templatesById, sc);
  let s = session.controlClock(session.createSession(sc, templatesById, catalogs), 'start', { now: 0, user: INS });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById, catalogs }).state;
  return { s, tick };
}
const adj = (s, pid, args, min) => adjustVitals(s, pid, args, { now: min * MIN, user: INS });

test('apply now: vitals change immediately, logged old → new; Measure and Take BP now see it', () => {
  let { s } = started();
  s = adj(s, HT, { values: { bp: '88/50', hr: '118', tempF: '101.4', o2: '2 L NC' } }, 10);
  const v = s.patients[HT].vitals;
  assert.deepEqual([v.bp, v.hr, v.tempF, v.o2], ['88/50', 118, 101.4, '2 L NC']);
  const log = s.log.at(-1);
  assert.equal(log.action, 'vitals-adjusted');
  assert.equal(log.role, 'instructor');
  assert.equal(log.details.to.hr, 118);
  assert.equal(log.details.from.hr, templatesById[HT].vitals.baseline.hr);
  assert.equal(measureManual(s, HT, catalogs.vitals).tempF, 101.4);
  s = chart.takeBpNow(s, HT, {}, { now: 11 * MIN, user: S1, templatesById, catalogs });
  assert.equal(s.patients[HT].flowsheet.at(-1).values.bp, '88/50');
  assert.throws(() => adj(s, HT, { values: { bp: '120' } }, 12), /BP must look like/);
});

test('trend over N minutes: monitor readings step toward the target; text fields apply at once', () => {
  let { s, tick } = started();
  s = chart.setMonitor(s, HT, { intervalMin: 5 }, { now: 0, user: S1, templatesById, catalogs });
  s = adj(s, HT, { values: { hr: 120, bp: '80/40', o2: 'NRB 15 L' }, overMin: 20 }, 0);
  assert.equal(s.patients[HT].vitals.o2, 'NRB 15 L');
  s = tick(s, 20);
  const base = templatesById[HT].vitals.baseline;
  const readings = s.patients[HT].flowsheet.filter((r) => r.source === 'monitor').sort((a, b) => a.atMin - b.atMin);
  const hrAt = (t) => readings.find((r) => Math.round(r.atMin) === t).values.hr;
  assert.equal(hrAt(0), base.hr, 'first reading before any step');
  assert.equal(hrAt(10), Math.round(base.hr + (120 - base.hr) * 0.5), 'halfway at 10 of 20');
  assert.equal(hrAt(20), 120);
  assert.equal(s.patients[HT].vitalsTrend, null, 'trend finished');
  assert.equal(vitalsAt(s.patients[HT], 5).hr, Math.round(base.hr + (120 - base.hr) * 0.25));
});

test('parameter rule sees a live change (Linda notify for SBP < 90 fires from an instructor drop)', () => {
  let { s, tick } = started();
  s = adj(s, HT, { values: { spo2: 86 } }, 5); // Harold: notify if SpO2 < 90 within 15
  s = tick(s, 6);
  const ctx = { templatesById, catalogs, simMin: 25, studentIdsForGroup: () => [], groupOfStudent: () => null };
  assert.ok(evaluateRules(s, ctx).some((f) => f.ruleId === 'parameter-breach' && f.patientId === HT));
});

test('scripted keyframe: "apply" overrides the instructor; "skip" keeps instructor control', () => {
  let { s, tick } = started();
  s = adj(s, RM, { values: { hr: 70 }, overMin: 30 }, 60);
  s = tick(s, 76); // 08:15 scripted pain-returns keyframe (HR 108)
  assert.equal(s.patients[RM].vitals.hr, 108);
  assert.equal(s.patients[RM].vitalsTrend, null);
  let k = started({ scriptedVitalsAfterInstructor: 'skip' });
  k.s = adj(k.s, RM, { values: { hr: 70 } }, 60);
  k.s = k.tick(k.s, 76);
  assert.equal(k.s.patients[RM].vitals.hr, 70);
  assert.match(k.s.alerts.find((a) => a.kind === 'vitals').message, /skipped/);
});

test('debrief comparison uses what the vitals were at charting time', () => {
  let { s } = started();
  s = adj(s, HT, { values: { rr: 28 } }, 5);
  s = chart.chartIntervention(s, HT, { interventionId: 'vs-full', fields: { rr: '28' } }, { now: 6 * MIN, user: S1, templatesById, catalogs });
  assert.equal(s.log.at(-1).details.scripted.rr, 28);
});

test('presets are data: relative deltas clamped to limits; patient presets absolute', () => {
  const { presets, limits } = catalogs.vitalsPresets;
  const det = presets.find((p) => p.id === 'deteriorate');
  assert.deepEqual(presetTarget({ bp: '148/88', hr: 96, rr: 20, spo2: 94 }, det, limits), { bp: '123/76', hr: 121, rr: 26, spo2: 89 });
  assert.equal(presetTarget({ spo2: 98 }, { delta: { spo2: 10 } }, limits).spo2, 100, 'clamped');
  assert.deepEqual(presetTarget({}, { values: { hr: 140 } }), { hr: 140 });
  assert.equal(catalogs.vitalsPresets.review, 'proposed');
  assert.deepEqual(cleanValues({ hr: '', bp: ' 90/50 ' }), { bp: '90/50' });
});
