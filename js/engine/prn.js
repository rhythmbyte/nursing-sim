// PRN checks for one med order. Pure, no DOM. Single source of truth: the MAR warns with it now,
// and the prn-limit flag rule (phase 5) reuses it.
// order.prn: { max?, intervalMin?, requiresBefore?: [interventionId], requiresWithinMin? }
// requiresWithinMin falls back to the scenario setting prnPreCheckWindowMin (via prnOptions).


/**
 * Does this log entry count as the required check `req`? Own charting (not a delegation request) or a
 * completed delegation, of `req` itself or an intervention that includes it (catalog `includes`, e.g.
 * full vitals include a BP). Monitor BP readings are checked separately in prnWarnings: they count when the
 * catalog marks the check `satisfiedByMonitor` (see DECISIONS.md).
 */
function satisfies(entry, req, includesOf) {
  const id = entry.details.interventionId;
  const matches = id === req || includesOf(id).includes(req);
  if (!matches) return false;
  if (entry.action === 'intervention') return !entry.details.delegatedTo;
  return entry.action === 'delegation-completed';
}

/** Doses of this order given so far, oldest first (log entries). */
export function dosesGiven(log, patientId, orderId) {
  return log.filter((l) => l.action === 'med' && l.patientId === patientId && l.details.orderId === orderId && l.details.result === 'given');
}

/**
 * Problems with giving this PRN dose at `simMin`. Empty array = OK.
 * Each: { code: 'max' | 'interval' | 'requires', message }. labelOf maps intervention ids to display names;
 * includesOf(id) lists the checks an intervention also covers (catalog `includes`).
 */
export function prnWarnings(order, {
  log, patientId, simMin, labelOf = (id) => id, includesOf = () => [], readings = [], monitorSatisfies = () => false, windowMin,
}) {
  const prn = order.prn;
  if (!prn) return [];
  const doses = dosesGiven(log, patientId, order.id);
  const warnings = [];

  if (prn.max != null && doses.length >= prn.max) {
    warnings.push({ code: 'max', message: `Maximum of ${prn.max} dose${prn.max > 1 ? 's' : ''} already given.` });
  }
  const last = doses.at(-1);
  if (last && prn.intervalMin != null && simMin - last.simMin < prn.intervalMin) {
    const wait = Math.ceil(prn.intervalMin - (simMin - last.simMin));
    warnings.push({ code: 'interval', message: `Too soon: minimum interval is ${prn.intervalMin} min (about ${wait} min to go).` });
  }
  const within = prn.requiresWithinMin ?? windowMin;
  if ((prn.requiresBefore || []).length && within == null) throw new Error('No pre-check window: set prn.requiresWithinMin or settings.prnPreCheckWindowMin');
  for (const req of prn.requiresBefore || []) {
    const inWindow = (t) => simMin - t <= within && simMin >= t;
    const done = log.some((l) => l.patientId === patientId && inWindow(l.simMin) && satisfies(l, req, includesOf))
      || (monitorSatisfies(req) && readings.some((r) => r.source === 'monitor' && r.values.bp != null && inWindow(r.atMin)));
    if (!done) warnings.push({ code: 'requires', message: `Required check "${labelOf(req)}" not charted in the last ${within} min.` });
  }
  return warnings;
}

/** Catalog-, settings- and patient-derived options for prnWarnings (one place, so every caller checks the same way). */
export function prnOptions(catalogs, patientState, settings) {
  const ivs = catalogs?.interventions?.interventions || [];
  const byId = Object.fromEntries(ivs.map((i) => [i.id, i]));
  return {
    labelOf: (id) => byId[id]?.label || id,
    includesOf: (id) => byId[id]?.includes || [],
    monitorSatisfies: (id) => byId[id]?.satisfiedByMonitor === true,
    readings: patientState?.flowsheet || [],
    windowMin: settings?.prnPreCheckWindowMin,
  };
}
