import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { monitorView, connections, resolveRhythm, rhythmProblems } from '../js/engine/monitor.js';
import { startCode, setCodeOutcome } from '../js/engine/instructor.js';
import { adjustVitals } from '../js/engine/vitals-control.js';
import { ecgSample, plethSample } from '../js/screens/monitor/waveforms.js';

const INS = { userId: 'instructor', role: 'instructor' };
const S1 = { userId: 'student-1', role: 'student' };
const ctx = (min) => ({ now: min * MIN, user: S1, templatesById, catalogs });
const RM = 'p1-robert-miller'; const DE = 'p5-dorothy-evans'; const LG = 'p4-linda-garcia'; const MW = 'p2-margaret-wilson';
function started() {
  const sc = scenarioWith();
  const refs = collectEvents(session.scenarioPatients(sc).map((p) => p.id), templatesById, sc);
  const s = session.controlClock(session.createSession(sc, templatesById, catalogs), 'start', { now: 0, user: INS });
  return { s, tick: (st, m) => session.tick(st, { now: m * MIN, refs, templatesById, catalogs }).state };
}
const view = (s, pid) => monitorView(s, pid, templatesById[pid], catalogs);

test('rhythms: starter data resolves; aliases work', () => {
  for (const t of Object.values(templatesById)) assert.deepEqual(rhythmProblems(t, catalogs), [], t.id);
  assert.equal(resolveRhythm(catalogs, 'PEA').id, 'pea');
  assert.equal(resolveRhythm(catalogs, 'a-fib').id, 'afib');
  assert.equal(resolveRhythm(catalogs, 'nonsense'), null);
});

test('monitor shows only what is connected; tele order connects ECG; Connect connects all', () => {
  let { s } = started();
  assert.deepEqual(connections(s, RM, templatesById[RM], catalogs), { ecg: true, spo2: false, nibp: false, temp: false }, 'Robert has a telemetry order');
  let v = view(s, RM);
  assert.equal(v.hr, 96); assert.equal(v.spo2, null); assert.equal(v.bp, null); assert.equal(v.rhythm.id, 'sinus');
  const before = view(s, MW);
  assert.equal(before.hr, null, 'Margaret not connected');
  s = chart.connectMonitor(s, MW, {}, ctx(2));
  assert.equal(s.log.at(-1).action, 'monitor-connected');
  v = view(s, MW);
  assert.deepEqual([v.hr, v.spo2, v.connected.nibp], [88, templatesById[MW].vitals.baseline.spo2, true]);
  assert.equal(v.bp, null, 'no NIBP until a cycle or Take BP now');
  s = chart.takeBpNow(s, MW, {}, ctx(3));
  assert.deepEqual([view(s, MW).bp, view(s, MW).bpAtMin], [templatesById[MW].vitals.baseline.bp, 3]);
  for (const k of ['pain', 'gcs', 'tempF']) assert.equal(k in v && v[k] != null, false, `never shows ${k} without a probe`);
});

test('afib for Dorothy; live changes and trends update the monitor; alarms from data limits', () => {
  let { s, tick } = started();
  s = chart.connectMonitor(s, DE, {}, ctx(0));
  assert.equal(view(s, DE).rhythm.id, 'afib');
  s = adjustVitals(s, DE, { values: { hr: 140, spo2: 85, rhythm: 'sinus-tach' } }, { now: MIN, user: INS });
  const v = view(s, DE);
  assert.deepEqual([v.hr, v.spo2, v.rhythm.id], [140, 85, 'sinus-tach']);
  assert.deepEqual(v.alarms.sort(), ['hr', 'spo2']);
  void tick;
});

test('code: arrest rhythm on the monitor, no pulse = no SpO2; ROSC / no ROSC rhythms from settings', () => {
  let { s } = started();
  s = chart.connectMonitor(s, LG, {}, ctx(0));
  s = startCode(s, LG, { rhythm: 'VF' }, { now: 10 * MIN, user: INS });
  let v = view(s, LG);
  assert.deepEqual([v.rhythm.id, v.hr, v.spo2, v.rr, v.pulse], ['vf', null, null, null, false]);
  for (const id of ['vf', 'pvt', 'pea', 'asystole']) assert.equal(resolveRhythm(catalogs, id).pulseless, true, id);
  assert.equal(resolveRhythm(catalogs, 'pulseless VT').id, 'pvt');
  assert.ok(v.alarms.includes('rhythm'));
  const rosc = setCodeOutcome(s, LG, 'rosc', { now: 15 * MIN, user: INS });
  assert.equal(view(rosc, LG).rhythm.id, 'sinus-tach');
  const dead = setCodeOutcome(s, LG, 'no-rosc', { now: 15 * MIN, user: INS });
  assert.deepEqual([dead.patients[LG].alive, view(dead, LG).rhythm.id], [false, 'asystole']);
});

test('waveforms: finite samples; asystole flat; pulseless has no pleth', () => {
  const r = (id) => resolveRhythm(catalogs, id);
  for (const id of ['sinus', 'afib', 'vf', 'asystole', 'pea', 'vt']) {
    for (let t = 0; t < 2; t += 0.01) assert.ok(Number.isFinite(ecgSample(r(id).draw, t % 0.8, t)), id);
  }
  const flat = [0.1, 0.2, 0.3].map((t) => Math.abs(ecgSample(r('asystole').draw, t, t)));
  assert.ok(Math.max(...flat) < 0.05);
  assert.ok(ecgSample(r('sinus').draw, 0.2, 0.2) > 0.5, 'sinus has a QRS at the R peak');
  assert.equal(plethSample(0.3, false), 0);
  assert.ok(plethSample(0.35, true) > 0.3);
});
