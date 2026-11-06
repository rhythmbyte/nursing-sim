// tier-timeout: a tracked order wasn't done within its tier's window (default tier 1: 5 min, tier 2: 15).
// Orders already in place at shift start are skipped unless includeShiftStartOrders (instructor question).
import { flag, isTracked, ruleConfig, responsible, mins } from './helpers.js';
import { firstWork } from '../orders.js';

export default {
  id: 'tier-timeout',
  label: 'Order not done in time for its tier',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'tier-timeout');
    const flags = [];
    for (const [pid, ps] of Object.entries(state.patients)) {
      for (const o of ctx.templatesById[pid].orders) {
        const os = ps.orders[o.id];
        const window = cfg.windowsMin?.[o.tier];
        if (!os || window == null || !isTracked(o, cfg)) continue;
        if (os.activeAtMin === 0 && !cfg.includeShiftStartOrders) continue;
        const due = os.activeAtMin + window;
        const work = firstWork(state, pid, o);
        const severity = cfg.severity?.[o.tier] || 'amber';
        if (work && work.simMin > due) {
          flags.push(flag('tier-timeout', severity, { patientId: pid, userIds: [work.userId], atMin: work.simMin, logIds: [work.id],
            message: `Tier ${o.tier} order "${o.text}" done ${mins(work.simMin - os.activeAtMin)} after it was ordered (window ${window} min).` }));
        } else if (!work && ctx.simMin > due) {
          flags.push(flag('tier-timeout', severity, { patientId: pid, userIds: responsible(state, ctx, pid), atMin: due,
            message: `Tier ${o.tier} order "${o.text}" still not done ${mins(ctx.simMin - os.activeAtMin)} after it was ordered (window ${window} min).` }));
        }
      }
    }
    return flags;
  },
};
