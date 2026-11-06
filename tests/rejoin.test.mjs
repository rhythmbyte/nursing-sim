import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';

const INS = { userId: 'instructor', role: 'instructor' };
const S1 = { userId: 'student-1', role: 'student' };
function rig() {
  let t = 0;
  const runner = createRunner({ store: createStore(), scenario: scenarioWith({ taskTimerMode: 'screen-only' }), templatesById, catalogs, now: () => t * MIN, rng: (() => { let x = 0.3; return () => (x = (x * 9301 + 0.49297) % 1); })() });
  runner.clock('start', INS);
  return { runner, at: (m) => { t = m; runner.tick(); } };
}

test('rejoin with the same name: same userId and group, everything still there; token or instructor approval', () => {
  const { runner, at } = rig();
  const code = runner.state.joinCode;
  assert.equal(runner.join('student-1', 'Ana', code), null);
  const token = runner.lastJoin().token;
  assert.ok(token && token.length >= 12, 'the device gets a rejoin token');
  const pid = Object.keys(runner.state.patients)[0];
  at(10);
  runner.chart('openHandoff', pid, {}, S1);
  runner.chart('closeHandoff', pid, { notes: 'mine' }, S1);
  runner.chart('chartIntervention', pid, { interventionId: 'assess-full' }, S1); // busy 8 min
  runner.chart('chartIntervention', pid, { interventionId: 'vs-full', delegatedTo: 'CNA' }, S1);
  const before = JSON.stringify({ roster: runner.state.roster, students: runner.state.students, delegations: runner.state.patients[pid].delegations });
  at(12);
  // same device (reload): "Ana" again → rejoined, not "already joined", no duplicate
  assert.equal(runner.join('student-1', 'ana', code), null);
  assert.equal(runner.lastJoin().rejoinAs, 'student-1');
  // another device with the token
  assert.equal(runner.join('student-2', 'Ana', code, token), null);
  assert.equal(runner.lastJoin().rejoinAs, 'student-1');
  assert.equal(Object.keys(runner.state.roster).length, 1, 'no duplicate student');
  assert.equal(JSON.stringify({ roster: runner.state.roster, students: runner.state.students, delegations: runner.state.patients[pid].delegations }), before, 'identity, handoff, running task and delegation unchanged');
  assert.equal(runner.busy('student-1').label, 'Head-to-toe assessment', 'the task timer is still running');
  // another device without the token → instructor approves
  assert.match(runner.join('student-3', 'Ana', code), /instructor will confirm/);
  const req = runner.state.rejoinRequests.find((q) => q.status === 'pending');
  assert.deepEqual([req.userId, req.fromUserId], ['student-1', 'student-3']);
  runner.decideRejoin(req.id, true, INS);
  assert.equal(runner.state.rejoinRequests[0].status, 'approved');
  assert.deepEqual(runner.state.log.filter((l) => /rejoin/.test(l.action)).map((l) => l.action), ['student-rejoined', 'student-rejoined', 'rejoin-requested', 'rejoin-approved']);
});

test('reconnect after a reload is logged with the time away; reflection and handoff stay done', () => {
  const { runner, at } = rig();
  runner.join('student-1', 'Ana', runner.state.joinCode);
  at(5);
  runner.reconnected(S1, 2.5);
  assert.deepEqual(runner.state.log.at(-1).details, { awayMin: 2.5 });
  runner.clock('end', INS);
  runner.submitReflection('student-1', { 'first-patient': 'Robert' }, S1);
  assert.ok(runner.state.reflections['student-1'], 'submitted once; the form checks this and does not reappear');
});
