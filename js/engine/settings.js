// Scenario settings = data/catalogs/scenario-defaults.json overridden by the scenario's own settings.
// The engine only ever reads merged settings (state.settings), so no setting defaults live in code.

export function effectiveSettings(scenarioSettings = {}, catalogs) {
  const defaults = catalogs?.scenarioDefaults?.settings;
  if (!defaults) throw new Error('Missing data/catalogs/scenario-defaults.json');
  const merged = { ...defaults, ...scenarioSettings };
  // staffPool: helpers per role for every group (a group's own `staff` overrides in the scenario); per-role merge.
  merged.staffPool = { ...(defaults.staffPool || {}), ...(scenarioSettings.staffPool || {}) };
  merged.messages = { ...defaults.messages, ...(scenarioSettings.messages || {}) };
  return merged;
}

/** Scenario with merged settings (done once at load, so screens and engine agree). */
export function withDefaults(scenario, catalogs) {
  return { ...scenario, settings: effectiveSettings(scenario.settings, catalogs) };
}
