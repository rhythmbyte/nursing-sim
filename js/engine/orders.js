// Order status helpers shared by chart actions and delegation. No DOM.

/** Work done for an order: acknowledges it if new; a one-time order becomes done. Mutates draft. */
export function progressOrder(draft, patientId, order, simMin) {
  const os = order && draft.patients[patientId].orders[order.id];
  if (!os) return;
  if (os.status === 'new') Object.assign(os, { status: 'acknowledged', ackAtMin: simMin });
  if (order.type === 'once' && os.status !== 'done') Object.assign(os, { status: 'done', doneAtMin: simMin });
}

export function findOrder(templatesById, patientId, orderId) {
  return orderId ? templatesById[patientId]?.orders.find((o) => o.id === orderId) || null : null;
}

/**
 * First time work was done for an order: own charting for it, a completed delegation, a med given, or
 * "Mark done". Charting the order's intervention without picking the order also counts once it's active.
 * Returns the log entry, or null. Used by the priority-order and tier-timeout rules and the debrief.
 */
export function firstWork(state, patientId, order) {
  const os = state.patients[patientId]?.orders[order.id];
  if (!os) return null;
  let best = null; // earliest by sim time (log order isn't strictly time order, e.g. delegated reports)
  for (const l of state.log) {
    if (l.patientId !== patientId || l.simMin < os.activeAtMin) continue;
    if (best && l.simMin >= best.simMin) continue;
    const d = l.details || {};
    const forThis = d.orderId === order.id;
    const counts = (l.action === 'intervention' && !d.delegatedTo
        && (forThis || (!d.orderId && (order.interventionIds || []).includes(d.interventionId))))
      || (l.action === 'delegation-completed' && forThis)
      || (l.action === 'med' && forThis && d.result === 'given')
      || (l.action === 'order-done' && forThis);
    if (counts) best = l;
  }
  return best;
}
