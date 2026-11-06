// assessment-overdue: a reassessment an order requires (order.assessment, every N min or after each dose) is
// late / very late in engine/timeliness.js (rules.timeliness.assessments). One-time requirements are
// required-assessment-missing. Off when settings.gradeAssessments is false. Severities: rules['assessment-overdue'].
import { flag, ruleConfig, responsible, mins } from './helpers.js';
import { timelinessItems, isLate, isVeryLate } from '../timeliness.js';

export default {
  id: 'assessment-overdue',
  label: 'Reassessment late or missed',
  evaluate(state, ctx) {
    if (state.settings.gradeAssessments === false) return [];
    const cfg = ruleConfig(state, ctx, 'assessment-overdue');
    const once = (i) => ctx.templatesById[i.patientId]?.orders.find((o) => o.id === i.orderId)?.assessment?.once;
    return timelinessItems(state, ctx).filter((i) => i.kind === 'assessment' && !once(i) && (isLate(i.tag) || isVeryLate(i.tag))).map((i) => {
      const done = i.doneAt != null;
      return flag('assessment-overdue', isVeryLate(i.tag) ? cfg.veryLateSeverity : cfg.lateSeverity, {
        patientId: i.patientId, userIds: done && i.doneBy ? [i.doneBy] : responsible(state, ctx, i.patientId), atMin: done ? i.doneAt : i.startAt, logIds: i.logId ? [i.logId] : [],
        message: done ? `Reassessment ${i.label} done ${mins(i.minutes)} after it was due.` : `Reassessment ${i.label} not done, ${mins(i.minutes)} past due.`,
      });
    });
  },
};
