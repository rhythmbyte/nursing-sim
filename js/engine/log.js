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
  draft.log.push(entry);
  return entry;
}

export const SYSTEM = { userId: 'system', role: 'system' };
