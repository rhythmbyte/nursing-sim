// Task timers (pure, no DOM). Charting an intervention, an assessment tool or a MAR action keeps the student busy for
// its duration (sim time, so it scales with speed). The chart action itself is applied when the task FINISHES, so order
// work, timeliness and reactions count it then. settings.taskTimerMode: 'screen-only' (full duration) | 'manikin'
// (short lockout: duration × taskTimerManikinFactor, at least taskTimerMinLockoutSec) | 'off' (as before).
// Durations: catalog durationSec (interventions, assessment tools), task-timing.json (MAR, default), overridden by the
// patient's taskDurations and the scenario's settings.taskDurations (keys: interventionId, tool:<id>, mar:<result>).
// Student record: state.students[userId].task = { id, name, args, patientId, label, startedAt, runFrom, activeMin, endsAt, durationSec, lockSec }
// and .pausedTask (one at a time): a task the student stepped away from, with leftMin; resuming restarts its countdown.

import { simMinOf } from './session.js';
import { append } from './log.js';
import * as chart from './chart.js';

const TASK_ACTIONS = ['chartIntervention', 'chartAssessment', 'medAction'];

/** Duration key + label of a chart action, or null when it isn't a timed task (e.g. delegated work, notes). */
export function taskKey(name, args, catalogs) {
  if (!TASK_ACTIONS.includes(name) || args.delegatedTo) return null;
  if (name === 'chartIntervention') {
    const iv = catalogs.interventions.interventions.find((i) => i.id === args.interventionId);
    if (catalogs.taskTiming?.allowedWhileBusy?.interventions?.includes(args.interventionId)) return null; // always at once
    return { key: args.interventionId, label: iv?.label || args.interventionId, base: iv?.durationSec };
  }
  if (name === 'chartAssessment') {
    const tool = catalogs.assessmentTools?.tools.find((t) => t.id === args.toolId);
    return { key: `tool:${args.toolId}`, label: tool?.name || args.toolId, base: tool?.durationSec };
  }
  return { key: `mar:${args.result}`, label: `MAR: ${args.result === 'given' ? 'give' : args.result === 'held' ? 'hold' : 'not given'}`, base: catalogs.taskTiming?.mar?.[args.result] };
}

/** Duration in sim seconds: scenario override, patient override, catalog, default. */
export function durationSec(key, { settings, template, catalogs }) {
  return Number(settings?.taskDurations?.[key.key] ?? template?.taskDurations?.[key.key] ?? key.base ?? catalogs.taskTiming?.defaultSec ?? 60);
}

/** How long the student is locked out (sim seconds) for a task of `sec` under the sim's timer mode. */
export function lockoutSec(sec, settings) {
  const mode = settings?.taskTimerMode || 'off';
  if (mode === 'off' || !sec) return 0;
  if (mode === 'manikin') return Math.max(settings.taskTimerMinLockoutSec ?? 5, sec * (settings.taskTimerManikinFactor ?? 0.25));
  return sec;
}

export const currentTask = (state, userId) => state.students?.[userId]?.task || null;

/** What a chart call would start: { key, label, durationSec, lockSec } or null (not a task, or no lockout). */
export function taskPlan(state, name, pid, args, { catalogs, templatesById }) {
  const key = taskKey(name, args, catalogs);
  if (!key) return null;
  const sec = durationSec(key, { settings: state.settings, template: templatesById[pid], catalogs });
  const lockSec = lockoutSec(sec, state.settings);
  return lockSec > 0 ? { ...key, durationSec: sec, lockSec } : null;
}

const r2 = (x) => Math.round(x * 100) / 100;
/** Minutes actually spent on a task (pauses excluded) up to `at`. */
export const activeMinutes = (t, at) => r2((t.activeMin || 0) + (at - (t.runFrom ?? t.startedAt)));
const busyMessage = (task, simMin) => `You're busy: ${task.label} (${Math.max(0, Math.ceil((task.endsAt - simMin) * 60))} s left). Finish or interrupt it first.`;

/** Throws if the student is busy and this call would start another task. */
export function assertFree(state, userId, plan, now) {
  const t = currentTask(state, userId);
  if (t && plan) throw new Error(busyMessage(t, simMinOf(state, now)));
}

/** Student starts a timed task: busy until endsAt; the action is applied by taskProcessor then. ctx = { now, user, templatesById, catalogs }. */
export function beginTask(state, pid, name, args, plan, ctx) {
  assertFree(state, ctx.user.userId, plan, ctx.now);
  const draft = structuredClone(state);
  const simMin = simMinOf(state, ctx.now);
  draft.students[ctx.user.userId] ??= { seen: {}, handoff: {} };
  const id = `t${draft.log.length + 1}`;
  const task = { id, name, args, user: { ...ctx.user }, patientId: pid, label: plan.label, startedAt: simMin, runFrom: simMin, activeMin: 0, endsAt: simMin + plan.lockSec / 60, durationSec: plan.durationSec, lockSec: plan.lockSec };
  draft.students[ctx.user.userId].task = task;
  append(draft, { simMin, wallTime: ctx.now, ...ctx.user, patientId: pid, action: 'task-started', details: { taskId: id, label: plan.label, name, durationSec: plan.durationSec, lockSec: plan.lockSec, endsAt: task.endsAt, mode: state.settings.taskTimerMode } });
  return draft;
}

