// PRN checks for one med order. Pure, no DOM. Single source of truth: the MAR warns with it now,
// and the prn-limit flag rule (phase 5) reuses it.
// order.prn: { max?, intervalMin?, requiresBefore?: [interventionId], requiresWithinMin? (default 15) }

export const DEFAULT_REQUIRES_WITHIN_MIN = 15;

/**
 * Does this log entry count as the required check `req`? Own charting (not a delegation request) or a
 * completed delegation, of `req` itself or an intervention that includes it (catalog `includes`, e.g.
 * full vitals include a BP). Monitor-cycle readings do NOT count (see DECISIONS.md).
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
export function prnWarnings(order, { log, patientId, simMin, labelOf = (id) => id, includesOf = () => [] }) {
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
  const within = prn.requiresWithinMin ?? DEFAULT_REQUIRES_WITHIN_MIN;
  for (const req of prn.requiresBefore || []) {
    const done = log.some((l) => l.patientId === patientId && simMin - l.simMin <= within && simMin >= l.simMin
      && satisfies(l, req, includesOf));
    if (!done) warnings.push({ code: 'requires', message: `Required check "${labelOf(req)}" not charted in the last ${within} min.` });
  }
  return warnings;
}
