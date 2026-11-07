// Instructor Home helpers: recent items and past debriefs (archive), with in-memory browser storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/engine/runner.js';
import { templatesById, catalogs, scenario, casesById } from './fixtures.mjs';

function withStorage(fn) {
  const mem = {};
  globalThis.window = { localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
  return fn(mem).finally(() => { delete globalThis.window; });
}

test('recent: newest first, one entry per item, at most 8', () => withStorage(async () => {
  const { noteRecent, recentItems, forgetRecent } = await import('../js/recent.js');
  for (let i = 0; i < 10; i++) noteRecent('sim', `s${i}`, `Sim ${i}`, 'Set up');
  noteRecent('sim', 's5', 'Sim 5', 'Set up');
  const r = recentItems();
  assert.equal(r.length, 8);
  assert.equal(r[0].id, 's5');
  assert.equal(r.filter((x) => x.id === 's5').length, 1);
  forgetRecent('sim', 's5');
  assert.ok(!recentItems().some((x) => x.id === 's5'));
}));

test('past debriefs: a finished sim is archived and its debrief is rebuilt read-only with the same patients', () => withStorage(async () => {
  const { archiveSim, pastDebriefs, loadPastDebrief, deletePastDebrief, archivedContext } = await import('../js/archive.js');
  const { createRunner } = await import('../js/engine/runner.js');
  const { createStore } = await import('../js/state.js');
  const { instantiateScenario } = await import('../js/engine/cases.js');
  const library = Object.values(casesById);
  const seeds = { seed: 'arch', variants: {} };
  const inst = instantiateScenario({ ...scenario, seed: seeds.seed }, library, catalogs);
  let now = 0;
  const runner = createRunner({ store: createStore(), scenario: inst.scenario, templatesById: { ...templatesById, ...inst.templatesById }, catalogs, now: () => now });
  const I = { userId: 'instructor', role: 'instructor' };
  runner.join('s1', 'Ana', runner.state.joinCode);
  runner.clock('start', I); now = 30 * 60000; runner.tick(); runner.clock('end', I);
  assert.ok(archiveSim({ state: runner.state, scenario, seeds }));
  assert.equal(pastDebriefs()[0].id, runner.state.joinCode);
  assert.equal(pastDebriefs()[0].students, 1);
  const ctx = archivedContext(loadPastDebrief(runner.state.joinCode), { catalogs, patients: library });
  assert.equal(ctx.runner.state.clock.status, 'ended');
  assert.equal(ctx.templatesById['p1-robert-miller'].demographics.name, inst.templatesById['p1-robert-miller'].demographics.name, 'same patients from the seeds');
  assert.deepEqual(ctx.runner.debrief('s1').counts, runner.debrief('s1').counts);
  // Archiving again (a late reflection) updates the same entry.
  assert.ok(archiveSim({ state: runner.state, scenario, seeds }));
  assert.equal(pastDebriefs().length, 1);
  deletePastDebrief(runner.state.joinCode);
  assert.equal(pastDebriefs().length, 0);
}));
