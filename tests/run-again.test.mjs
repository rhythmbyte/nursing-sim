// Run again: same scenario, fresh patient variants (a new sim seed); reloads in between keep the same patients.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casesById, catalogs, scenario } from './fixtures.mjs';

test('a new sim gets fresh variants; the same sim keeps them; toggles off keep the cases as written', async () => {
  const mem = {};
  globalThis.window = { localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } };
  try {
    const { instantiateSim, newSimSeeds } = await import('../js/case-seeds.js');
    const library = Object.values(casesById);
    const names = (sc) => Object.values(instantiateSim(sc, library, catalogs, {}).templatesById).map((t) => `${t.demographics.name} ${t.vitals.baseline.bp}`).join('|');
    const first = names(scenario);
    assert.equal(names(scenario), first, 'a reload of the same sim: same patients');
    const seen = new Set([first]);
    for (let i = 0; i < 4; i++) { newSimSeeds(); seen.add(names(scenario)); } // what Run again does (switchScenario)
    assert.ok(seen.size >= 4, 'each run gets new patients');
    newSimSeeds({ demoScenarioId: scenario.id });
    assert.match(names(scenario), /^Robert Miller 148\/88/, 'the demo: cases as written');
    newSimSeeds();
    const off = { ...scenario, settings: { ...scenario.settings, randomizeNames: false, randomizeValues: false, randomizeMeds: false } };
    assert.match(names(off), /^Robert Miller 148\/88/, 'variation off: as written even in a new run');
  } finally { delete globalThis.window; }
});
