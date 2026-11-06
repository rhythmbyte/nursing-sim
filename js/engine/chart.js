// Student chart actions: pure transitions, each logged with userId + role. No DOM.
// Signature: fn(state, patientId, args, ctx) → new state.  ctx = { now, user, templatesById, catalogs }
// Per-student UI state (last seen, handoff) lives in state.students[userId].

import { simMinOf } from './session.js';
import { append } from './log.js';
import { progressOrder, findOrder } from './orders.js';
import { drawLabs } from './labs.js';
import { requestDelegation } from './delegation.js';
import { deviceValues, scriptedSnapshot, SCRIPTED_MANUAL_KEYS, OTHER_MANUAL_KEYS, MONITOR_CYCLES } from './vitals.js';

function begin(state, ctx) {
  return { draft: structuredClone(state), simMin: simMinOf(state, ctx.now) };
}

function log(draft, simMin, ctx, patientId, action, details = {}) {
  append(draft, { simMin, wallTime: ctx.now, userId: ctx.user.userId, role: ctx.user.role, patientId, action, details });
}

function studentRec(draft, user) {
  draft.students[user.userId] ??= { seen: {}, handoff: {} };
  return draft.students[user.userId];
}

function orderOf(ctx, patientId, orderId) {
  return findOrder(ctx.templatesById, patientId, orderId);
}

/** Student opens a patient's chart. Records "last seen". */
export function openPatient(state, patientId, _args, ctx) {
  const { draft, simMin } = begin(state, ctx);
  studentRec(draft, ctx.user).seen[patientId] = simMin;
  log(draft, simMin, ctx, patientId, 'patient-opened');
  return draft;
}

export function openHandoff(state, patientId, _args, ctx) {
  const { draft, simMin } = begin(state, ctx);
  const rec = studentRec(draft, ctx.user);
  if (rec.handoff[patientId]) return state; // already opened (mode "once": never again)
  rec.handoff[patientId] = { openedAt: simMin, closedAt: null, notes: '' };
  log(draft, simMin, ctx, patientId, 'handoff-opened');
  return draft;
}

export function closeHandoff(state, patientId, { notes = '' }, ctx) {
  const { draft, simMin } = begin(state, ctx);
  const h = studentRec(draft, ctx.user).handoff[patientId];
  if (!h || h.closedAt != null) return state;
  Object.assign(h, { closedAt: simMin, notes });
  log(draft, simMin, ctx, patientId, 'handoff-closed', { durationMin: Math.round((simMin - h.openedAt) * 100) / 100, notes });
  return draft;
}

/** handoffMode "always": notes can be edited any time. */
export function saveHandoffNotes(state, patientId, { notes = '' }, ctx) {
  const { draft, simMin } = begin(state, ctx);
  const rec = studentRec(draft, ctx.user);
  rec.handoff[patientId] ??= { openedAt: simMin, closedAt: null, notes: '' };
  rec.handoff[patientId].notes = notes;
  log(draft, simMin, ctx, patientId, 'handoff-notes', { notes });
  return draft;
}

export function acknowledgeOrder(state, patientId, { orderId }, ctx) {
  const o = state.patients[patientId]?.orders[orderId];
  if (!o || o.status !== 'new') return state;
  const { draft, simMin } = begin(state, ctx);
  Object.assign(draft.patients[patientId].orders[orderId], { status: 'acknowledged', ackAtMin: simMin });
  log(draft, simMin, ctx, patientId, 'order-acknowledged', { orderId });
  return draft;
}

export function completeOrder(state, patientId, { orderId }, ctx) {
  const o = state.patients[patientId]?.orders[orderId];
  if (!o || o.status === 'done') return state;
  const { draft, simMin } = begin(state, ctx);
  Object.assign(draft.patients[patientId].orders[orderId], { status: 'done', doneAtMin: simMin });
  log(draft, simMin, ctx, patientId, 'order-done', { orderId });
  return draft;
}

/** Copies baseline + any pending finding changes into the patient's revealed findings. Mutates draft. */
function revealFindings(draft, patientId, template, simMin) {
  const ps = draft.patients[patientId];
  const shown = new Set(ps.revealed.map((r) => r.source));
  if (!shown.has('baseline')) ps.revealed.push({ source: 'baseline', atMin: simMin, findings: [...template.findings.baseline] });
  for (const eventId of ps.findingChanges) {
    if (shown.has(eventId)) continue;
    const change = template.findings.changes?.find((c) => c.eventId === eventId);
    if (change) ps.revealed.push({ source: eventId, atMin: simMin, findings: [...change.findings] });
  }
}

const pickTyped = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] != null && String(obj[k]).trim() !== '').map((k) => [k, String(obj[k]).trim()]));

/**
 * Chart an intervention. args: { interventionId, fields, orderId?, delegatedTo?: 'LPN'|'CNA' }
 * - Delegated: queued; effects happen when the staff member reports back (engine/delegation.js).
 * - vitalsCapture (vs-full, vs-bp): device values (BP/HR/SpO₂/O₂) come from the patient; temp/RR/pain are
 *   what the student entered (revealed via "Measure" or told by the manikin/instructor). Adds a flowsheet row;
 *   the log keeps the scripted values for the debrief.
 * - drawsLabs: draws the order's labCodes; results come after each lab's delay.
 */
