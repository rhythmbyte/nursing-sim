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

test('debrief: task times, busy vs idle, interrupted, what went late while busy', () => {
  const { runner, at } = rig({ taskTimerMode: 'screen-only' });
  runner.join('student-1', 'Ana', runner.state.joinCode);
  at(73);
  runner.chart('chartIntervention', LG, { interventionId: 'assess-full' }, S1); // 8 min: 73–81; Robert's call light lights at 75
  at(82);
  runner.chart('chartAssessment', RM, { toolId: 'nihss', answers: {} }, S1);
  at(83); runner.interruptTask(S1);
  const d = runner.debrief('student-1');
  assert.deepEqual(d.tasks.rows.map((r) => [r.label, r.minutes, r.outcome]), [['Head-to-toe assessment', 8, 'finished'], ['NIH Stroke Scale (NIHSS)', 1, 'interrupted']]);
  assert.equal(d.tasks.busyMin, 9);
  assert.equal(d.tasks.interrupted, 1);
  assert.ok(d.tasks.waiting.some((w) => w.kind === 'callLight' && w.during === 'Head-to-toe assessment'), 'Robert\'s call light went late (5 min) at 08:20 during the head-to-toe');
});

test('pause: step away (free), do something else, resume with the time left; one paused at a time; drop', () => {
  const { runner, at } = rig({ taskTimerMode: 'screen-only' });
  at(10);
  runner.chart('chartIntervention', LG, { interventionId: 'assess-full' }, S1); // 8 min
  at(13); runner.pauseTask(S1);
  assert.equal(runner.busy('student-1'), null, 'free while paused');
  assert.equal(runner.paused('student-1').leftSec, 300);
  runner.chart('chartIntervention', RM, { interventionId: 'vs-bp' }, S1); // 45 s, can't pause a second while one is paused
  assert.throws(() => runner.pauseTask(S1), /already paused Head-to-toe/);
  assert.throws(() => runner.resumeTask(S1), /You're busy/);
  at(14); runner.resumeTask(S1);
  assert.equal(runner.busy('student-1').leftSec, 300);
  at(18.5);
  assert.ok(runner.busy('student-1'), 'still 0.5 min to go (3 + 4.5 of 8 active)');
  at(19.1);
  const done = runner.state.log.find((l) => l.action === 'task-finished' && l.details.label === 'Head-to-toe assessment');
  assert.deepEqual([done.simMin, done.details.minutes], [19, 8], 'active time only');
  const rev = runner.state.log.map((l) => l.action).filter((a) => a.startsWith('task-'));
  assert.deepEqual(rev, ['task-started', 'task-paused', 'task-started', 'task-finished', 'task-resumed', 'task-finished']);
  runner.chart('chartIntervention', LG, { interventionId: 'foley' }, S1);
  at(20); runner.pauseTask(S1); runner.dropPausedTask(S1);
  assert.ok(runner.state.log.at(-1).details.dropped);
  assert.equal(runner.paused('student-1'), null);
});

test('debrief: paused time is not busy time, and nothing "went late while busy" during the pause', () => {
  const { runner, at } = rig({ taskTimerMode: 'screen-only' });
  runner.join('student-1', 'Ana', runner.state.joinCode);
  at(70); runner.chart('chartIntervention', LG, { interventionId: 'assess-full' }, S1);
  at(72); runner.pauseTask(S1); // Robert's call light lights at 75 and goes late at 80, while the task is paused
  at(85); runner.resumeTask(S1);
  at(92);
  const d = runner.debrief('student-1');
  assert.deepEqual(d.tasks.rows.map((r) => [r.minutes, r.outcome, r.paused]), [[8, 'finished', true]]);
  assert.ok(!d.tasks.waiting.some((w) => w.kind === 'callLight'), 'the call light went late during the pause, not while busy');
});

test('break: pauses the sim with a "back at" time; Resume ends it; logged', () => {
  let t = 0;
  const runner = createRunner({ store: createStore(), scenario: scenarioWith(), templatesById, catalogs, now: () => t });
  runner.clock('start', INS);
  t = 10 * MIN; runner.tick();
  runner.startBreak(15, INS);
  assert.equal(runner.state.clock.status, 'paused');
  assert.equal(runner.state.break.until, 10 * MIN + 15 * MIN);
  t = 22 * MIN; runner.tick();
  assert.equal(Math.round(runner.simMin()), 10, 'sim time stands still during the break');
  runner.clock('resume', INS);
  assert.deepEqual([runner.state.break, runner.state.clock.status], [null, 'running']);
  assert.deepEqual(runner.state.log.filter((l) => l.action.startsWith('break')).map((l) => [l.action, l.details.actualMin ?? l.details.minutes]), [['break-started', 15], ['break-ended', 12]]);
});
