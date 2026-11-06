// Shared test data: real starter content, all catalogs, scenario with merged settings.
import { readFileSync } from 'node:fs';
import { withDefaults } from '../js/engine/settings.js';
import { instantiate, fileIdentity } from '../js/engine/cases.js';

export const load = (rel) => JSON.parse(readFileSync(new URL(`../data/${rel}`, import.meta.url), 'utf8'));
const manifest = load('manifest.json');

export const catalogs = Object.fromEntries(Object.entries(manifest.catalogs).map(([k, rel]) => [k, load(rel)]));
/** The starter files as written: case templates with placeholders and ranges. */
export const casesById = Object.fromEntries(manifest.patients.map((rel) => load(rel)).map((p) => [p.id, p]));
/** What most tests use: each case instantiated as its nominal variant with the file's own name, sex and age (the round trip). */
export const templatesById = Object.fromEntries(Object.values(casesById).map((t) => [t.id, instantiate(t, { seed: 'test', catalogs, identity: fileIdentity(t), nominal: true })]));
const rawScenario = load('scenarios/busy-medsurg-shift.json');

/** The starter scenario with optional setting overrides, merged with scenario-defaults.json. */
export function scenarioWith(settings = {}) {
  // Task timers are off in tests unless a test turns them on (tests inject config; the app default is in scenario-defaults).
  return withDefaults({ ...rawScenario, settings: { taskTimerMode: 'off', ...rawScenario.settings, ...settings } }, catalogs);
}
export const scenario = scenarioWith();
export const MIN = 60000;
