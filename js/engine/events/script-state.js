// script-state: puts a scripted patient into one of its states (payload.to), e.g. a scenario change at 09:30 that
// starts "Crashing". The state's vitals, rhythm, findings and assessments apply, as when a reaction changes state.
import { enterState } from '../reactions/effects.js';

export default {
  type: 'script-state',
  apply(draft, event, { simMin, patientId, template, catalogs, now }) {
    const ps = draft.patients[patientId];
    if (!ps.script || !template?.script) { console.warn(`script-state ${event.id}: ${patientId} has no script`); return; }
    enterState(draft, patientId, event.payload.to, { t: simMin, now, user: { userId: 'system', role: 'system' }, cause: { kind: 'event', eventId: event.id }, template, catalogs, settings: draft.settings });
    ps.script.at = Math.max(ps.script.at, simMin);
  },
  describe: (event) => `Patient state → ${event.payload.to}`,
};