export function chartIntervention(state, patientId, { interventionId, fields = {}, orderId = null, delegatedTo = null }, ctx) {
  const iv = ctx.catalogs.interventions.interventions.find((i) => i.id === interventionId);
  if (!iv) throw new Error(`Unknown intervention ${interventionId}`);
  const { draft, simMin } = begin(state, ctx);
  const order = orderOf(ctx, patientId, orderId);
  const ps = draft.patients[patientId];
  let logFields = fields;
  const extra = {};

  if (delegatedTo) {
    const task = requestDelegation(draft, patientId, { interventionId, orderId, to: delegatedTo, fields, simMin });
    extra.taskId = task.id;
    extra.dueAt = task.dueAt;
  } else {
    progressOrder(draft, patientId, order, simMin);
    if (iv.revealsFindings) revealFindings(draft, patientId, ctx.templatesById[patientId], simMin);
    if (iv.vitalsCapture) {
      logFields = { ...deviceValues(ps, iv.chartFields), ...pickTyped(fields, iv.chartFields.filter((k) => SCRIPTED_MANUAL_KEYS.includes(k))) };
      ps.flowsheet.push({ atMin: simMin, source: 'charted', values: logFields, by: ctx.user.userId });
      extra.scripted = scriptedSnapshot(ps);
    }
    if (iv.drawsLabs && order?.labCodes) extra.drawn = drawLabs(draft, patientId, order.labCodes, simMin, ctx.catalogs, order.id).map((l) => l.uid);
  }
  log(draft, simMin, ctx, patientId, 'intervention', { interventionId, category: iv.category, fields: logFields, orderId, delegatedTo, ...extra });
  return draft;
}

/** Flowsheet manual entries (temp/RR/pain, GCS, glucose, I&O, weight, neuro). Scripted values kept for the debrief. */
export function flowsheetEntry(state, patientId, { values = {} }, ctx) {
  const typed = pickTyped(values, [...SCRIPTED_MANUAL_KEYS, ...OTHER_MANUAL_KEYS]);
  if (!Object.keys(typed).length) return state;
  const { draft, simMin } = begin(state, ctx);
  const ps = draft.patients[patientId];
  ps.flowsheet.push({ atMin: simMin, source: 'charted', values: typed, by: ctx.user.userId });
  log(draft, simMin, ctx, patientId, 'flowsheet-entry', { values: typed, scripted: scriptedSnapshot(ps) });
  return draft;
}

/** "Take BP now": starts the NIBP immediately (monitor values now). Doesn't change the auto cycle. */
export function takeBpNow(state, patientId, _args, ctx) {
  const { draft, simMin } = begin(state, ctx);
  const ps = draft.patients[patientId];
  const values = deviceValues(ps, ['bp', 'hr', 'spo2']);
  ps.flowsheet.push({ atMin: simMin, source: 'monitor', values, by: 'NIBP (started by nurse)' });
  log(draft, simMin, ctx, patientId, 'nibp-now', { values });
  return draft;
}

/** Monitor cycle: intervalMin ∈ 0 (off), 5, 10, 15. Takes a reading now, then every intervalMin. */
export function setMonitor(state, patientId, { intervalMin }, ctx) {
  if (!MONITOR_CYCLES.includes(intervalMin)) throw new Error(`Monitor cycle must be one of ${MONITOR_CYCLES.join(', ')}`);
  const current = state.patients[patientId].monitor?.intervalMin ?? 0;
  if (current === intervalMin) return state;
  const { draft, simMin } = begin(state, ctx);
  draft.patients[patientId].monitor = intervalMin ? { intervalMin, fromMin: simMin, count: 0 } : null;
  log(draft, simMin, ctx, patientId, 'monitor-set', { intervalMin });
  return draft;
}

/** MAR action. args: { orderId, result: 'given'|'held'|'not-given', reason?, warnings? } */
export function medAction(state, patientId, { orderId, result, reason = '', warnings = [] }, ctx) {
  const order = orderOf(ctx, patientId, orderId);
  if (!order?.med) throw new Error(`Order ${orderId} is not a med order`);
  if (!['given', 'held', 'not-given'].includes(result)) throw new Error(`Bad MAR result ${result}`);
  const { draft, simMin } = begin(state, ctx);
  if (result === 'given') progressOrder(draft, patientId, order, simMin);
  log(draft, simMin, ctx, patientId, 'med', { orderId, med: order.med, result, reason, warnings: warnings.map((w) => w.code) });
  return draft;
}

export function addNote(state, patientId, { text }, ctx) {
  if (!text?.trim()) return state;
  const { draft, simMin } = begin(state, ctx);
  log(draft, simMin, ctx, patientId, 'note', { text: text.trim() });
  return draft;
}

export function escalate(state, patientId, { to = 'unspecified' } = {}, ctx) {
  const { draft, simMin } = begin(state, ctx);
  log(draft, simMin, ctx, patientId, 'escalated', { to });
  return draft;
}
