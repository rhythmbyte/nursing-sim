// left-unattended: the instructor marked that a student left an unstable patient (Live control).
import { flag, ruleConfig } from './helpers.js';

export default {
  id: 'left-unattended',
  label: 'Left an unstable patient unattended',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'left-unattended');
    return state.log.filter((l) => l.action === 'left-unattended')
      .map((l) => flag('left-unattended', cfg.severity || 'red', { patientId: l.patientId, userIds: l.details.studentIds || [], atMin: l.simMin, logIds: [l.id],
        message: `Instructor: left the patient unattended${l.details.note ? ` (${l.details.note})` : ''}.` }));
  },
};
