import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { joinSim } from '../js/engine/roster.js';
import { studentIdsForGroup } from '../js/engine/assignment.js';
import { evaluateRules } from '../js/engine/rules/index.js';
import { tagFor, timelinessItems, medDueTimes, timelinessCounts } from '../js/engine/timeliness.js';
import { commandCenter, groupStatus, vitalsTrend } from '../js/engine/command-center.js';
import { adjustVitals } from '../js/engine/vitals-control.js';

const INS = { userId: 'instructor', role: 'instructor' };
const S1 = { userId: 'student-1', role: 'student' };
const RM = 'p1-robert-miller'; const DE = 'p5-dorothy-evans';
function started() {
  const sc = scenarioWith();
  const refs = collectEvents(session.scenarioPatients(sc).map((p) => p.id), templatesById, sc);
  let s = session.createSession(sc, templatesById, catalogs, { joinCode: 'X' });
  s = joinSim(s, { userId: 'student-1', name: 'Ana', code: 'X' }, { scenario: sc, now: 0 }).state;
  s = session.controlClock(s, 'start', { now: 0, user: INS });
  const ctx = (m, st) => ({ templatesById, catalogs, simMin: m, studentIdsForGroup: (g) => studentIdsForGroup(st.roster, g), groupOfStudent: (u) => st.roster[u]?.groupId });
  return { s, sc, ctx, tick: (st, m) => session.tick(st, { now: m * MIN, refs, templatesById, catalogs }).state };
}
const c = (min) => ({ now: min * MIN, user: S1, templatesById, catalogs });

test('tags from data thresholds (tier 1: late > 5, very late > 15)', () => {
  const th = catalogs.rules.rules.timeliness.orders['1'];
  assert.deepEqual([3, 8, 20].map((m) => tagFor(m, true, th)), ['on-time', 'late', 'very-late']);
  assert.deepEqual([3, 8, 20].map((m) => tagFor(m, false, th)), ['open', 'open-late', 'open-very-late']);
  assert.equal(catalogs.rules.rules.timeliness.review, 'proposed');
});

test('order timeliness and tier-timeout never disagree', () => {
  let { s, ctx, tick } = started();
  s = tick(s, 76); // ECG order (tier 1) active at 75
  for (const [m, tag] of [[79, 'open'], [83, 'open-late'], [95, 'open-very-late']]) {
    const it = timelinessItems(s, ctx(m, s)).find((i) => i.orderId === 'o-p1-ecg');
    assert.equal(it.tag, tag, `at ${m}`);
    const flagged = evaluateRules(s, ctx(m, s)).some((f) => f.ruleId === 'tier-timeout' && /12-lead ECG/.test(f.message));
    assert.equal(flagged, tag !== 'open', `flag agrees at ${m}`);
  }
  s = chart.chartIntervention(s, RM, { interventionId: 'ecg-12lead', orderId: 'o-p1-ecg' }, c(83));
  const done = timelinessItems(s, ctx(100, s)).find((i) => i.orderId === 'o-p1-ecg');
  assert.deepEqual([done.tag, done.minutes, done.doneBy], ['late', 8, 'student-1']);
});

test('scheduled meds: due times and late/very late; a struck dose does not count as done', () => {
  const apix = templatesById[DE].orders.find((o) => o.id === 'o-p5-apixaban');
  assert.deepEqual(medDueTimes(apix, { activeAtMin: 0 }, 200), [120]);
  assert.deepEqual(medDueTimes({ frequencyMin: 720 }, { activeAtMin: 155 }, 900), [155, 875]);
  let { s, ctx } = started();
  const med = (st, m) => timelinessItems(st, ctx(m, st)).find((i) => i.orderId === 'o-p5-apixaban');
  assert.equal(med(s, 140).tag, 'open');
  assert.equal(med(s, 160).tag, 'open-late');
  s = chart.medAction(s, DE, { orderId: 'o-p5-apixaban', result: 'held', reason: 'neuro change' }, c(170));
  assert.deepEqual([med(s, 200).tag, med(s, 200).minutes, med(s, 200).result], ['late', 50, 'held'], 'late > 30, very late > 60');
  s = chart.strikeEntry(s, DE, { logId: s.log.at(-1).id, reason: 'wrong order' }, c(171));
  assert.equal(med(s, 200).tag, 'open-very-late', 'struck action ignored (80 min open)');
});

test('call lights and alarms use their own thresholds; rules agree', () => {
  let { s, ctx, tick } = started();
  s = tick(s, 76);
  s = session.answerCallLight(s, RM, { now: 82 * MIN, user: S1 });
  const light = timelinessItems(s, ctx(90, s)).find((i) => i.kind === 'callLight');
  assert.deepEqual([light.tag, light.minutes], ['late', 7]);
  assert.equal(evaluateRules(s, ctx(90, s)).find((f) => f.ruleId === 'call-light-response').severity, 'amber');
  assert.deepEqual(timelinessCounts([light]), { onTime: 0, late: 1, veryLate: 0, open: 0 });
});

test('group status from data and command center ordering', () => {
  const rule = catalogs.rules.rules.timeliness.groupStatus;
  assert.equal(groupStatus({ veryLate: 1 }, rule), 'needs-attention');
  assert.equal(groupStatus({ late: 1 }, rule), 'falling-behind');
  assert.equal(groupStatus({}, rule), 'on-track');
  let { s, sc, ctx, tick } = started();
  s = chart.openPatient(s, RM, {}, c(1));
  s = tick(s, 96); // ECG very late, call lights unanswered
  const cc = commandCenter(s, ctx(96, s), sc);
  assert.equal(cc[0].status, 'needs-attention');
  assert.deepEqual(cc[0].students, [{ userId: 'student-1', name: 'Ana', inPatient: RM }]);
  assert.ok(cc[0].counts.veryLate >= 1 && cc[0].counts.callLights >= 1 && cc[0].counts.redFlags >= 1);
  assert.equal(cc[0].patients[0].worst.tag, 'open-very-late', 'worst patient first');
});

test('vitals trend arrow (data thresholds)', () => {
  let { s } = started();
  s = adjustVitals(s, DE, { values: { spo2: 88 } }, { now: 10 * MIN, user: INS });
  assert.equal(vitalsTrend(s.patients[DE], 12, catalogs.vitals.trend), 'worse');
  assert.equal(vitalsTrend(s.patients[RM], 12, catalogs.vitals.trend), 'steady');
});
