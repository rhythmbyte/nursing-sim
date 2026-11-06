import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';
import { lockoutSec, taskPlan, durationSec, taskKey } from '../js/engine/tasks.js';
import { timelinessItems } from '../js/engine/timeliness.js';

const S1 = { userId: 'student-1', role: 'student' };
const INS = { userId: 'instructor', role: 'instructor' };
const LG = 'p4-linda-garcia'; const RM = 'p1-robert-miller';

function rig(settings = {}) {
  let t = 0;
  const runner = createRunner({ store: createStore(), scenario: scenarioWith(settings), templatesById, catalogs, now: () => t * MIN });
  runner.clock('start', INS);
  return { runner, at: (min) => { t = min; runner.tick(); } };
}

test('durations: catalog, patient and scenario overrides; lockout by mode', () => {
  const k = taskKey('chartIntervention', { interventionId: 'assess-full' }, catalogs);
  assert.equal(durationSec(k, { settings: {}, template: {}, catalogs }), 480);
  assert.equal(durationSec(k, { settings: {}, template: { taskDurations: { 'assess-full': 300 } }, catalogs }), 300);
  assert.equal(durationSec(k, { settings: { taskDurations: { 'assess-full': 60 } }, template: { taskDurations: { 'assess-full': 300 } }, catalogs }), 60);
  assert.equal(durationSec(taskKey('medAction', { result: 'given' }, catalogs), { settings: {}, catalogs }), 180);
  assert.equal(lockoutSec(480, { taskTimerMode: 'screen-only' }), 480);
  assert.equal(lockoutSec(480, { taskTimerMode: 'manikin', taskTimerManikinFactor: 0.25, taskTimerMinLockoutSec: 5 }), 120);
  assert.equal(lockoutSec(10, { taskTimerMode: 'manikin', taskTimerManikinFactor: 0.25, taskTimerMinLockoutSec: 5 }), 5);
  assert.equal(lockoutSec(480, { taskTimerMode: 'off' }), 0);
  assert.equal(taskKey('chartIntervention', { interventionId: 'rapid-response' }, catalogs), null, 'allowed while busy: never a task');
  assert.equal(taskKey('chartIntervention', { interventionId: 'vs-full', delegatedTo: 'CNA' }, catalogs), null, 'delegated work is the helper\'s');
});

test('busy: one task at a time across patients; done counts at the finish; call lights still work', () => {
  const { runner, at } = rig({ taskTimerMode: 'screen-only' });
  at(76); // Robert's chest pain is back (08:15): ECG ordered, call light on
  const r = runner.chart('chartIntervention', RM, { interventionId: 'ecg-12lead', orderId: 'o-p1-ecg' }, S1);
  assert.equal(r.task.lockSec, 300);
  assert.equal(runner.busy('student-1').label, '12-lead ECG');
  assert.throws(() => runner.chart('medAction', LG, { orderId: 'o-p4-ceftriaxone', result: 'given' }, S1), /You're busy: 12-lead ECG/);
  runner.chart('chartIntervention', LG, { interventionId: 'rapid-response' }, S1); // allowed while busy
  runner.answerCallLight(RM, S1); // call lights never wait
  const item = () => timelinessItems(runner.state, runner.rulesCtx()).find((i) => i.orderId === 'o-p1-ecg');
  at(80);
  assert.equal(item().doneAt, null, 'not done while the ECG is still being done');
  assert.equal(runner.busy('student-1').leftSec, 60);
  at(82);
  assert.equal(runner.busy('student-1'), null);
  assert.equal(item().doneAt, 81, 'done when the 5-min task finished (76 + 5)');
  assert.deepEqual(runner.state.log.filter((l) => l.userId === 'student-1').map((l) => l.action).filter((a) => a.startsWith('task') || a === 'intervention'),
    ['task-started', 'intervention', 'intervention', 'task-finished']);
});

test('interrupt (nothing charted) and instructor "end now" (counts as done)', () => {
  const { runner, at } = rig({ taskTimerMode: 'screen-only' });
  at(10);
  runner.chart('chartAssessment', RM, { toolId: 'gcs', answers: { eye: 4, verbal: 5, motor: 6 } }, S1);
  at(10.5); runner.interruptTask(S1);
  assert.equal(runner.busy('student-1'), null);
  assert.ok(!runner.state.log.some((l) => l.action === 'assessment'), 'interrupted: not charted');
  runner.chart('chartIntervention', LG, { interventionId: 'assess-full' }, S1);
  at(12); runner.endTaskNow('student-1', INS);
  const e = runner.state.log.find((l) => l.action === 'intervention' && l.details.interventionId === 'assess-full');
  assert.equal(e.simMin, 12);
  assert.ok(runner.state.log.some((l) => l.action === 'task-ended-early' && l.userId === 'instructor'));
  const off = rig({ taskTimerMode: 'off' });
  off.at(5);
  assert.deepEqual(off.runner.chart('chartIntervention', LG, { interventionId: 'assess-full' }, S1), { done: true });
});

test('manikin mode: short lockout, then the action lands; reactions see it at the finish', () => {
  const { runner, at } = rig({ taskTimerMode: 'manikin', taskTimerManikinFactor: 0.25, taskTimerMinLockoutSec: 5 });
  at(61);
  runner.chart('chartIntervention', LG, { interventionId: 'o2-apply', fields: { device: 'NC', lpm: '6' } }, S1);
  assert.equal(runner.state.patients[LG].script.state, 'desaturating', 'not yet');
  at(61.3);
  assert.equal(runner.state.patients[LG].script.state, 'in-target', 'O₂ 60 s × 0.25 = 15 s, then the reaction fires');
});
