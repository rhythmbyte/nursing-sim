// Instructor command center data: one summary per group, built on engine/timeliness.js and the flag rules.
// Pure, no DOM. Sorted so the group (and patient) needing attention most comes first.

import { totalPercent } from './penalties.js';
import { staffView } from './staff.js';
import { timelinessItems, timelinessConfig, tagRank, isLate, isVeryLate } from './timeliness.js';
import { evaluateRules } from './rules/index.js';
import { vitalNumber } from './vitals.js';
import { vitalsAt } from './vitals-control.js';

/** 'worse' | 'better' | 'steady': now vs windowMin ago (thresholds: vitals.json trend). */
export function vitalsTrend(ps, simMin, cfg) {
  if (!cfg) return 'steady';
  const then = vitalsAt(ps, simMin - cfg.windowMin);
  const d = (k) => { const a = vitalNumber(ps.vitals, k); const b = vitalNumber(then, k); return a == null || b == null ? 0 : a - b; };
  const [spo2, sbp, hr] = [d('spo2'), d('sbp'), d('hr')];
  if (spo2 <= -cfg.spo2Drop || sbp <= -cfg.sbpDrop || hr >= cfg.hrRise) return 'worse';
  if (spo2 >= cfg.spo2Drop || sbp >= cfg.sbpDrop || hr <= -cfg.hrRise) return 'better';
  return 'steady';
}

/** 'needs-attention' | 'falling-behind' | 'on-track' from counts and rules.timeliness.groupStatus. */
export function groupStatus(counts, rule = {}) {
  const hit = (min = {}) => Object.entries(min).some(([k, v]) => !k.startsWith('_') && (counts[k] ?? 0) >= v);
  if (hit(rule.needsAttention)) return 'needs-attention';
  if (hit(rule.fallingBehind)) return 'falling-behind';
  return 'on-track';
}
const STATUS_RANK = { 'needs-attention': 2, 'falling-behind': 1, 'on-track': 0 };

/** True when a group's status moved to a worse one (e.g. on-track → falling-behind). Unknown/first → false. */
export function statusWorsened(prev, next) {
  return prev != null && (STATUS_RANK[next] ?? 0) > (STATUS_RANK[prev] ?? 0);
}

/** Delegation helpers for a group card: { roles: [{ role, total, busy, onBreak }], queued, allBusy: [roles] }. */
export function staffing(state, groupId, ctx) {
  const v = staffView(state, groupId, ctx.simMin, ctx.catalogs);
  const roles = [...new Set(v.helpers.map((x) => x.role))].map((role) => {
    const hs = v.helpers.filter((x) => x.role === role);
    return { role, total: hs.length, busy: hs.filter((x) => x.status === 'busy').length, onBreak: hs.filter((x) => x.status === 'break').length };
  });
  return { roles, queued: v.queued.length, allBusy: roles.filter((r) => r.total && r.busy + r.onBreak >= r.total).map((r) => r.role) };
}

/** ctx: runner.rulesCtx() (templatesById, catalogs, simMin, studentIdsForGroup, …). */
export function commandCenter(state, ctx, scenario) {
  const items = timelinessItems(state, ctx);
  const flags = evaluateRules(state, ctx);
  const cfg = timelinessConfig(state, ctx.catalogs);
  const trendCfg = ctx.catalogs?.vitals?.trend;
  const lastOpened = (uid) => [...state.log].reverse().find((l) => l.userId === uid && l.action === 'patient-opened')?.patientId ?? null;

  const groups = scenario.groups.map((g) => {
    const pids = Object.entries(state.patients).filter(([, ps]) => ps.present && ps.groupId === g.id).map(([pid]) => pid);
    const mine = items.filter((i) => pids.includes(i.patientId));
    const open = mine.filter((i) => i.doneAt == null);
    const gFlags = flags.filter((f) => pids.includes(f.patientId));
    const lights = open.filter((i) => i.kind === 'callLight');
    const counts = {
      openOrders: open.filter((i) => i.kind === 'order').length,
      late: open.filter((i) => isLate(i.tag)).length + mine.filter((i) => i.doneAt != null && isLate(i.tag)).length,
      veryLate: mine.filter((i) => isVeryLate(i.tag)).length,
      medsOverdue: open.filter((i) => i.kind === 'med' && i.tag !== 'open').length,
      assessmentsOverdue: open.filter((i) => i.kind === 'assessment' && i.tag !== 'open').length,
      callLights: lights.length,
      longestCallLightMin: lights.length ? Math.max(...lights.map((i) => i.minutes)) : 0,
      alarms: pids.filter((pid) => state.patients[pid].alarm?.active?.length).length,
      redFlags: gFlags.filter((f) => f.severity === 'red').length,
      amberFlags: gFlags.filter((f) => f.severity === 'amber').length,
    };
    const patients = pids.map((pid) => {
      const worst = open.filter((i) => i.patientId === pid).sort((a, b) => tagRank(b.tag) - tagRank(a.tag) || b.minutes - a.minutes)[0] || null;
      const ps = state.patients[pid];
      const t = ctx.templatesById?.[pid];
      // Reactive script: current state label and recovery penalty (null when the patient has no script).
      const script = ps.script && t?.script ? { state: ps.script.state, label: t.script.states.find((s) => s.id === ps.script.state)?.label || ps.script.state, paused: ps.script.paused,
        penalty: Math.round(totalPercent(ps.penalties, ctx.simMin, state.settings.recoveryPenaltyMaxPercent ?? 60)) } : null;
      return { patientId: pid, tag: ps.tag, trend: vitalsTrend(ps, ctx.simMin, trendCfg), alarm: Boolean(ps.alarm?.active?.length), worst, script };
    }).sort((a, b) => tagRank(b.worst?.tag) - tagRank(a.worst?.tag) || (b.worst?.minutes ?? 0) - (a.worst?.minutes ?? 0));
    const students = Object.entries(state.roster || {}).filter(([, r]) => r.groupId === g.id).map(([uid, r]) => {
      const t = state.students?.[uid]?.task; // timed task in progress (engine/tasks.js)
      // Reconnected / rejoined in the last 10 sim minutes (shown as "↻ reconnected after 2 min").
      const c = [...state.log].reverse().find((l) => (l.action === 'reconnected' || l.action === 'student-rejoined') && l.userId === uid);
      const back = c && ctx.simMin - c.simMin <= 10 ? { awayMin: c.details.awayMin, atMin: c.simMin } : null;
      return { userId: uid, name: r.name, inPatient: lastOpened(uid), busy: t ? { label: t.label, patientId: t.patientId, leftMin: Math.max(0, t.endsAt - ctx.simMin) } : null, back };
    });
    return { groupId: g.id, name: g.name, students, counts, status: groupStatus(counts, cfg.groupStatus), patients, staffing: staffing(state, g.id, ctx) };
  });
  return groups.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || b.counts.veryLate - a.counts.veryLate || b.counts.late - a.counts.late);
}
