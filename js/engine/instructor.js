// Instructor actions that aren't clock/event control. No DOM.
import { simMinOf } from './session.js';
import { append } from './log.js';

/** Mark that student(s) left an unstable patient unattended (flagged red by the left-unattended rule). */
export function markLeftUnattended(state, patientId, { studentIds, note = '' }, { now, user }) {
  if (!studentIds?.length) return state;
  const draft = structuredClone(state);
  append(draft, { simMin: simMinOf(state, now), wallTime: now, ...user, patientId, action: 'left-unattended', details: { studentIds, note } });
  return draft;
}
