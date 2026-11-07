// Append-only action log. No DOM.
// Entry: { id, simMin, wallTime, userId, role, patientId, action, details }
// Every entry carries userId + role from day one (see SPEC §1).

import { round2 } from './time.js';

/** Mutates `draft.log` by appending one entry; returns the entry. */
export function append(draft, { simMin, wallTime, userId, role, patientId = null, action, details = {} }) {
  if (!userId || !role || !action) throw new Error('log entry needs userId, role, action');
  const entry = {
    id: `l${draft.log.length + 1}`,
    simMin: round2(simMin),
    wallTime: new Date(wallTime).toISOString(),
    userId,
    role,
    patientId,
    action,
    details,
  };
  // Append-only: entries never change once written, so copies of the session share them (engine/clone.js).
  Object.freeze(entry.details);
  draft.log.push(Object.freeze(entry));
  return entry;
}

export const SYSTEM = { userId: 'system', role: 'system' };

// The log's entries for one patient, in log order. Indexed once per log array (a new array after every change), so
// rules and timeliness that look at each patient's history do one pass over the log instead of one per patient.
const byPatient = new WeakMap();
export function entriesFor(log, patientId) {
  let m = byPatient.get(log);
  if (!m) {
    m = new Map();
    for (const l of log) { if (!l.patientId) continue; let a = m.get(l.patientId); if (!a) m.set(l.patientId, (a = [])); a.push(l); }
    byPatient.set(log, m);
  }
  return m.get(patientId) || [];
}
