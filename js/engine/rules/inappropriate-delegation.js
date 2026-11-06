// inappropriate-delegation: delegated an intervention the role may not do (catalog delegableTo),
// or delegated work on an order marked delegable: false.
import { flag, ruleConfig } from './helpers.js';
import { findOrder } from '../orders.js';

export default {
  id: 'inappropriate-delegation',
  label: 'Inappropriate delegation',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'inappropriate-delegation');
    const ivs = Object.fromEntries((ctx.catalogs?.interventions?.interventions || []).map((i) => [i.id, i]));
    const flags = [];
    for (const l of state.log) {
      if (l.action !== 'intervention' || !l.details.delegatedTo) continue;
      const iv = ivs[l.details.interventionId];
      const to = l.details.delegatedTo;
      const order = findOrder(ctx.templatesById, l.patientId, l.details.orderId);
      const reasons = [];
      if (iv && !(iv.delegableTo || []).includes(to)) reasons.push(`${iv.label} isn't delegable to ${to}`);
      if (order && order.delegable === false) reasons.push(`order "${order.text}" isn't delegable`);
      if (!reasons.length) continue;
      flags.push(flag('inappropriate-delegation', cfg.severity || 'red', { patientId: l.patientId, userIds: [l.userId], atMin: l.simMin, logIds: [l.id],
        message: `Delegated to ${to}: ${reasons.join('; ')}.` }));
    }
    return flags;
  },
};
