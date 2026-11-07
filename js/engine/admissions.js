// Charge nurse decisions on the admissions board (SPEC §9). Pure; every decision is logged with time.
import { cloneState } from './clone.js';
import { round2 } from './time.js';
import { simMinOf } from './session.js';
import { append } from './log.js';
import { addAlert } from './alerts.js';


/** Assign a waiting (pending or held) admission to a group: the patient arrives for that group's students. */
export function assignAdmission(state, patientId, { groupId }, { now, user, scenario }) {
  const a = state.patients[patientId]?.admission;
  if (!a || a.status === 'assigned') return state;
  if (!scenario.groups.some((g) => g.id === groupId)) throw new Error(`No group ${groupId}`);
  const draft = cloneState(state);
  const simMin = simMinOf(state, now);
  const ps = draft.patients[patientId];
  Object.assign(ps.admission, { status: 'assigned', decidedAtMin: simMin, groupId });
  Object.assign(ps, { present: true, groupId, arrivedAtMin: simMin });
  ps.tagHistory.push({ atMin: simMin, tag: ps.tag }); // comparison starts when students get the patient
  // Orders that arrived while the patient waited start counting when a student actually gets them
  // (so tier timeouts don't run against students who couldn't see the patient). Original time kept.
  for (const os of Object.values(ps.orders)) {
    if (os.activeAtMin < simMin) Object.assign(os, { orderedAtMin: os.activeAtMin, activeAtMin: simMin });
  }
  addAlert(draft, { simMin, patientId, kind: 'admission', message: `New admission assigned to you: ${ps.admission.message}`, audience: ['student', 'instructor', 'charge'] });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'admission-assigned', details: { groupId, waitMin: round2(simMin - a.arrivedAtMin) } });
  return draft;
}

/** Hold a pending admission (e.g. EMS "holds the wall"); it can be assigned later. */
export function holdAdmission(state, patientId, { reason = '' }, { now, user }) {
  const a = state.patients[patientId]?.admission;
  if (!a || a.status !== 'pending') return state;
  const draft = cloneState(state);
  const simMin = simMinOf(state, now);
  Object.assign(draft.patients[patientId].admission, { status: 'held', heldAtMin: simMin, reason });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'admission-held', details: { reason, waitMin: round2(simMin - a.arrivedAtMin) } });
  return draft;
}

/** Admissions waiting on the board: [{ patientId, ...admission }]. */
export function waitingAdmissions(state) {
  return Object.entries(state.patients)
    .filter(([, ps]) => ps.admission && ps.admission.status !== 'assigned')
    .map(([patientId, ps]) => ({ patientId, ...ps.admission }));
}
