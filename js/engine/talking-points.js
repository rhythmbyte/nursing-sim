// Group debrief (pure, no DOM): Tier 1 summary per group and Tier 2 talking points. The wording and themes are data
// (data/catalogs/debrief-points.json); this file only gathers the evidence. ctx = runner.rulesCtx().
//   groupSummary(state, group, ctx) → { groupId, name, students, patientIds, onTime, late, veryLate, never, open,
//     misprioritized, red, amber, callLightAvgMin, alarmAvgMin, status }
//   talkingPoints(state, group, ctx) → [{ id, theme, text, patientId, userId, evidence: { section, atMin } }]
// Patients read "(C1) Robert Miller" (instructor only).

import { evaluateRules } from './rules/index.js';
import { debriefTimeliness, timelinessConfig } from './timeliness.js';
import { responseTimes } from './debrief.js';
import { penaltyTimeline } from './reactions/view.js';
import { delegationReview } from './staff-review.js';
import { groupStatus } from './command-center.js';
import { codeName } from './cases.js';
import { withoutStruck } from './struck.js';
import { round2 } from './time.js';

const PRIORITY_RULES = ['priority-order', 'priority-mismatch'];
const avg = (xs) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (all, k) => (v[k] != null ? String(v[k]) : all)).replace(/\s+/g, ' ').trim();

function groupParts(state, group, ctx) {
  const students = Object.entries(state.roster || {}).filter(([, r]) => r.groupId === group.id).map(([uid, r]) => ({ userId: uid, name: r.name }));
  const pids = Object.entries(state.patients).filter(([, ps]) => ps.groupId === group.id).map(([pid]) => pid);
  const ids = new Set(students.map((s) => s.userId));
  const flags = evaluateRules(withoutStruck(state), ctx).filter((f) => (f.patientId && pids.includes(f.patientId)) || f.userIds?.some((u) => ids.has(u)));
  return { students, pids, flags };
}

export function groupSummary(state, group, ctx) {
  const { students, pids, flags } = groupParts(state, group, ctx);
  const t = debriefTimeliness(state, pids, ctx).summary;
  const rt = responseTimes(withoutStruck(state), pids, ctx);
  const red = flags.filter((f) => f.severity === 'red').length;
  const amber = flags.filter((f) => f.severity === 'amber').length;
  const cfg = timelinessConfig(state, ctx.catalogs).groupStatus || {};
  return {
    groupId: group.id, name: group.name, students, patientIds: pids,
    onTime: t.onTime, late: t.late, veryLate: t.veryLate, never: t.never, open: t.open,
    misprioritized: flags.filter((f) => PRIORITY_RULES.includes(f.ruleId)).length,
    red, amber,
    callLightAvgMin: avg(rt.callLights.filter((c) => c.responseMin != null).map((c) => c.responseMin)),
    alarmAvgMin: avg(rt.alarms.filter((a) => a.responseMin != null).map((a) => a.responseMin)),
    status: groupStatus({ veryLate: t.veryLate + t.never, late: t.late, redFlags: red, amberFlags: amber }, cfg),
  };
}

export function talkingPoints(state, group, ctx) {
  const cat = ctx.catalogs?.debriefPoints;
  if (!cat) return [];
  const { students, pids, flags } = groupParts(state, group, ctx);
  const name = (pid) => (pid && ctx.templatesById[pid] ? codeName(ctx.templatesById[pid]) : 'The unit');
  const student = (uid) => students.find((s) => s.userId === uid)?.name || '';
  const out = [];
  const used = new Map(); // the same evidence twice (e.g. two identical orders) gets #2, #3… so ids stay unique and stable
  const add = (base, theme, text, { patientId = null, userId = null, section, atMin = null }) => {
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    out.push({ id: n > 1 ? `${base}#${n}` : base, theme, text, patientId, userId: userId ?? students[0]?.userId ?? null, evidence: { section, atMin } });
  };
  // Flags (one point each), worded per rule.
  for (const f of flags) {
    const r = cat.rules[f.ruleId] || cat.fallback;
    add(`flag:${f.ruleId}:${f.patientId || ''}:${f.atMin}:${(f.userIds || []).join(',')}`, r.theme, fill(r.text, { patient: name(f.patientId), message: f.message, student: student(f.userIds?.[0]) }),
      { patientId: f.patientId, userId: f.userIds?.[0], section: PRIORITY_RULES.includes(f.ruleId) ? 'priorities' : 'flags', atMin: f.atMin });
  }
  // Timeliness: very late and never-done orders, meds and reassessments.
  if (cat.timeliness) {
    for (const r of debriefTimeliness(state, pids, ctx).rows.filter((x) => x.tag === 'very-late' || x.tag === 'never')) {
      const text = r.tag === 'never' ? cat.timeliness.never : cat.timeliness.veryLate;
      add(`time:${r.patientId}:${r.kind}:${r.label}:${r.startAt}`, cat.timeliness.theme, fill(text, { patient: name(r.patientId), label: r.label, minutes: Math.round(r.minutes) }), { patientId: r.patientId, section: 'timeliness', atMin: r.startAt });
    }
  }
  // Delegation: tasks that waited long for a helper.
  if (cat.delegationWait) {
    const seen = new Set();
    for (const s of students) {
      for (const r of delegationReview(state, s.userId, pids, ctx).rows.filter((x) => x.waitMin >= (cat.delegationWait.minWaitMin ?? 10))) {
        const id = `wait:${r.patientId}:${r.label}:${r.requestedAt}`;
        if (seen.has(id)) continue;
        seen.add(id);
        add(id, cat.delegationWait.theme, fill(cat.delegationWait.text, { patient: name(r.patientId), label: r.label, minutes: Math.round(r.waitMin) }), { patientId: r.patientId, userId: s.userId, section: 'delegation', atMin: r.requestedAt });
      }
    }
  }
  // Recovery penalties earned (the patient lost ground).
  if (cat.penalty) {
    for (const pid of pids) {
      for (const p of penaltyTimeline(state, pid, ctx.templatesById[pid], ctx.catalogs).filter((x) => x.kind === 'earned')) {
        add(`pen:${pid}:${p.atMin}`, cat.penalty.theme, fill(cat.penalty.text, { patient: name(pid), label: p.text }), { patientId: pid, section: 'scripts', atMin: p.atMin });
      }
    }
  }
  // Each case's "should recognize" items (patient-level and per scenario change).
  if (cat.shouldRecognize) {
    for (const pid of pids.filter((x) => state.patients[x].present)) {
      const d = ctx.templatesById[pid]?.debrief || {};
      [...(d.shouldRecognize || []), ...Object.values(d.byChange || {}).flat()].forEach((item, i) => {
        add(`sr:${pid}:${i}`, cat.shouldRecognize.theme, fill(cat.shouldRecognize.text, { patient: name(pid), item }), { patientId: pid, section: 'recognize' });
      });
    }
  }
  const order = Object.fromEntries(cat.themes.map((t, i) => [t.id, i]));
  return out.sort((a, b) => (order[a.theme] ?? 99) - (order[b.theme] ?? 99) || (a.evidence.atMin ?? 1e9) - (b.evidence.atMin ?? 1e9));
}