/** Applies a task's chart action at `atMin` into the draft (the action's own log entry is written then). Mutates draft. */
function applyTask(draft, userId, task, atMin, ctx, how) {
  const role = task.user?.role || 'student';
  draft.students[userId].task = null;
  try {
    const next = chart[task.name](draft, task.patientId, task.args, { now: ctx.now, user: { userId, role }, templatesById: ctx.templatesById, catalogs: ctx.catalogs, atMin });
    for (const k of Object.keys(next)) draft[k] = next[k];
  } catch (e) {
    append(draft, { simMin: atMin, wallTime: ctx.now, userId, role, patientId: task.patientId, action: 'task-failed', details: { taskId: task.id, label: task.label, error: e.message } });
    return;
  }
  append(draft, { simMin: atMin, wallTime: ctx.now, userId, role, patientId: task.patientId, action: 'task-finished', details: { taskId: task.id, label: task.label, minutes: activeMinutes(task, atMin), how } });
}

/** Tick processor: finishes tasks whose time is up, in time order. */
export const taskProcessor = {
  due(state, upto) {
    return Object.values(state.students || {}).some((s) => s.task && s.task.endsAt <= upto + 1e-9);
  },
  nextAt(state, upto) {
    const ends = Object.values(state.students || {}).filter((s) => s.task && s.task.endsAt < upto).map((s) => s.task.endsAt);
    return ends.length ? Math.min(...ends) : Infinity;
  },
  apply(draft, upto, ctx) {
    const due = Object.entries(draft.students || {}).filter(([, s]) => s.task && s.task.endsAt <= upto + 1e-9).sort((a, b) => a[1].task.endsAt - b[1].task.endsAt);
    for (const [uid, s] of due) applyTask(draft, uid, s.task, s.task.endsAt, ctx, 'finished');
  },
};

/** "Interrupt task": the student stops; nothing is charted, the task is logged as interrupted. */
export function interruptTask(state, { now, user, paused = false }) {
  const rec = state.students?.[user.userId];
  const t = paused ? rec?.pausedTask : rec?.task;
  if (!t) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  if (paused) delete draft.students[user.userId].pausedTask; else draft.students[user.userId].task = null;
  append(draft, { simMin, wallTime: now, ...user, patientId: t.patientId, action: 'task-interrupted', details: { taskId: t.id, label: t.label,
    minutes: paused ? r2(t.activeMin || 0) : activeMinutes(t, simMin), leftMin: paused ? t.leftMin : r2(t.endsAt - simMin), ...(paused ? { dropped: true } : {}) } });
  return draft;
}

/** "Pause task": step away (e.g. an emergency) and come back to it. Frees the student; one paused task at a time. */
export function pauseTask(state, { now, user }) {
  const rec = state.students?.[user.userId];
  const t = rec?.task;
  if (!t) return state;
  if (rec.pausedTask) throw new Error(`You already paused ${rec.pausedTask.label}. Resume or drop it first.`);
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  const paused = { ...t, activeMin: activeMinutes(t, simMin), leftMin: r2(Math.max(0, t.endsAt - simMin)), pausedAt: simMin, endsAt: null, runFrom: null };
  Object.assign(draft.students[user.userId], { task: null, pausedTask: paused });
  append(draft, { simMin, wallTime: now, ...user, patientId: t.patientId, action: 'task-paused', details: { taskId: t.id, label: t.label, leftMin: paused.leftMin } });
  return draft;
}

/** "Resume": the paused task becomes the current task again with the time it had left. */
export function resumeTask(state, { now, user }) {
  const rec = state.students?.[user.userId];
  const p = rec?.pausedTask;
  if (!p) return state;
  if (rec.task) throw new Error(busyMessage(rec.task, simMinOf(state, now)));
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  const { leftMin, pausedAt, ...rest } = p;
  Object.assign(draft.students[user.userId], { task: { ...rest, runFrom: simMin, endsAt: simMin + leftMin } });
  delete draft.students[user.userId].pausedTask;
  append(draft, { simMin, wallTime: now, ...user, patientId: p.patientId, action: 'task-resumed', details: { taskId: p.id, label: p.label, pausedMin: r2(simMin - pausedAt), leftMin } });
  return draft;
}

/** Paused-task view: { label, patientId, leftSec, pausedAt } or null. */
export function pausedView(state, userId) {
  const p = state.students?.[userId]?.pausedTask;
  return p ? { label: p.label, patientId: p.patientId, leftSec: Math.ceil(p.leftMin * 60), pausedAt: p.pausedAt } : null;
}

/** Instructor ends a student's task early: it counts as done now (logged as ended by the instructor). */
export function endTaskNow(state, userId, ctx) {
  const t = currentTask(state, userId);
  if (!t) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, ctx.now);
  append(draft, { simMin, wallTime: ctx.now, ...ctx.user, patientId: t.patientId, action: 'task-ended-early', details: { taskId: t.id, label: t.label, studentId: userId, leftMin: Math.round((t.endsAt - simMin) * 100) / 100 } });
  applyTask(draft, userId, t, simMin, ctx, 'ended-early');
  return draft;
}

/** Busy view for screens: { label, patientId, startedAt, endsAt, leftSec, fraction } or null. */
export function busyView(state, userId, simMin) {
  const t = currentTask(state, userId);
  if (!t) return null;
  const total = t.lockSec / 60; // active time the task needs; pauses don't count
  return { label: t.label, patientId: t.patientId, startedAt: t.startedAt, endsAt: t.endsAt, leftSec: Math.max(0, Math.ceil((t.endsAt - simMin) * 60)), fraction: total > 0 ? Math.min(1, activeMinutes(t, simMin) / total) : 1, resumed: Boolean(t.activeMin) };
}
