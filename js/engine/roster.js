// Students joining the sim with the join code (SPEC §10). Pure; rng injected.
import { simMinOf } from './session.js';
import { append } from './log.js';
import { addAlert } from './alerts.js';
import { placeStudent } from './assignment.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const awayMinutes = (state, userId, now) => {
  const last = [...state.log].reverse().find((l) => l.userId === userId);
  return last ? Math.max(0, Math.round((now - Date.parse(last.wallTime)) / 6000) / 10) : null;
};

/**
 * Returns { state, error, token?, rejoinAs?, pending? }. On a first join the student is in state.roster[userId] and gets
 * a rejoin token (the device keeps it). Joining again with the same name REJOINS that student (same userId and group):
 * at once with the token, otherwise as a request the instructor approves in Live control.
 */
export function joinSim(state, { userId, name, code, token = null }, { scenario, now, rng = Math.random }) {
  if (String(code || '').trim().toUpperCase() !== state.joinCode) return { state, error: 'That join code is not right.' };
  const existing = Object.entries(state.roster).find(([, r]) => norm(r.name) === norm(name));
  if (existing || state.roster[userId]) {
    const [id, r] = existing || [userId, state.roster[userId]];
    const simMin = simMinOf(state, now);
    const draft = structuredClone(state);
    if (id === userId || (token && state.rejoinTokens?.[id] === token)) {
      append(draft, { simMin, wallTime: now, userId: id, role: 'student', action: 'student-rejoined', details: { name: r.name, groupId: r.groupId, awayMin: awayMinutes(state, id, now), via: id === userId ? 'same device' : 'token' } });
      addAlert(draft, { simMin, kind: 'roster', message: `${r.name} rejoined.`, audience: ['instructor'] });
      return { state: draft, error: null, rejoinAs: id, token: state.rejoinTokens?.[id] || null };
    }
    const req = (draft.rejoinRequests ??= []).find((q) => q.userId === id && q.fromUserId === userId && q.status === 'pending');
    if (!req) draft.rejoinRequests.push({ id: `rq${draft.rejoinRequests.length + 1}`, userId: id, name: r.name, fromUserId: userId, atMin: simMin, status: 'pending' });
    append(draft, { simMin, wallTime: now, userId: id, role: 'student', action: 'rejoin-requested', details: { name: r.name, fromUserId: userId } });
    addAlert(draft, { simMin, kind: 'roster', message: `${r.name} is rejoining from another device: approve in Live control.`, audience: ['instructor'] });
    return { state: draft, error: `Your instructor will confirm it's you, ${r.name}. Keep this page open.`, pending: true };
  }
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
  const tok = Array.from({ length: 16 }, () => Math.floor(rng() * 36).toString(36)).join('');
  (draft.rejoinTokens ??= {})[userId] = tok; // the device keeps it to rejoin later (full build: the login)
  append(draft, { simMin, wallTime: now, userId, role: 'student', action: 'joined', details: { name: name.trim(), groupId: placed.groupId } });
  return { state: draft, error: null, token: tok };
}

/** Instructor approves / denies "Ana is rejoining" (when the device has no token). Logged. */
export function decideRejoin(state, requestId, approve, { now, user }) {
  const req = (state.rejoinRequests || []).find((q) => q.id === requestId && q.status === 'pending');
  if (!req) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  Object.assign(draft.rejoinRequests.find((q) => q.id === requestId), { status: approve ? 'approved' : 'denied', decidedAtMin: simMin });
  append(draft, { simMin, wallTime: now, ...user, action: approve ? 'rejoin-approved' : 'rejoin-denied', details: { requestId, studentId: req.userId, name: req.name, awayMin: approve ? awayMinutes(state, req.userId, now) : undefined } });
  return draft;
}

/** A device came back after a reload / crash / closed tab: logged with the time away (for whoever was using it). */
export function logReconnect(state, { userId, role, awayMin, now }) {
  const draft = { ...state, log: [...state.log] };
  append(draft, { simMin: simMinOf(state, now), wallTime: now, userId, role, action: 'reconnected', details: { awayMin } });
  return draft;
}
