// Delegation staff pool (pure, no DOM). Each group has helpers (settings.staffPool { CNA: 2, LPN: 1 }, a group's own
// `staff` overrides). Delegating assigns a FREE helper of that role, busy for the task's duration × the role's speedFactor
// plus travelSec (data/catalogs/staff.json), then the helper reports back (engine/delegation.js). No helper free:
// refused with "next free at…", or queued when settings.delegationQueue is on (started when a helper frees up).
// Session: state.staff = [{ id, role, label, groupId, taskId, onBreak }]; tasks live in patients[pid].delegations.

import { simMinOf } from './session.js';
import { append } from './log.js';
import { taskKey, durationSec } from './tasks.js';

/** Helpers for a new session. */
export function initStaff(scenario) {
  const out = [];
  for (const g of scenario.groups) {
    const pool = { ...(scenario.settings.staffPool || {}), ...(g.staff || {}) };
    for (const [role, n] of Object.entries(pool)) for (let i = 1; i <= n; i++) out.push({ id: `${g.id}-${role.toLowerCase()}-${i}`, role, label: `${role} ${i}`, groupId: g.id, taskId: null, onBreak: false });
  }
  return out;
}

export const roleInfo = (catalogs, role) => catalogs?.staff?.staff.find((s) => s.role === role) || {};
const allTasks = (state) => Object.entries(state.patients).flatMap(([pid, ps]) => (ps.delegations || []).map((t) => ({ pid, t })));
const taskById = (state, id) => allTasks(state).find((x) => x.t.id === id);
export const helpersOf = (state, groupId, role) => (state.staff || []).filter((s) => s.groupId === groupId && (!role || s.role === role));
export const freeHelper = (state, groupId, role) => helpersOf(state, groupId, role).find((s) => !s.taskId && !s.onBreak) || null;

/** When the next helper of a role frees up (sim minute), or null if none is busy (none in the group / all on break). */
export function nextFreeAt(state, groupId, role) {
  const ends = helpersOf(state, groupId, role).filter((s) => s.taskId).map((s) => taskById(state, s.taskId)?.t.dueAt).filter((x) => x != null);
  return ends.length ? Math.min(...ends) : null;
}

/** Sim seconds a helper needs: the task's own time × the role's speed factor + travel. */
export function helperSec(task, role, { catalogs, template, settings }) {
  const args = task.assessmentToolId ? ['chartAssessment', { toolId: task.assessmentToolId }] : ['chartIntervention', { interventionId: task.interventionId }];
  const key = taskKey(...args, catalogs) || { key: task.interventionId, base: null };
  const info = roleInfo(catalogs, role);
  return durationSec(key, { settings, template, catalogs }) * (info.speedFactor ?? 1) + (info.travelSec ?? 0);
}

function assign(draft, pid, task, helper, at, ctx) {
  task.helperId = helper.id;
  task.helperLabel = helper.label;
  task.startedAt = at;
  task.dueAt = at + helperSec(task, helper.role, { catalogs: ctx.catalogs, template: ctx.templatesById?.[pid], settings: draft.settings }) / 60;
  task.status = 'pending';
  helper.taskId = task.id;
}

/** Error with the "no helper free" details the screens show. */
export class NoHelperError extends Error {
  constructor(role, nextAt, queueable) { super(`No ${role} free`); this.code = 'no-helper'; this.role = role; this.nextAt = nextAt; this.queueable = queueable; }
}

/**
 * Assigns (or queues) a delegated task. Mutates draft; returns the task. Throws NoHelperError when nobody is free and
 * the task can't be queued (or the student hasn't chosen to queue: args.queue).
 */
export function placeDelegation(draft, pid, task, { simMin, queue = false, ctx }) {
  const groupId = draft.patients[pid].groupId;
  const helper = freeHelper(draft, groupId, task.to);
  if (helper) { assign(draft, pid, task, helper, simMin, ctx); return task; }
  const queueable = Boolean(draft.settings.delegationQueue) && helpersOf(draft, groupId, task.to).length > 0;
  if (!queue || !queueable) throw new NoHelperError(task.to, nextFreeAt(draft, groupId, task.to), queueable);
  Object.assign(task, { status: 'queued', queuedAt: simMin, dueAt: null });
  return task;
}

