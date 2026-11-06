// What the bedside monitor may show for a patient. Pure, no DOM (the display is screens/monitor/).
// - Only what the patient is connected for: "Connect to monitor" (all leads), active orders or charting
//   whose catalog intervention has monitorConnects (tele → ECG, continuous pulse ox → SpO₂), NIBP cycle on.
// - Never manual vitals: no pain or GCS; temp only with a temp probe (patient data monitor.tempProbe).
// - Rhythm comes from vitals (data/catalogs/rhythms.json; aliases accepted, e.g. a code's "PEA").
// - Alarms from data: vitals.json alarmLimits, and rhythms with alarm: true.

import { simMinOf } from './session.js';
import { append } from './log.js';

export function resolveRhythm(catalogs, name) {
  const all = catalogs?.rhythms?.rhythms || {};
  if (!name) return null;
  if (all[name]) return { id: name, ...all[name] };
  const n = String(name).toLowerCase();
  const hit = Object.entries(all).find(([id, r]) => id === n || (r.aliases || []).some((a) => a.toLowerCase() === n) || r.label.toLowerCase() === n);
  return hit ? { id: hit[0], ...hit[1] } : null;
}

/** Monitor leads connected: { ecg, spo2, nibp, temp }. */
export function connections(state, pid, template, catalogs) {
  const ps = state.patients[pid];
  const leads = new Set();
  const ivs = Object.fromEntries((catalogs?.interventions?.interventions || []).map((i) => [i.id, i]));
  if (ps.monitorLink) (catalogs?.vitals?.monitorLeads?.all || ['ecg', 'spo2', 'nibp']).forEach((l) => leads.add(l));
  for (const o of template.orders) {
    if (ps.orders[o.id] && ps.orders[o.id].status !== 'done') for (const id of o.interventionIds || []) (ivs[id]?.monitorConnects || []).forEach((l) => leads.add(l));
  }
  for (const l of state.log) {
    if (l.patientId === pid && l.action === 'intervention' && !l.details.delegatedTo) (ivs[l.details.interventionId]?.monitorConnects || []).forEach((x) => leads.add(x));
  }
  if (ps.monitor) leads.add('nibp');
  return { ecg: leads.has('ecg'), spo2: leads.has('spo2'), nibp: leads.has('nibp'), temp: Boolean(template.monitor?.tempProbe) };
}

const out = (v, [lo, hi] = []) => v != null && ((lo != null && v < lo) || (hi != null && v > hi));

/** Everything the monitor displays, already filtered to what's connected. simMin (optional) = for alarm silence. */
export function monitorView(state, pid, template, catalogs, simMin = null) {
  const ps = state.patients[pid];
  const c = connections(state, pid, template, catalogs);
  const rhythm = resolveRhythm(catalogs, ps.vitals.rhythm) || resolveRhythm(catalogs, 'sinus');
  const pulse = !rhythm?.pulseless; // rhythms.json pulseless: true (VF, pVT, PEA, asystole)
  const lastNibp = [...ps.flowsheet].filter((r) => r.source === 'monitor' && r.values.bp).sort((a, b) => a.atMin - b.atMin).at(-1);
  const hr = c.ecg && rhythm?.showsRate !== false ? ps.vitals.hr ?? null : null;
  const spo2 = c.spo2 && pulse ? ps.vitals.spo2 ?? null : null;
  const view = {
    connected: c,
    rhythm: c.ecg ? rhythm : null,
    pulse,
    hr, spo2,
    pulseRate: c.spo2 && pulse ? ps.vitals.hr ?? null : null,
    rr: c.ecg && pulse ? ps.vitals.rr ?? null : null, // impedance RR from the ECG leads; '--' when pulseless
    bp: c.nibp && lastNibp ? lastNibp.values.bp : null,
    bpAtMin: c.nibp && lastNibp ? lastNibp.atMin : null,
    o2: ps.vitals.o2 ?? null,
    tempF: c.temp ? ps.vitals.tempF ?? null : null,
  };
  const lim = catalogs?.vitals?.alarmLimits || {};
  const [sbp, dbp] = String(view.bp || '').split('/').map(Number);
  view.alarms = [
    out(view.hr, lim.hr) && 'hr', out(view.spo2, lim.spo2) && 'spo2', out(view.rr, lim.rr) && 'rr',
    view.bp && (out(sbp, lim.sbp) || out(dbp, lim.dbp)) && 'nibp',
    c.ecg && rhythm?.alarm && 'rhythm',
  ].filter(Boolean);
  view.silenced = simMin != null && (ps.alarm?.silencedUntil ?? -1) > simMin;
  return view;
}

/** Student connects the patient to the bedside monitor (all leads). Logged. */
export function connectMonitor(state, patientId, _args, { now, user }) {
  if (state.patients[patientId].monitorLink) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  draft.patients[patientId].monitorLink = { atMin: simMin, by: user.userId };
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'monitor-connected' });
  return draft;
}

/** Data check: every rhythm named in a patient's vitals exists in the rhythms catalog. */
export function rhythmProblems(t, catalogs) {
  const names = [t.vitals.baseline.rhythm, ...(t.vitals.keyframes || []).map((k) => k.values?.rhythm)].filter(Boolean);
  return names.filter((n) => !resolveRhythm(catalogs, n)).map((n) => `vitals rhythm "${n}" is not in data/catalogs/rhythms.json`);
}

