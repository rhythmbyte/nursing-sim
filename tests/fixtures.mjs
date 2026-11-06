// Shared test data: real starter content, all catalogs, scenario with merged settings.
import { readFileSync } from 'node:fs';
import { withDefaults } from '../js/engine/settings.js';

export const load = (rel) => JSON.parse(readFileSync(new URL(`../data/${rel}`, import.meta.url), 'utf8'));
const manifest = load('manifest.json');

export const templatesById = Object.fromEntries(manifest.patients.map((rel) => load(rel)).map((p) => [p.id, p]));
export const catalogs = Object.fromEntries(Object.entries(manifest.catalogs).map(([k, rel]) => [k, load(rel)]));
const rawScenario = load('scenarios/busy-medsurg-shift.json');

/** The starter scenario with optional setting overrides, merged with scenario-defaults.json. */
export function scenarioWith(settings = {}) {
  return withDefaults({ ...rawScenario, settings: { ...rawScenario.settings, ...settings } }, catalogs);
}
export const scenario = scenarioWith();
export const MIN = 60000;
