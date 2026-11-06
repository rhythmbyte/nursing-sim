// Shared helpers for flag rules. No DOM.
// Rule ctx: { templatesById, catalogs, simMin, studentIdsForGroup(groupId) → userIds }

/** Rule config: catalog defaults (data/catalogs/rules.json) overridden by scenario settings.rules[ruleId]. */
export function ruleConfig(state, ctx, ruleId) {
  return { ...(ctx.catalogs?.rules?.rules?.[ruleId] || {}), ...(state.settings?.rules?.[ruleId] || {}) };
}

/** Students responsible for a patient (everyone assigned to its group). */
export function responsible(state, ctx, patientId) {
  return ctx.studentIdsForGroup?.(state.patients[patientId]?.groupId) || [];
}

/** Orders the timing/priority rules track: configured types, plus PRNs switched on by an event (e.g. "ECG now"). */
export function isTracked(order, cfg) {
  if ((cfg.trackedOrderTypes || ['once']).includes(order.type)) return true;
  return cfg.trackEventTriggeredPrn !== false && order.type === 'prn' && Boolean(order.activeOnEvent);
}

export function flag(ruleId, severity, { patientId, userIds, message, atMin, logIds = [] }) {
  return { ruleId, severity, patientId, userIds, message, atMin, logIds };
}

const OPS = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '==': (a, b) => a === b };
export const compare = (a, op, b) => (OPS[op] ? OPS[op](a, b) : false);

export const mins = (n) => `${Math.round(n * 10) / 10} min`;
