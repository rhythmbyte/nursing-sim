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
