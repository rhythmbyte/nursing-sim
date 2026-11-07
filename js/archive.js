// Past debriefs (UI layer; persistence through storage.js): every finished sim is kept with what its debrief needs,
// the session state, the scenario as it was, and its case seeds (the patients are made again from them, exactly).
// Newest first; the oldest are dropped past MAX (browser storage is small). Full build: stored on the server per
// school / program (SPEC §13).
//   entry = { id (join code), name, scenarioId, endedAt, students, groups, scenario, seeds, state }

import { load, save, remove } from './storage.js';
import { instantiateScenario } from './engine/cases.js';
import { withDefaults } from './engine/settings.js';
import { createRunner } from './engine/runner.js';
import { createStore } from './state.js';

const INDEX = 'archive.index';
const MAX = 12;
const keyOf = (id) => `archive.${id}`;

/** Save (or update) a finished sim's debrief. Returns false if the browser couldn't store it. */
export function archiveSim({ state, scenario, seeds }) {
  const id = state.joinCode;
  if (!id) return false;
  const entry = { id, name: scenario.name, scenarioId: scenario.id, endedAt: Date.now(), students: Object.keys(state.roster || {}).length, groups: scenario.groups.length, scenario, seeds, state };
  if (!save(keyOf(id), entry)) return false;
  const index = (load(INDEX) || []).filter((x) => x.id !== id);
  index.unshift({ id, name: entry.name, endedAt: entry.endedAt, students: entry.students, groups: entry.groups });
  for (const old of index.slice(MAX)) remove(keyOf(old.id));
  save(INDEX, index.slice(0, MAX));
  return true;
}

export const pastDebriefs = () => load(INDEX) || [];
export const loadPastDebrief = (id) => load(keyOf(id));

export function deletePastDebrief(id) {
  remove(keyOf(id));
  save(INDEX, (load(INDEX) || []).filter((x) => x.id !== id));
}

/** A read-only debrief context for an archived sim. */
export function archivedContext(entry, data) {
  const seeds = entry.seeds || {};
  const sc = withDefaults(entry.scenario, data.catalogs);
  const inst = instantiateScenario({ ...sc, seed: seeds.seed ?? sc.seed, variants: { ...(sc.variants || {}), ...(seeds.variants || {}) } }, data.patients, data.catalogs, { nominal: Boolean(seeds.nominal) });
  const scenario = withDefaults(inst.scenario, data.catalogs);
  const templatesById = { ...Object.fromEntries(data.patients.map((p) => [p.id, p])), ...inst.templatesById };
  const store = createStore({ data });
  const ended = entry.state.clock?.endedAt ?? entry.endedAt;
  const runner = createRunner({ store, scenario, templatesById, catalogs: data.catalogs, saved: entry.state, now: () => ended, persist: () => {} });
  return { store, runner, scenario, templatesById, catalogs: data.catalogs, data, archived: true };
}
