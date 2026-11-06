// Assessment review (pure): each charted tool compared with what the patient's script expected at that moment.
// Shared by the assessment-mismatch rule and the debrief so they always agree.
// Row: { logId, atMin, patientId, by, toolId, toolName, score, band, tone, expectedScore, expectedBand, expectedTone,
//        differing: [{ itemId, label, student, expected }], bandMismatch, missedHighRisk, scoreDiff }

import { toolById, differingItems } from './assessment-score.js';

const toneOf = (tool, label) => tool?.bands?.find((b) => b.label === label)?.tone ?? null;

export function assessmentRows(state, ctx, pids = null) {
  return state.log.filter((l) => l.action === 'assessment' && (!pids || pids.includes(l.patientId))).map((l) => {
    const d = l.details;
    const tool = toolById(ctx.catalogs, d.toolId);
    const exp = d.expected;
    const tone = d.tone ?? toneOf(tool, d.band);
    const expectedTone = exp ? toneOf(tool, exp.band) : null;
    return {
      logId: l.id, atMin: l.simMin, patientId: l.patientId, by: d.delegatedTo || l.userId, toolId: d.toolId, toolName: tool?.name || d.toolId,
      score: d.score, band: d.band, tone, answers: d.answers,
      expectedScore: exp?.score ?? null, expectedBand: exp?.band ?? null, expectedTone,
      scripted: Boolean(exp) && tool?.scoring !== 'auto',
      differing: exp && tool && tool.scoring !== 'auto' ? differingItems(tool, d.answers, exp.answers) : [],
      bandMismatch: Boolean(exp?.band && d.band && exp.band !== d.band),
      missedHighRisk: expectedTone === 'red' && tone !== 'red' && Boolean(exp?.band),
      scoreDiff: exp?.score != null && d.score != null ? d.score - exp.score : null,
    };
  });
}
