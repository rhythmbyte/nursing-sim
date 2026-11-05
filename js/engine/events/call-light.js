// call-light: lights the patient's call light. Answering it (session.answerCallLight) logs response time.
// Repeats ("every 4 min") come from the event's repeatEveryMin/repeatCount; a repeat while still lit counts a ring.
import { addAlert } from '../alerts.js';

export default {
  type: 'call-light',
  apply(draft, event, { simMin, patientId }) {
    const ps = draft.patients[patientId];
    if (ps.callLight) {
      ps.callLight.rings += 1;
      ps.callLight.message = event.payload.message || ps.callLight.message;
    } else {
      ps.callLight = { since: simMin, eventId: event.id, message: event.payload.message || 'Call light on', rings: 1 };
    }
    addAlert(draft, { simMin, patientId, kind: 'call-light', message: ps.callLight.message });
  },
  describe: (event) => `Call light: ${event.payload.message || ''}`,
};
