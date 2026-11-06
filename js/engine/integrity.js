// Broken-reference checks across data files (run by the loader and the tests). Pure, no DOM.
// JSON Schema checks shapes; this checks that ids point at things that exist. Each problem names the
// field, the missing id, and where it should be defined.

import { rhythmProblems } from './monitor.js';

const has = (set, id) => set.has(id);

/** Problems in one patient template against the catalogs. */
export function patientReferenceProblems(t, catalogs) {
  const p = [];
  const ivs = new Set((catalogs?.interventions?.interventions || []).map((i) => i.id));
  const labCodes = new Set((catalogs?.labs?.labs || []).map((l) => l.code));
  const eventIds = new Set(t.events.map((e) => e.id));
  const orderIds = new Set(t.orders.map((o) => o.id));
  const orderSets = new Set(t.orders.map((o) => o.orderSet));
  const keyframes = new Set((t.vitals.keyframes || []).map((k) => k.eventId).filter(Boolean));
  const changes = new Set((t.findings.changes || []).map((c) => c.eventId));
  const iv = (where, id) => { if (!has(ivs, id)) p.push(`${where}: intervention "${id}" is not in data/catalogs/interventions.json`); };

  for (const o of t.orders) {
    const at = `orders "${o.id}"`;
    (o.interventionIds || []).forEach((id) => iv(`${at} interventionIds`, id));
    (o.labCodes || []).forEach((c) => { if (!has(labCodes, c)) p.push(`${at} labCodes: lab "${c}" is not in data/catalogs/labs.json`); });
    if (o.activeOnEvent && !has(eventIds, o.activeOnEvent)) p.push(`${at} activeOnEvent: no event "${o.activeOnEvent}" in this patient`);
    (o.prn?.requiresBefore || []).forEach((id) => iv(`${at} prn.requiresBefore`, id));
    if (o.parameter?.requires) iv(`${at} parameter.requires`, o.parameter.requires);
    if (o.parameter?.watchEvent && !has(eventIds, o.parameter.watchEvent)) p.push(`${at} parameter.watchEvent: no event "${o.parameter.watchEvent}" in this patient`);
    if (o.parameter?.watch?.startsWith('labs.') && !has(labCodes, o.parameter.watch.slice(5))) p.push(`${at} parameter.watch: lab "${o.parameter.watch.slice(5)}" is not in the labs catalog`);
  }
  for (const e of t.events) {
    const at = `events "${e.id}"`;
    if (e.type === 'vitals-change' && !has(keyframes, e.payload?.keyframe)) p.push(`${at}: no vitals keyframe "${e.payload?.keyframe}" (vitals.keyframes[].eventId)`);
    if (e.type === 'findings-change' && !has(changes, e.payload?.change)) p.push(`${at}: no finding change "${e.payload?.change}" (findings.changes[].eventId)`);
    if (e.type === 'new-orders' && !has(orderSets, e.payload?.orderSet)) p.push(`${at}: no orders in order set "${e.payload?.orderSet}"`);
  }
  for (const [i, l] of t.labs.entries()) {
    if (!has(labCodes, l.code)) p.push(`labs[${i}]: lab "${l.code}" is not in data/catalogs/labs.json`);
    if (l.forOrder && !has(orderIds, l.forOrder)) p.push(`labs[${i}] forOrder: no order "${l.forOrder}" in this patient`);
  }
  (t.codeBranch?.trigger?.ifNotCharted || []).forEach((id) => iv('codeBranch.trigger.ifNotCharted', id));
  p.push(...rhythmProblems(t, catalogs));
  return p;
}

/** Problems in a scenario against the patient library. */
export function scenarioReferenceProblems(s, patientIds) {
  const p = [];
  const groupIds = new Set(s.groups.map((g) => g.id));
  for (const g of s.groups) {
    for (const id of [...(g.patients || []), ...(g.admissions || [])]) {
      if (!patientIds.has(id)) p.push(`groups "${g.id}": patient "${id}" is not in the library (missing or failed its checks)`);
    }
  }
  for (const gid of Object.keys(s.manualStudents || {})) if (!groupIds.has(gid)) p.push(`manualStudents: no group "${gid}"`);
  return p;
}
