// Scenario settings = data/catalogs/scenario-defaults.json overridden by the scenario's own settings.
// The engine only ever reads merged settings (state.settings), so no setting defaults live in code.

export function effectiveSettings(scenarioSettings = {}, catalogs) {
  const defaults = catalogs?.scenarioDefaults?.settings;
  if (!defaults) throw new Error('Missing data/catalogs/scenario-defaults.json');
  const merged = { ...defaults, ...scenarioSettings };
  // delegationDelayMin: a number applies to every role; an object overrides per role.
  const own = scenarioSettings.delegationDelayMin;
  merged.delegationDelayMin = typeof own === 'number'
    ? Object.fromEntries(Object.keys(defaults.delegationDelayMin).map((role) => [role, own]))
    : { ...defaults.delegationDelayMin, ...(own || {}) };
  return merged;
}

/** Scenario with merged settings (done once at load, so screens and engine agree). */
export function withDefaults(scenario, catalogs) {
  return { ...scenario, settings: effectiveSettings(scenario.settings, catalogs) };
}
