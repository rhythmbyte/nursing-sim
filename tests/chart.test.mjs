import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenario, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { prnWarnings, prnOptions } from '../js/engine/prn.js';
import { studentView } from '../js/engine/student-view.js';

const student = { userId: 'student-1', role: 'student' };
const RM = 'p1-robert-miller';
const allKeys = (x, out = new Set()) => {
  if (Array.isArray(x)) x.forEach((i) => allKeys(i, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.add(k); allKeys(v, out); }
  return out;
};

function started() {
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  let s = session.createSession(scenario, templatesById, catalogs);
  s = session.controlClock(s, 'start', { now: 0, user: { userId: 'instructor', role: 'instructor' } });
  return { s, refs };
}
const ctx = (min) => ({ now: min * MIN, user: student, templatesById, catalogs });

test('handoff: opens once, closes with notes and duration', () => {
  let { s } = started();
  s = chart.openHandoff(s, RM, {}, ctx(1));
  assert.equal(chart.openHandoff(s, RM, {}, ctx(2)), s, 'second open is a no-op');
  s = chart.closeHandoff(s, RM, { notes: 'watch BP before nitro' }, ctx(4));
  const h = s.students['student-1'].handoff[RM];
  assert.deepEqual([h.openedAt, h.closedAt, h.notes], [1, 4, 'watch BP before nitro']);
  assert.equal(s.log.at(-1).details.durationMin, 3);
});

test('assessment reveals baseline findings, then later changes on the next assessment', () => {
  let { s, refs } = started();
  s = chart.chartIntervention(s, RM, { interventionId: 'assess-full', fields: { findings: 'A&O x4' } }, ctx(10));
  assert.deepEqual(s.patients[RM].revealed.map((r) => r.source), ['baseline']);
  ({ state: s } = session.tick(s, { now: 76 * MIN, refs, templatesById }));
  assert.equal(s.patients[RM].revealed.length, 1, 'changes stay hidden until the student assesses again');
  s = chart.chartIntervention(s, RM, { interventionId: 'assess-focused', fields: { system: 'cardiac' } }, ctx(78));
  assert.deepEqual(s.patients[RM].revealed.at(-1).findings, templatesById[RM].findings.changes[0].findings);
});

test('delegated assessment does not reveal findings', () => {
  let { s } = started();
  s = chart.chartIntervention(s, RM, { interventionId: 'assess-full', delegatedTo: 'CNA' }, ctx(5));
  assert.equal(s.patients[RM].revealed.length, 0);
  assert.equal(s.log.at(-1).details.delegatedTo, 'CNA');
});

test('orders: acknowledge, then charting a one-time order marks it done', () => {
  let { s, refs } = started();
  ({ state: s } = session.tick(s, { now: 76 * MIN, refs, templatesById }));
  assert.equal(s.patients[RM].orders['o-p1-ecg'].status, 'new');
  s = chart.acknowledgeOrder(s, RM, { orderId: 'o-p1-ecg' }, ctx(77));
  assert.equal(s.patients[RM].orders['o-p1-ecg'].status, 'acknowledged');
  s = chart.chartIntervention(s, RM, { interventionId: 'ecg-12lead', orderId: 'o-p1-trop' }, ctx(78));
  assert.equal(s.patients[RM].orders['o-p1-trop'].status, 'done', 'once order done when charted against it');
  s = chart.chartIntervention(s, RM, { interventionId: 'ecg-12lead', orderId: 'o-p1-ecg' }, ctx(79));
  assert.equal(s.patients[RM].orders['o-p1-ecg'].status, 'acknowledged', 'PRN order stays open');
});

test('PRN nitro: needs a BP check first, max 3, every 5 min', () => {
  let { s } = started();
  const ntg = templatesById[RM].orders.find((o) => o.id === 'o-p1-ntg');
  const warn = (min) => prnWarnings(ntg, { log: s.log, patientId: RM, simMin: min, ...prnOptions(catalogs, s.patients[RM], s.settings) }).map((w) => w.code);
  assert.deepEqual(warn(10), ['requires']);
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-bp', fields: { bp: '150/90' } }, ctx(10));
  assert.deepEqual(warn(11), []);
  s = chart.medAction(s, RM, { orderId: 'o-p1-ntg', result: 'given' }, ctx(11));
  assert.deepEqual(warn(13), ['interval']);
  s = chart.medAction(s, RM, { orderId: 'o-p1-ntg', result: 'given' }, ctx(16));
  s = chart.medAction(s, RM, { orderId: 'o-p1-ntg', result: 'given' }, ctx(21));
  assert.ok(warn(30).includes('max'));
  assert.ok(warn(30).includes('requires'), 'BP check from 20 min ago is stale');
});

test('MAR hold is logged with its reason', () => {
  let { s } = started();
  s = chart.medAction(s, RM, { orderId: 'o-p1-asa', result: 'held', reason: 'NPO for procedure' }, ctx(3));
  assert.deepEqual(s.log.at(-1).details, { orderId: 'o-p1-asa', med: 'Aspirin 81 mg PO', result: 'held', reason: 'NPO for procedure', warnings: [] });
  assert.throws(() => chart.medAction(s, RM, { orderId: 'o-p1-tele', result: 'given' }, ctx(3)));
});

test('student view drops instructor-only fields (allow-list)', () => {
  for (const t of Object.values(templatesById)) {
    const v = studentView(t);
    for (const key of ['debrief', 'reviewNotes', 'source', 'codeBranch', 'outcome', 'events', 'findings', 'priorityLabel', 'tag']) {
      assert.equal(key in v, false, `${t.id}: ${key}`);
    }
    const keys = allKeys(v);
    for (const key of ['tier', 'review', 'delegable', 'parameter', 'teachingNote', 'shouldRecognize', 'keyframes']) {
      assert.equal(keys.has(key), false, `${t.id}: ${key}`);
    }
  }
  assert.equal(studentView(templatesById[RM], { showTags: true }).tag, 'red');
});

test('B10: entered in error: own entries only, reason required, rules and PRN ignore it, nothing deleted', async () => {
  const { evaluateRules } = await import('../js/engine/rules/index.js');
  const { activeLog } = await import('../js/engine/struck.js');
  const { buildDebrief } = await import('../js/engine/debrief.js');
  let { s } = started();
  s = chart.chartIntervention(s, RM, { interventionId: 'vs-full', fields: { rr: '18' } }, ctx(5));
  s = chart.medAction(s, RM, { orderId: 'o-p1-ntg', result: 'given', warnings: [{ code: 'requires' }] }, ctx(6));
  const med = s.log.at(-1);
  const rctx = { templatesById, catalogs, simMin: 10, studentIdsForGroup: () => ['student-1'], groupOfStudent: () => 'g1' };
  assert.ok(evaluateRules(s, rctx).some((f) => f.ruleId === 'prn-limit'));
  assert.throws(() => chart.strikeEntry(s, RM, { logId: med.id, reason: ' ' }, ctx(7)), /reason/);
  assert.throws(() => chart.strikeEntry(s, RM, { logId: med.id, reason: 'x' }, { ...ctx(7), user: { userId: 'student-2', role: 'student' } }), /your own/);
  s = chart.strikeEntry(s, RM, { logId: med.id, reason: 'wrong patient' }, ctx(7));
  assert.equal(s.log.find((l) => l.id === med.id).details.med, 'Nitroglycerin 0.4 mg SL', 'original kept');
  assert.equal(s.log.at(-1).action, 'entered-in-error');
  assert.ok(!evaluateRules(s, rctx).some((f) => f.ruleId === 'prn-limit'), 'struck dose no longer flags');
  assert.ok(!activeLog(s).some((l) => l.id === med.id));
  const vs = s.log.find((l) => l.details?.interventionId === 'vs-full');
  s = chart.strikeEntry(s, RM, { logId: vs.id, reason: 'charted on wrong patient' }, ctx(8));
  assert.equal(s.patients[RM].flowsheet.find((r) => r.logId === vs.id).logId, vs.id, 'flowsheet row linked');
  const d = buildDebrief(s, 'student-1', rctx);
  assert.equal(d.vitalsCompare.length, 0, 'struck vitals not compared');
  assert.ok(d.timeline.some((t) => t.struck?.reason === 'wrong patient'), 'debrief still shows it, marked');
});

test('B11: report sheet data uses the student view and live orders; hourly grid to end of shift', async () => {
  const { sheetData } = await import('../js/screens/student/report-sheet.js');
  let { s } = started();
  s = chart.openHandoff(s, RM, {}, ctx(0));
  s = chart.closeHandoff(s, RM, { notes: 'BP before nitro' }, ctx(1));
  const d = sheetData(s, 'student-1', RM, studentView(templatesById[RM]));
  assert.equal(d.handoffNotes, 'BP before nitro');
  assert.equal(d.allergies, 'Penicillin (Rash)');
  assert.ok(d.orders.includes('Admit to telemetry'));
  assert.deepEqual([d.times[0], d.times.at(-1), d.times.length], ['07:00', '15:00', 9]);
  assert.equal(JSON.stringify(d).includes('shouldRecognize'), false);
});
