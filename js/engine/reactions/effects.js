// Reaction effects (pure, mutate the draft; no DOM). Adding an effect = one entry in EFFECTS + schema enum.
// Effects reuse the existing engine: event types (call light, staff message, new orders, lab result, code)
// run through the registry, vitals go through setVitalsTarget (same as the instructor's Adjust vitals).
// fx = { t, user, cause, now, template, catalogs, settings, fireEvent, reactionLabel }

import { getEventType } from '../registry.js';
import { append } from '../log.js';
import { addAlert } from '../alerts.js';
import { cleanValues, setVitalsTarget, scriptedVitalsBlocked } from '../vitals-control.js';
import { penalizeTarget, earnPenalty } from '../penalties.js';
import { applyExpected } from '../assessments.js';

/** Patient vitals move toward a scripted target unless the instructor has control (scriptedVitalsAfterInstructor). */
function scriptedVitals(draft, pid, { values, overMin = 0 }, fx, { force = false } = {}) {
  const ps = draft.patients[pid];
  const target = cleanValues(values);
  if (!Object.keys(target).length) return;
  if (!force && scriptedVitalsBlocked(draft.settings, ps)) {
    addAlert(draft, { simMin: fx.t, patientId: pid, kind: 'vitals', message: `Scripted vitals skipped (instructor has control): ${fx.cause.reactionId || 'state'}`, audience: ['instructor'] });
    append(draft, { simMin: fx.t, wallTime: fx.now, ...fx.user, patientId: pid, action: 'script-vitals-skipped', details: { values: target, cause: fx.cause } });
    return;
  }
  const out = penalizeTarget(draft, pid, target, overMin, fx, fx.catalogs); // recovery penalties (engine/penalties.js)
  setVitalsTarget(ps, out.values, out.overMin, fx.t);
  ps.vitalsOverride = false; // the script has taken back over, as a scripted keyframe does
}

/** Queues a findings change (findings.changes[].eventId) to be revealed at the next assessment. */
function queueFindings(draft, pid, change) {
  const ps = draft.patients[pid];
  if (change && !ps.findingChanges.includes(change)) ps.findingChanges.push(change);
}

/**
 * Enters a script state: logs the transition (with its cause), then applies the state's vitals
 * (+ rhythm) and findings. `force` (instructor "Force state") applies vitals even if the instructor
 * has control of vitals.
 */
export function enterState(draft, pid, stateId, fx, { force = false } = {}) {
  const ps = draft.patients[pid];
  const sc = ps.script;
  const def = fx.template.script.states.find((s) => s.id === stateId);
  if (!def) { console.warn(`Reaction script: no state "${stateId}" on ${pid}`); return; }
  const from = sc.state;
  sc.state = stateId;
  sc.enteredAt = fx.t;
  append(draft, { simMin: fx.t, wallTime: fx.now, ...fx.user, patientId: pid, action: 'script-state', details: { from, to: stateId, label: def.label, cause: fx.cause } });
  addAlert(draft, { simMin: fx.t, patientId: pid, kind: 'script', message: `Script: ${def.label}${fx.cause.kind === 'timeout' ? ' (nothing done in time)' : fx.cause.kind === 'instructor' ? ' (forced)' : ''}`, audience: ['instructor'] });
  const values = { ...(def.vitals?.values || {}), ...(def.rhythm ? { rhythm: def.rhythm } : {}) };
  if (Object.keys(values).length) scriptedVitals(draft, pid, { values, overMin: def.vitals?.overMin || 0 }, fx, { force });
  queueFindings(draft, pid, def.findings);
  if (def.assessments) applyExpected(ps, def.assessments); // what this state's assessment tools will find
}

export const EFFECTS = {
  state: (draft, pid, e, fx) => enterState(draft, pid, e.to, fx),
  vitals: (draft, pid, e, fx) => scriptedVitals(draft, pid, e, fx),
  findings: (draft, pid, e) => queueFindings(draft, pid, e.change),
  /** Inline event of any registered type: { type: 'event', event: { type: 'call-light', payload } }. */
  event: (draft, pid, e, fx) => {
    const type = getEventType(e.event?.type);
    if (!type) { console.warn(`Reaction ${fx.cause.reactionId}: unknown event type "${e.event?.type}"`); return; }
    type.apply(draft, { id: `reaction:${fx.cause.reactionId}`, ...e.event, payload: e.event.payload || {} }, { simMin: fx.t, patientId: pid, template: fx.template });
  },
  /** Fires one of the patient's own events (and its linked group), as "Fire now" would. */
  fire: (draft, pid, e, fx) => fx.fireEvent(draft, pid, e.eventId, fx),
  /** Changes what the patient's assessment tools will find: { answers: { toolId: { itemId: value } } }. */
  assessment: (draft, pid, e) => applyExpected(draft.patients[pid], e.answers),
  /** Recovery penalty: limits how far later treatment can bring the patient back (engine/penalties.js). */
  penalty: (draft, pid, e, fx) => earnPenalty(draft, pid, e, { t: fx.t, now: fx.now, user: fx.user, cause: { ...fx.cause, label: fx.reactionLabel } }),
};

export const EFFECT_TYPES = Object.keys(EFFECTS);
