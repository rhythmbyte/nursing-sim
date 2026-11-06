// alarm-response: a monitor alarm not acknowledged (silenced) by "late". Alarms that clear on their own
// before "late" aren't flagged. Thresholds: engine/timeliness.js (rules.timeliness.alarms).
import { flag, responsible, mins } from './helpers.js';
import { timelinessItems, isLate, isVeryLate } from '../timeliness.js';

export default {
  id: 'alarm-response',
  label: 'Monitor alarm response time',
  evaluate(state, ctx) {
    return timelinessItems(state, ctx).filter((i) => i.kind === 'alarm' && (isLate(i.tag) || isVeryLate(i.tag))).map((i) => flag('alarm-response', isVeryLate(i.tag) ? 'red' : 'amber', {
      patientId: i.patientId, userIds: i.acknowledged && i.doneBy ? [i.doneBy] : responsible(state, ctx, i.patientId), atMin: i.startAt,
      message: i.acknowledged ? `${i.label} acknowledged after ${mins(i.minutes)}.` : `${i.label} not acknowledged for ${mins(i.minutes)}.`,
    }));
  },
};
