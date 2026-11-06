// Debrief for the staff pool (pure): what the student delegated, to whom, how long it waited for a free helper, what
// was queued, and helper utilization per group (busy minutes ÷ helper minutes so far).

import { round2 } from './time.js';

export function delegationReview(state, userId, pids, ctx) {
  const nowMin = ctx.simMin; // the clock stops where the sim ended
  const label = (t) => (t.assessmentToolId ? ctx.catalogs?.assessmentTools?.tools.find((x) => x.id === t.assessmentToolId)?.name : ctx.catalogs?.interventions?.interventions.find((i) => i.id === t.interventionId)?.label) || t.interventionId;
  const tasks = Object.entries(state.patients).flatMap(([pid, ps]) => (ps.delegations || []).map((t) => ({ pid, t })));
  const rows = tasks.filter(({ t, pid }) => (t.by ? t.by === userId : pids.includes(pid))).map(({ pid, t }) => ({
    patientId: pid, label: label(t), to: t.to, helper: t.helperLabel || null, requestedAt: t.requestedAt, startedAt: t.startedAt ?? null,
    waitMin: t.startedAt != null ? round2(t.startedAt - t.requestedAt) : round2(nowMin - t.requestedAt), doneAt: t.completedAt ?? null, queued: t.queuedAt != null, status: t.status,
  })).sort((a, b) => a.requestedAt - b.requestedAt);
  const groups = [...new Set((state.staff || []).map((s) => s.groupId))].map((gid) => {
    const helpers = (state.staff || []).filter((s) => s.groupId === gid);
    const busy = tasks.filter(({ t }) => helpers.some((h) => h.id === t.helperId) && t.startedAt != null).reduce((sum, { t }) => sum + (Math.min(t.completedAt ?? nowMin, nowMin) - t.startedAt), 0);
    const capacity = helpers.length * nowMin;
    return { groupId: gid, helpers: helpers.length, busyMin: round2(busy), percent: capacity > 0 ? Math.round((busy / capacity) * 100) : 0 };
  });
  return { rows, queued: rows.filter((r) => r.queued).length, groups };
}
