// Debrief for task timers (pure): per student, each timed task (time spent, finished / interrupted / ended early),
// total busy vs idle, and what went late on their patients while they were tied up (engine/timeliness.js thresholds).

import { timelinessItems, timelinessConfig } from './timeliness.js';
import { round2 } from './time.js';

const lateMinOf = (i, cfg) => (i.kind === 'order' ? cfg.orders?.[i.tier]?.lateMin : i.kind === 'med' ? cfg.scheduledMeds?.lateMin : i.kind === 'callLight' ? cfg.callLights?.lateMin
  : i.kind === 'alarm' ? cfg.alarms?.lateMin : i.kind === 'assessment' ? cfg.assessments?.lateMin : null);

/** { rows: [{ taskId, label, patientId, startedAt, endedAt, minutes, outcome }], busyMin, idleMin, interrupted, waiting: [{ label, patientId, lateAt, during }] } */
export function taskReview(state, userId, pids, ctx) {
  const ended = state.clock.status === 'ended';
  const nowMin = ended && state.endMin != null ? state.endMin : ctx.simMin;
  const end = new Map(state.log.filter((l) => ['task-finished', 'task-interrupted'].includes(l.action)).map((l) => [l.details.taskId, l]));
  const rows = state.log.filter((l) => l.action === 'task-started' && l.userId === userId).map((l) => {
    const e = end.get(l.details.taskId);
    const endedAt = e ? e.simMin : (state.students?.[userId]?.task?.id === l.details.taskId ? null : l.details.endsAt);
    return { taskId: l.details.taskId, label: l.details.label, patientId: l.patientId, startedAt: l.simMin, endedAt,
      minutes: round2((endedAt ?? nowMin) - l.simMin), outcome: !e ? 'in progress' : e.action === 'task-interrupted' ? 'interrupted' : e.details.how === 'ended-early' ? 'ended early' : 'finished' };
  });
  const busyMin = round2(rows.reduce((s, r) => s + r.minutes, 0));
  const joined = state.roster?.[userId]?.joinedAtMin ?? 0;
  const cfg = timelinessConfig(state, ctx.catalogs);
  const intervals = rows.map((r) => [r.startedAt, r.endedAt ?? nowMin, r.label]);
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
