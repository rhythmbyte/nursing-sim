// This sim's case seeds (UI layer; persistence through storage.js). A sim instantiates every case from one sim seed
// plus per-patient rerolls, so its patients stay the same through reloads, rejoins and the debrief. A new sim
// (switching scenario, Sim setup, Start demo sim) gets a fresh seed; "Reset sim" keeps it.
//   ui.cases = { scenarioId, seed, nominal?, variants: { instanceId: { seed } } }
// Full build: stored on the session record on the server (SPEC §13).

import { load, save, remove } from './storage.js';
import { instantiateScenario } from './engine/cases.js';
import { effectiveSettings } from './engine/settings.js';

const KEY = 'ui.cases';
const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** The seeds for a scenario, created on first use. `hadSession`: an older sim already running keeps its old patients. */
export function caseSeeds(scenario, { hadSession = false } = {}) {
  let c = load(KEY);
  if (!c || c.scenarioId !== scenario.id) {
    c = { scenarioId: scenario.id, seed: scenario.seed ?? (hadSession ? scenario.id : randomSeed()), variants: {} };
    save(KEY, c);
  }
  return c;
}

/** Scenario → { scenario, templatesById } with this sim's seeds applied. */
export function instantiateSim(scenario, patients, catalogs, opts) {
  const c = caseSeeds(scenario, opts);
  // Variation toggles (randomizeNames / Values / Meds) come from the merged settings; the demo is the cases as written.
  return instantiateScenario({ ...scenario, settings: effectiveSettings(scenario.settings, catalogs), seed: c.seed, variants: { ...(scenario.variants || {}), ...c.variants } }, patients, catalogs, { nominal: Boolean(c.nominal) });
}

/** A new sim: forget the seeds (the next instantiation picks fresh ones). `demo`: the cases as written in their files. */
export function newSimSeeds({ demoScenarioId = null } = {}) {
  if (demoScenarioId) save(KEY, { scenarioId: demoScenarioId, seed: 'demo', nominal: true, variants: {} });
  else remove(KEY);
}

/** A different variant for one patient (before the sim starts). */
export function reroll(instanceId) {
  const c = load(KEY);
  if (!c) return;
  c.variants = { ...(c.variants || {}), [instanceId]: { seed: randomSeed() } };
  save(KEY, c);
}

/** Back to the sim's own variant for this patient (or the case's locked one). */
export function clearReroll(instanceId) {
  const c = load(KEY);
  if (!c?.variants?.[instanceId]) return;
  delete c.variants[instanceId];
  save(KEY, c);
}

/** Fingerprint of the instantiated patients (seeds per instance), stored on the session to notice a reroll. */
export const caseKey = (templatesById) => JSON.stringify(Object.entries(templatesById).filter(([, t]) => t.instance).map(([id, t]) => [id, t.instance.seed, t.instance.nominal ? 1 : 0]));
