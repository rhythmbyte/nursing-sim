// The real data loader in Node: fetch reads data/ from disk; localStorage is an in-memory stub.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.window = { localStorage: {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i], get length() { return mem.size; },
} };
globalThis.fetch = async (url) => {
  try { const text = readFileSync(new URL(`../${url}`, import.meta.url), 'utf8'); return { ok: true, json: async () => JSON.parse(text) }; }
  catch { return { ok: false, status: 404 }; }
};
const { loadAll, saveLocal } = await import('../js/data-loader.js');
const { clearAll, save, load } = await import('../js/storage.js');
beforeEach(() => mem.clear());

test('loader: all starter data loads with no problems', async () => {
  const d = await loadAll();
  assert.deepEqual(d.problems, []);
  assert.equal(d.patients.length, 6);
  assert.ok(d.catalogs.rhythms && d.catalogs.help && d.catalogs.scenarioDefaults);
});

test('loader: a valid browser edit overlays the file version', async () => {
  const first = await loadAll();
  const t = structuredClone(first.patients.find((p) => p.id === 'p3-harold-thompson'));
  t.priorityLabel = 'Edited here';
  assert.deepEqual(saveLocal('patient', t, first.schemas), []);
  const d = await loadAll();
  assert.equal(d.patients.find((p) => p.id === t.id).priorityLabel, 'Edited here');
  assert.ok(d.local.patients.has(t.id));
});

test('loader: a broken browser edit is skipped and the file version is used (no crash)', async () => {
  const first = await loadAll();
  const t = structuredClone(first.patients.find((p) => p.id === 'p3-harold-thompson'));
  t.orders[0].interventionIds = ['teleport'];
  save('library.patients', { [t.id]: t });
  const d = await loadAll();
  assert.notEqual(d.patients.find((p) => p.id === t.id).orders[0].interventionIds[0], 'teleport');
  assert.match(d.problems[0].file, /file version is used instead/);
  assert.equal(d.scenarios.length >= 1, true, 'scenario still loads');
});

test('loader: a browser-only scenario whose patients are all missing is left out', async () => {
  const first = await loadAll();
  const sc = { ...structuredClone(first.scenarios[0]), id: 'sc-ghost', groups: [{ id: 'g1', name: 'G', studentCount: 1, patients: ['p-nobody'] }] };
  save('library.scenarios', { [sc.id]: sc });
  const d = await loadAll();
  assert.ok(!d.scenarios.some((s) => s.id === 'sc-ghost'));
  assert.ok(d.problems.some((p) => /left out: no patients left/.test(p.file)));
});

test('storage: clearAll removes only this app\'s keys', () => {
  save('x', 1); mem.set('other-app', 'keep');
  clearAll();
  assert.equal(load('x'), null);
  assert.equal(mem.get('other-app'), 'keep');
});
