// delegation-overload: a student delegates more than rules['delegation-overload'].maxInWindow tasks within windowMin
// sim minutes (the staff pool already limits delegation; this flags the pattern). One flag per burst.
import { flag, ruleConfig } from './helpers.js';

export default {
  id: 'delegation-overload',
  label: 'Delegating too much at once',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'delegation-overload');
    const asks = state.log.filter((l) => (l.action === 'intervention' && l.details.delegatedTo) || l.action === 'assessment-delegated');
    const byUser = {};
    for (const l of asks) (byUser[l.userId] ??= []).push(l);
    const out = [];
    for (const [uid, list] of Object.entries(byUser)) {
      let lastFlag = -Infinity;
      list.forEach((l, i) => {
        const win = list.filter((x, j) => j <= i && x.simMin > l.simMin - cfg.windowMin);
        if (win.length > cfg.maxInWindow && l.simMin - lastFlag >= cfg.windowMin) {
          lastFlag = l.simMin;
          out.push(flag('delegation-overload', cfg.severity, { patientId: l.patientId, userIds: [uid], atMin: l.simMin, logIds: win.map((x) => x.id),
            message: `Delegated ${win.length} tasks within ${cfg.windowMin} min (more than ${cfg.maxInWindow}).` }));
        }
      });
    }
    return out;
  },
};
