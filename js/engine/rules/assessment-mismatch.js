// assessment-mismatch: a charted tool's score or interpretation differs from what the patient's script expected
// (e.g. low fall risk charted for a high-risk patient). Only for scripted tools; off when settings.gradeAssessments
// is false. Thresholds/severities: rules['assessment-mismatch'] (scoreDiffMin, severity, missedHighRiskSeverity).
import { flag, ruleConfig } from './helpers.js';
import { assessmentRows } from '../assessment-review.js';

export default {
  id: 'assessment-mismatch',
  label: 'Assessment differs from the patient',
  evaluate(state, ctx) {
    if (state.settings.gradeAssessments === false) return [];
    const cfg = ruleConfig(state, ctx, 'assessment-mismatch');
    return assessmentRows(state, ctx).filter((r) => r.scripted && !String(r.by).startsWith('staff-') && (r.bandMismatch || (r.scoreDiff != null && Math.abs(r.scoreDiff) >= cfg.scoreDiffMin)))
      .map((r) => flag('assessment-mismatch', r.missedHighRisk ? cfg.missedHighRiskSeverity : cfg.severity, {
        patientId: r.patientId, userIds: [r.by], atMin: r.atMin, logIds: [r.logId],
        message: `${r.toolName}: charted ${r.score ?? '—'}${r.band ? ` (${r.band})` : ''}, patient was ${r.expectedScore ?? '—'}${r.expectedBand ? ` (${r.expectedBand})` : ''}${r.differing.length ? `; differs on ${r.differing.map((x) => x.label).join(', ')}` : ''}.`,
      }));
  },
};
