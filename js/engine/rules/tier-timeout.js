// tier-timeout: an order's timeliness tag is late / very late (or open and past those).
// Thresholds and which orders count come from engine/timeliness.js (rules.timeliness), so this rule,
// the command center and the debrief can never disagree. Severity per tier: rules['tier-timeout'].
import { flag, ruleConfig, responsible, mins } from './helpers.js';
import { timelinessItems, timelinessConfig, isLate, isVeryLate } from '../timeliness.js';

export default {
  id: 'tier-timeout',
  label: 'Order not done in time for its tier',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'tier-timeout');
    const th = timelinessConfig(state, ctx.catalogs).orders || {};
    return timelinessItems(state, ctx).filter((i) => i.kind === 'order' && (isLate(i.tag) || isVeryLate(i.tag))).map((i) => {
      const severity = isVeryLate(i.tag) ? (cfg.veryLateSeverity || 'red') : (cfg.severity?.[i.tier] || 'amber');
      const w = th[i.tier];
      const done = i.doneAt != null;
      return flag('tier-timeout', severity, {
        patientId: i.patientId, userIds: done && i.doneBy ? [i.doneBy] : responsible(state, ctx, i.patientId),
        atMin: done ? i.doneAt : i.startAt + w.lateMin, logIds: i.logId ? [i.logId] : [],
        message: done
          ? `Tier ${i.tier} order "${i.label}" done ${mins(i.minutes)} after it was ordered (late after ${w.lateMin} min).`
          : `Tier ${i.tier} order "${i.label}" still not done ${mins(i.minutes)} after it was ordered (late after ${w.lateMin} min).`,
      });
    });
  },
};
