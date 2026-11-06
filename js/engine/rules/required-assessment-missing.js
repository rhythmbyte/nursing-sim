// required-assessment-missing: a one-time required assessment (order.assessment.once, e.g. a Morse fall score on
// admission) not done within rules['required-assessment-missing'].withinMin of the order becoming active.
// Only tools the sim offers count (timeliness). Off when settings.gradeAssessments is false.
import { flag, ruleConfig, responsible, mins } from './helpers.js';
import { timelinessItems } from '../timeliness.js';

export default {
  id: 'required-assessment-missing',
  label: 'Required assessment not done',
  evaluate(state, ctx) {
    if (state.settings.gradeAssessments === false) return [];
    const cfg = ruleConfig(state, ctx, 'required-assessment-missing');
    const once = (i) => ctx.templatesById[i.patientId]?.orders.find((o) => o.id === i.orderId)?.assessment?.once;
    return timelinessItems(state, ctx).filter((i) => i.kind === 'assessment' && once(i) && i.doneAt == null && i.minutes > cfg.withinMin)
      .map((i) => flag('required-assessment-missing', cfg.severity, {
        patientId: i.patientId, userIds: responsible(state, ctx, i.patientId), atMin: i.startAt + cfg.withinMin,
        message: `Required assessment ${i.label} still not done ${mins(i.minutes)} after it was ordered (expected within ${cfg.withinMin} min).`,
      }));
  },
};