/** Starts queued tasks (oldest first) on free helpers at `at`. Mutates draft; returns how many started. */
export function startQueued(draft, at, ctx) {
  let n = 0;
  const queued = allTasks(draft).filter((x) => x.t.status === 'queued').sort((a, b) => a.t.queuedAt - b.t.queuedAt);
  for (const { pid, t } of queued) {
    const helper = freeHelper(draft, draft.patients[pid].groupId, t.to);
    if (!helper) continue;
    assign(draft, pid, t, helper, at, ctx);
    append(draft, { simMin: at, wallTime: ctx.now, userId: `staff-${t.to.toLowerCase()}`, role: 'staff', patientId: pid, action: 'delegation-started', details: { taskId: t.id, helperId: helper.id, waitedMin: Math.round((at - t.queuedAt) * 100) / 100 } });
    n++;
  }
  return n;
}

/** Frees the helper of a finished task. */
export function releaseHelper(draft, task) {
  const h = (draft.staff || []).find((s) => s.id === task.helperId);
  if (h && h.taskId === task.id) h.taskId = null;
}

// ---------- instructor / charge controls (logged) ----------
function change(state, ctx, mutate, action, details) {
  const draft = structuredClone(state);
  const simMin = simMinOf(state, ctx.now);
  mutate(draft);
  append(draft, { simMin, wallTime: ctx.now, ...ctx.user, action, details });
  startQueued(draft, simMin, ctx); // a freed or added helper picks up queued work
  return draft;
}

/** Move a free helper to another group. */
export function moveHelper(state, helperId, groupId, ctx) {
  const h = (state.staff || []).find((s) => s.id === helperId);
  if (!h) throw new Error('No such helper');
  if (h.taskId) throw new Error(`${h.label} is busy; move them when they finish`);
  return change(state, ctx, (d) => { d.staff.find((s) => s.id === helperId).groupId = groupId; }, 'staff-moved', { helperId, label: h.label, from: h.groupId, to: groupId });
}

/** On break / back (a busy helper can't go on break until they finish). */
export function setOnBreak(state, helperId, onBreak, ctx) {
  const h = (state.staff || []).find((s) => s.id === helperId);
  if (!h) throw new Error('No such helper');
  if (onBreak && h.taskId) throw new Error(`${h.label} is busy; they can go on break when they finish`);
  return change(state, ctx, (d) => { d.staff.find((s) => s.id === helperId).onBreak = Boolean(onBreak); }, onBreak ? 'staff-break' : 'staff-back', { helperId, label: h.label });
}

/** Set how many helpers of a role a group has (adds new ones; removes free ones). */
export function setStaffCount(state, groupId, role, count, ctx) {
  const have = helpersOf(state, groupId, role);
  const n = Math.max(0, Math.floor(Number(count)));
  if (n < have.length && have.filter((s) => !s.taskId).length < have.length - n) throw new Error(`Only ${have.filter((s) => !s.taskId).length} ${role} free to remove right now`);
  return change(state, ctx, (d) => {
    if (n > have.length) for (let i = have.length + 1; i <= n; i++) d.staff.push({ id: `${groupId}-${role.toLowerCase()}-${Date.now().toString(36)}-${i}`, role, label: `${role} ${i}`, groupId, taskId: null, onBreak: false });
    else { const drop = have.filter((s) => !s.taskId).slice(0, have.length - n).map((s) => s.id); d.staff = d.staff.filter((s) => !drop.includes(s.id)); }
  }, 'staff-count', { groupId, role, from: have.length, to: n });
}

/** Staff panel rows for a group: [{ id, label, role, status: free|busy|break, patientId, taskLabel, leftMin }] + queued tasks. */
export function staffView(state, groupId, simMin, catalogs) {
  const label = (t) => (t.assessmentToolId ? catalogs?.assessmentTools?.tools.find((x) => x.id === t.assessmentToolId)?.name : catalogs?.interventions?.interventions.find((i) => i.id === t.interventionId)?.label) || t.interventionId;
  const helpers = helpersOf(state, groupId).map((s) => {
    const x = s.taskId ? taskById(state, s.taskId) : null;
    return { id: s.id, label: s.label, role: s.role, groupId: s.groupId, status: s.onBreak ? 'break' : x ? 'busy' : 'free', patientId: x?.pid ?? null, taskLabel: x ? label(x.t) : null, leftMin: x ? Math.max(0, x.t.dueAt - simMin) : null };
  });
  const queued = allTasks(state).filter((x) => x.t.status === 'queued' && state.patients[x.pid].groupId === groupId).map((x) => ({ patientId: x.pid, to: x.t.to, taskLabel: label(x.t), queuedAt: x.t.queuedAt }));
  return { helpers, queued };
}
