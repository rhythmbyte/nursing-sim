// Nursing assessment tools in the session (pure, no DOM). Scoring lives in assessment-score.js.
// - EXPECTED answers (what the patient would score now, the answer key) start from template.assessments.baseline
//   and change with script states, 'assessment-change' events and reaction effects: patients[id].assessmentsExpected.
// - CHARTED assessments (what the student found): patients[id].assessments [{ toolId, atMin, by, answers, score, band, logId }].
// - settings.assessmentTools picks the tools ('public' | 'all' | [ids]); settings.revealAssessmentFindings decides whether
//   choosing an item shows the scripted answer (else the student assesses the manikin/instructor).
// - An order can require a tool: order.assessment = { tools: [ids], everyMin?, once? } (timeliness + rules).

import { cloneState } from './clone.js';
import { simMinOf } from './session.js';
import { append } from './log.js';
import { progressOrder } from './orders.js';
import { requestDelegation } from './delegation.js';
import { toolById, scoreTool, availableTools } from './assessment-score.js';

export { availableTools } from './assessment-score.js';

/** Merges { toolId: { itemId: value } } into a patient's expected answers. Mutates ps. */
export function applyExpected(ps, answers) {
  ps.assessmentsExpected ??= {};
  for (const [toolId, items] of Object.entries(answers || {})) ps.assessmentsExpected[toolId] = { ...(ps.assessmentsExpected[toolId] || {}), ...items };
}

/** Is the patient alert (for NEWS2)? Not if the expected GCS is below 15, CAM is positive, or vitals GCS < 15. */
export function isAlert(ps, catalogs) {
  const exp = ps.assessmentsExpected || {};
  const gcs = toolById(catalogs, 'gcs');
  if (gcs && exp.gcs && scoreTool(gcs, exp.gcs).complete && scoreTool(gcs, exp.gcs).score < 15) return false;
  const cam = toolById(catalogs, 'cam');
  if (cam && exp.cam && scoreTool(cam, exp.cam).score === 1) return false;
  return !(typeof ps.vitals.gcs === 'number' && ps.vitals.gcs < 15);
}

/** What the patient would score on a tool right now: { answers, score, band, scripted } (scripted false = no data). */
export function expectedResult(state, pid, toolId, catalogs) {
  const ps = state.patients[pid];
  const tool = toolById(catalogs, toolId);
  if (!tool) return null;
  const answers = ps.assessmentsExpected?.[toolId] || null;
  if (tool.scoring === 'auto') return { answers: {}, scripted: true, ...scoreTool(tool, {}, { vitals: ps.vitals, alert: isAlert(ps, catalogs) }) };
  if (!answers) return { answers: null, scripted: false, score: null, band: null };
  return { answers, scripted: true, ...scoreTool(tool, answers) };
}

/** "Reveal" for one item: the scripted answer, only when the sim reveals assessment findings. */
export function revealItem(state, pid, toolId, itemId) {
  if (!state.settings.revealAssessmentFindings) return { revealed: false, reason: 'off' };
  const v = state.patients[pid].assessmentsExpected?.[toolId]?.[itemId];
  return v == null ? { revealed: false, reason: 'none' } : { revealed: true, value: v };
}

/** Orders whose required tools include this one. */
const ordersFor = (template, toolId) => (template?.orders || []).filter((o) => o.assessment?.tools?.includes(toolId));

/** Records a charted assessment (student, or staff after delegation). Mutates draft; returns the log entry. */
export function recordAssessment(draft, pid, { toolId, answers, at, user, delegatedTo = null, now, templatesById, catalogs }) {
  const ps = draft.patients[pid];
  const tool = toolById(catalogs, toolId);
  const result = scoreTool(tool, answers, { vitals: ps.vitals, alert: isAlert(ps, catalogs) });
  const expected = expectedResult(draft, pid, toolId, catalogs);
  for (const o of ordersFor(templatesById[pid], toolId)) progressOrder(draft, pid, o, at);
  if (tool.vitalsField && result.score != null) {
    ps.flowsheet.push({ atMin: at, source: delegatedTo ? 'delegated' : 'charted', values: { [tool.vitalsField]: result.score }, by: delegatedTo || user.userId });
  }
  const entry = append(draft, { simMin: at, wallTime: now, ...user, patientId: pid, action: 'assessment', details: {
    toolId, answers, score: result.score, band: result.band?.label ?? null, tone: result.band?.tone ?? null, complete: result.complete, delegatedTo,
    expected: expected?.scripted ? { answers: expected.answers, score: expected.score, band: expected.band?.label ?? null } : null,
  } });
  ps.assessments ??= [];
  ps.assessments.push({ toolId, atMin: at, by: user.userId, answers, score: result.score, band: result.band?.label ?? null, logId: entry.id });
  return entry;
}

/**
 * Chart action: student completes a tool (or delegates it, if the catalog allows). args: { toolId, answers, delegatedTo? }.
 * ctx = { now, user, templatesById, catalogs }.
 */
export function chartAssessment(state, pid, { toolId, answers = {}, delegatedTo = null, queue = false }, ctx) {
  const tool = toolById(ctx.catalogs, toolId);
  if (!tool) throw new Error(`Unknown assessment tool ${toolId}`);
  if (!availableTools(state.settings, ctx.catalogs).some((t) => t.id === toolId)) throw new Error(`${tool.name} is not available in this sim`);
  const draft = cloneState(state);
  const at = ctx.atMin ?? simMinOf(state, ctx.now); // atMin: finished timed task (engine/tasks.js)
  if (delegatedTo) {
    if (!tool.delegableTo.includes(delegatedTo)) throw new Error(`${tool.name} can't be delegated to ${delegatedTo}`);
    const task = requestDelegation(draft, pid, { interventionId: `assessment:${toolId}`, orderId: ordersFor(ctx.templatesById[pid], toolId)[0]?.id || null, to: delegatedTo, fields: {}, simMin: at, queue, assessmentToolId: toolId, by: ctx.user.userId }, ctx);
    append(draft, { simMin: at, wallTime: ctx.now, ...ctx.user, patientId: pid, action: 'assessment-delegated', details: { toolId, to: delegatedTo, taskId: task.id, dueAt: task.dueAt, helper: task.helperLabel || null, ...(task.status === 'queued' ? { queued: true } : {}) } });
    return draft;
  }
  recordAssessment(draft, pid, { toolId, answers, at, user: ctx.user, now: ctx.now, templatesById: ctx.templatesById, catalogs: ctx.catalogs });
  return draft;
}

/** Delegation completion for an assessment: the staff member reports the scripted answers (or nothing scripted). */
export function completeDelegatedAssessment(draft, pid, task, ctx) {
  const exp = draft.patients[pid].assessmentsExpected?.[task.assessmentToolId] || {};
  return recordAssessment(draft, pid, { toolId: task.assessmentToolId, answers: { ...exp }, at: task.dueAt, user: { userId: `staff-${task.to.toLowerCase()}`, role: 'staff' }, delegatedTo: task.to, now: ctx.now, templatesById: ctx.templatesById, catalogs: ctx.catalogs });
}
