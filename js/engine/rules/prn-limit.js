// prn-limit: a PRN given despite a warning (max reached, too soon, required pre-check missing).
// The MAR records which warnings the student overrode (engine/prn.js), so this reads the log.
import { flag, ruleConfig } from './helpers.js';

const WHY = { max: 'maximum doses already given', interval: 'before the minimum interval', requires: 'without the required pre-check' };

export default {
  id: 'prn-limit',
  label: 'PRN given outside its limits',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'prn-limit');
    return state.log.filter((l) => l.action === 'med' && l.details.result === 'given' && l.details.warnings?.length)
      .map((l) => flag('prn-limit', cfg.severity || 'red', { patientId: l.patientId, userIds: [l.userId], atMin: l.simMin, logIds: [l.id],
        message: `Gave ${l.details.med} ${l.details.warnings.map((w) => WHY[w] || w).join(', ')} (overrode the MAR warning).` }));
  },
};
