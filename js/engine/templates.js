// Effective patient templates = file templates + things added live (instructor ad-hoc orders).
// Everything that reads orders goes through the runner's effective templates. No DOM.

export function effectiveTemplates(templatesById, state) {
  const adhoc = state?.adhoc || {};
  if (!Object.keys(adhoc).length) return templatesById;
  const out = { ...templatesById };
  for (const [pid, add] of Object.entries(adhoc)) {
    if (out[pid] && add.orders?.length) out[pid] = { ...out[pid], orders: [...out[pid].orders, ...add.orders] };
  }
  return out;
}
