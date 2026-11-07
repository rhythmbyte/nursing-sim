// Attention queue: what the instructor might act on now, most urgent first; autopilot patients stay quiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenario, MIN } from './fixtures.mjs';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';
import { commandCenter } from '../js/engine/command-center.js';
import { evaluateRules } from '../js/engine/rules/index.js';
import { attentionQueue, attentionPatients } from '../js/engine/attention.js';

function sim() {
  let now = 0;
  const runner = createRunner({ store: createStore(), scenario, templatesById, catalogs, now: () => now });
  const I = { userId: 'instructor', role: 'instructor' };
  runner.join('s1', 'Ana', runner.state.joinCode);
  runner.clock('start', I);
  return { runner, I, at: (m) => { now = m * MIN; runner.tick(); } };
}
const queueOf = (runner, state = runner.state) => { const ctx = runner.rulesCtx(); return attentionQueue(state, ctx, commandCenter(state, ctx, scenario), evaluateRules(state, ctx)); };

test('queue: call lights, alarms and worsening patients, most urgent first; stable patients stay out', () => {
  const { runner, at } = sim();
  at(2);
  assert.deepEqual(queueOf(runner).filter((q) => q.kind !== 'late'), [], 'a quiet start has nothing urgent');
  at(78); // Robert's chest pain is back (call light at 08:15), Linda deteriorated at 08:00
  const q = queueOf(runner);
  const kinds = q.map((x) => x.kind);
  assert.ok(kinds.includes('callLight'));
  assert.ok(q.every((x, i) => i === 0 || q[i - 1].urgency >= x.urgency), 'sorted by urgency');
  const light = q.find((x) => x.kind === 'callLight' && x.patientId === 'p1-robert-miller');
  assert.ok(light && /Call light \d+ min/.test(light.label));
  const pids = attentionPatients(q);
  assert.ok(pids.has('p1-robert-miller'));
  assert.ok(!pids.has('p3-harold-thompson'), 'a stable patient is not in the queue');
});

test('autopilot: the patient raises nothing but a code or a red flag', () => {
  const { runner, at } = sim();
  at(78);
  const st = { ...runner.state, autopilot: { 'p1-robert-miller': true } };
  const q = queueOf(runner, st);
  assert.ok(!q.some((x) => x.patientId === 'p1-robert-miller' && !['code', 'redFlag'].includes(x.kind)));
});
