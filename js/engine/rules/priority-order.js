// priority-order: a lower-tier order in a set was done while a higher-tier order in the same set,
// already active, was still open (e.g. Foley before the fluid bolus in the sepsis set).
import { flag, isTracked, ruleConfig } from './helpers.js';
import { firstWork } from '../orders.js';

export default {
  id: 'priority-order',
  label: 'Priority order within an order set',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'priority-order');
    const flags = [];
    for (const [pid, ps] of Object.entries(state.patients)) {
      const tracked = ctx.templatesById[pid].orders.filter((o) => ps.orders[o.id] && isTracked(o, cfg))
        .map((o) => ({ o, os: ps.orders[o.id], work: firstWork(state, pid, o) }));
      for (const lo of tracked) {
        if (!lo.work) continue;
        const skipped = tracked.filter((hi) => hi.o.orderSet === lo.o.orderSet && hi.o.tier < lo.o.tier
          && hi.os.activeAtMin <= lo.work.simMin && (!hi.work || hi.work.simMin > lo.work.simMin));
        if (!skipped.length) continue;
        flags.push(flag('priority-order', cfg.severity || 'amber', {
          patientId: pid,
          userIds: [lo.work.userId],
          atMin: lo.work.simMin,
          logIds: [lo.work.id],
          message: `Did "${lo.o.text}" (tier ${lo.o.tier}) before higher-priority ${skipped.map((x) => `"${x.o.text}" (tier ${x.o.tier})`).join(', ')}.`,
        }));
      }
    }
    return flags;
  },
};
