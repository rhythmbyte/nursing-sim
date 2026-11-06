// Students joining the sim with the join code (SPEC §10). Pure; rng injected.
import { simMinOf } from './session.js';
import { append } from './log.js';
import { addAlert } from './alerts.js';
import { placeStudent } from './assignment.js';

/** Returns { state, error }. On success the student is in state.roster[userId]. */
export function joinSim(state, { userId, name, code }, { scenario, now, rng = Math.random }) {
  if (state.roster[userId]) return { state, error: 'Already joined.' };
  if (String(code || '').trim().toUpperCase() !== state.joinCode) return { state, error: 'That join code is not right.' };
  const placed = placeStudent(state.roster, scenario, name, rng);
  const simMin = simMinOf(state, now);
  if (placed.error) {
    if (!placed.overflow) return { state, error: placed.error };
    const draft = structuredClone(state);
    addAlert(draft, { simMin, kind: 'roster', message: `${name.trim()} tried to join but every group is full.`, audience: ['instructor'] });
    return { state: draft, error: placed.error };
  }
  const draft = structuredClone(state);
  draft.roster[userId] = { name: name.trim(), groupId: placed.groupId, joinedAtMin: simMin };
  append(draft, { simMin, wallTime: now, userId, role: 'student', action: 'joined', details: { name: name.trim(), groupId: placed.groupId } });
  return { state: draft, error: null };
}
