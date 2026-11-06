// Student chart actions: pure transitions, each logged with userId + role. No DOM.
// Signature: fn(state, patientId, args, ctx) → new state.  ctx = { now, user, templatesById, catalogs }
// Per-student UI state (last seen, handoff) lives in state.students[userId].

import { simMinOf } from './session.js';
import { append } from './log.js';

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
  return ctx.templatesById[patientId].orders.find((o) => o.id === orderId) || null;
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

/** Charting work on an order: acknowledges it if new; a one-time order becomes done. Mutates draft. */
function progressOrder(draft, patientId, order, simMin) {
  const os = order && draft.patients[patientId].orders[order.id];
  if (!os) return;
  if (os.status === 'new') Object.assign(os, { status: 'acknowledged', ackAtMin: simMin });
  if (order.type === 'once' && os.status !== 'done') Object.assign(os, { status: 'done', doneAtMin: simMin });
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

/** args: { interventionId, fields, orderId?, delegatedTo?: 'LPN'|'CNA' } */
export function chartIntervention(state, patientId, { interventionId, fields = {}, orderId = null, delegatedTo = null }, ctx) {
  const iv = ctx.catalogs.interventions.interventions.find((i) => i.id === interventionId);
  if (!iv) throw new Error(`Unknown intervention ${interventionId}`);
  const { draft, simMin } = begin(state, ctx);
  progressOrder(draft, patientId, orderOf(ctx, patientId, orderId), simMin);
  if (iv.revealsFindings && !delegatedTo) revealFindings(draft, patientId, ctx.templatesById[patientId], simMin);
  log(draft, simMin, ctx, patientId, 'intervention', { interventionId, category: iv.category, fields, orderId, delegatedTo });
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
