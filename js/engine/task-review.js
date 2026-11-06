// Debrief for task timers (pure): per student, each timed task (time spent, finished / interrupted / ended early),
// total busy vs idle, and what went late on their patients while they were tied up (engine/timeliness.js thresholds).

import { timelinessItems, timelinessConfig } from './timeliness.js';
import { round2 } from './time.js';

const lateMinOf = (i, cfg) => (i.kind === 'order' ? cfg.orders?.[i.tier]?.lateMin : i.kind === 'med' ? cfg.scheduledMeds?.lateMin : i.kind === 'callLight' ? cfg.callLights?.lateMin
  : i.kind === 'alarm' ? cfg.alarms?.lateMin : i.kind === 'assessment' ? cfg.assessments?.lateMin : null);

/** { rows: [{ taskId, label, patientId, startedAt, endedAt, minutes, outcome }], busyMin, idleMin, interrupted, waiting: [{ label, patientId, lateAt, during }] } */
export function taskReview(state, userId, pids, ctx) {
  const nowMin = ctx.simMin; // the clock stops where the sim ended (End or end of shift)
  const end = new Map(state.log.filter((l) => ['task-finished', 'task-interrupted'].includes(l.action)).map((l) => [l.details.taskId, l]));
  // Active periods per task (pauses excluded): started/resumed → paused/finished/interrupted.
  const periods = {};
  for (const l of state.log) {
    const id = l.details?.taskId;
    if (!id || !l.action.startsWith('task-')) continue;
    const p = (periods[id] ??= []);
    if (l.action === 'task-started' || l.action === 'task-resumed') p.push([l.simMin, null]);
    else if (['task-paused', 'task-finished', 'task-interrupted'].includes(l.action) && p.length && p.at(-1)[1] == null) p.at(-1)[1] = l.simMin;
  }
  const pausedId = state.students?.[userId]?.pausedTask?.id;
  const rows = state.log.filter((l) => l.action === 'task-started' && l.userId === userId).map((l) => {
    const e = end.get(l.details.taskId);
    const ps = (periods[l.details.taskId] || []).map(([a, b]) => [a, b ?? nowMin]);
    return { taskId: l.details.taskId, label: l.details.label, patientId: l.patientId, startedAt: l.simMin, endedAt: e ? e.simMin : null, periods: ps,
      minutes: e ? e.details.minutes ?? round2(e.simMin - l.simMin) : round2(ps.reduce((s, [a, b]) => s + (b - a), 0)),
      paused: state.log.some((x) => x.action === 'task-paused' && x.details.taskId === l.details.taskId),
      outcome: e ? (e.action === 'task-interrupted' ? 'interrupted' : e.details.how === 'ended-early' ? 'ended early' : 'finished') : l.details.taskId === pausedId ? 'paused' : 'in progress' };
  });
  const busyMin = round2(rows.reduce((s, r) => s + r.minutes, 0));
  const joined = state.roster?.[userId]?.joinedAtMin ?? 0;
  const cfg = timelinessConfig(state, ctx.catalogs);
  const intervals = rows.flatMap((r) => r.periods.map(([a, b]) => [a, b, r.label]));
  const waiting = timelinessItems(state, ctx).filter((i) => pids.includes(i.patientId)).flatMap((i) => {
    const late = lateMinOf(i, cfg);
    if (late == null) return [];
    const lateAt = i.startAt + late;
    if (i.doneAt != null && i.doneAt <= lateAt) return [];
    const during = intervals.find(([a, b]) => lateAt >= a && lateAt <= b);
    return during ? [{ kind: i.kind, label: i.label, patientId: i.patientId, lateAt: round2(lateAt), during: during[2] }] : [];
  });
  return { rows, busyMin, idleMin: round2(Math.max(0, nowMin - joined - busyMin)), interrupted: rows.filter((r) => r.outcome === 'interrupted').length, waiting };
}
