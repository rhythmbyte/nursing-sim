// call-light-response: a call light answered late, or still unanswered past the threshold.
import { flag, ruleConfig, responsible, mins } from './helpers.js';

export default {
  id: 'call-light-response',
  label: 'Call light response time',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'call-light-response');
    const sev = (m) => (m > cfg.redAfterMin ? 'red' : m > cfg.amberAfterMin ? 'amber' : null);
    const flags = [];
    for (const l of state.log) {
      if (l.action !== 'call-light-answered') continue;
      const s = sev(l.details.responseMin);
      if (s) flags.push(flag('call-light-response', s, { patientId: l.patientId, userIds: responsible(state, ctx, l.patientId), atMin: l.simMin, logIds: [l.id],
        message: `Call light answered after ${mins(l.details.responseMin)}.` }));
    }
    for (const [pid, ps] of Object.entries(state.patients)) {
      if (!ps.callLight) continue;
      const s = sev(ctx.simMin - ps.callLight.since);
      if (s) flags.push(flag('call-light-response', s, { patientId: pid, userIds: responsible(state, ctx, pid), atMin: ps.callLight.since,
        message: `Call light unanswered for ${mins(ctx.simMin - ps.callLight.since)}.` }));
    }
    return flags;
  },
};
