// Attention queue (pure, no DOM): one prioritized list of what the instructor might act on now, built from the
// Command center groups (engine/command-center.js) and the session. Each item is one click to the patient (or
// student) drawer. Urgency weights are data (catalogs/vitals.json attention, else these defaults).
// Autopilot patients (state.autopilot[pid]) raise nothing except a code or a red flag.
//   attentionQueue(state, ctx, groups, flags) → [{ id, kind, patientId?, userId?, groupId, label, urgency }]

const DEFAULT_WEIGHTS = { code: 100, alarm: 90, rejoin: 85, worsening: 70, callLight: 60, veryLate: 55, redFlag: 50, away: 45, penalty: 40, late: 30 };

export const onAutopilot = (state, pid) => Boolean(state.autopilot?.[pid]);

export function attentionQueue(state, ctx, groups, flags = []) {
  const w = { ...DEFAULT_WEIGHTS, ...(ctx.catalogs?.vitals?.attention || {}) };
  const out = [];
  const add = (kind, item) => out.push({ id: `${kind}:${item.patientId || item.userId || ''}`, kind, urgency: w[kind] ?? 0, ...item });
  const redByPatient = {};
  for (const f of flags) if (f.severity === 'red' && f.patientId) (redByPatient[f.patientId] ??= []).push(f);
  for (const g of groups) {
    for (const p of g.patients) {
      const ps = state.patients[p.patientId];
      const auto = onAutopilot(state, p.patientId);
      const base = { patientId: p.patientId, groupId: g.groupId };
      if (ps.code && !ps.code.outcome) add('code', { ...base, label: 'Coding' });
      const red = redByPatient[p.patientId] || [];
      if (red.length) add('redFlag', { ...base, label: red.length === 1 ? red[0].message : `${red.length} red flags`, urgency: w.redFlag + Math.min(10, red.length) });
      if (auto) continue; // autopilot: only a code or a red flag
      if (p.alarm) add('alarm', { ...base, label: `Monitor alarm: ${(ps.alarm.active || []).join(', ')}` });
      if (ps.callLight) { const m = Math.max(0, Math.floor(ctx.simMin - ps.callLight.since)); add('callLight', { ...base, label: `Call light ${m} min`, urgency: w.callLight + Math.min(25, m * 2) }); }
      if (p.trend === 'worse') add('worsening', { ...base, label: `Vitals worsening${p.script ? ` (${p.script.label})` : ''}` });
      if (p.script?.penalty) add('penalty', { ...base, label: `Recovery penalty ${p.script.penalty}%` });
      const worst = p.worst;
      if (worst && /very-late/.test(worst.tag)) add('veryLate', { ...base, label: `${worst.label}, ${Math.round(worst.minutes)} min`, urgency: w.veryLate + Math.min(10, Math.floor(worst.minutes / 10)) });
      else if (worst && /late/.test(worst.tag)) add('late', { ...base, label: `${worst.label}, ${Math.round(worst.minutes)} min` });
    }
    for (const st of g.students) if (st.away) add('away', { userId: st.userId, groupId: g.groupId, label: `${st.name} away ${st.away.awayMin} min` });
  }
  for (const q of state.rejoinRequests || []) if (q.status === 'pending') add('rejoin', { userId: q.userId, groupId: state.roster?.[q.userId]?.groupId ?? null, label: `${q.name} is rejoining from another device` });
  return out.sort((a, b) => b.urgency - a.urgency);
}

/** Patients that need attention (anything in the queue); everything else is "stable". */
export const attentionPatients = (queue) => new Set(queue.filter((q) => q.patientId).map((q) => q.patientId));
