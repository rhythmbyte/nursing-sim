// call-light-response: a call light answered late, or still unanswered past "late".
// Thresholds: engine/timeliness.js (rules.timeliness.callLights). Late → amber, very late → red.
import { flag, responsible, mins } from './helpers.js';
import { timelinessItems, isLate, isVeryLate } from '../timeliness.js';

export default {
  id: 'call-light-response',
  label: 'Call light response time',
  evaluate(state, ctx) {
    return timelinessItems(state, ctx).filter((i) => i.kind === 'callLight' && (isLate(i.tag) || isVeryLate(i.tag))).map((i) => flag('call-light-response', isVeryLate(i.tag) ? 'red' : 'amber', {
      patientId: i.patientId, userIds: responsible(state, ctx, i.patientId),
      atMin: i.doneAt ?? i.startAt, logIds: i.logId ? [i.logId] : [],
      message: i.doneAt != null ? `Call light answered after ${mins(i.minutes)}.` : `Call light unanswered for ${mins(i.minutes)}.`,
    }));
  },
};
