// admission: a new patient arrives on the unit. The patient becomes present; the charge nurse
// (phase 7) or the scenario's group decides who gets them.
import { addAlert } from '../alerts.js';

export default {
  type: 'admission',
  apply(draft, event, { simMin, patientId }) {
    const ps = draft.patients[patientId];
    if (ps.present) return;
    ps.present = true;
    ps.arrivedAtMin = simMin;
    addAlert(draft, { simMin, patientId, kind: 'admission', message: event.payload.message || 'New admission', audience: ['instructor', 'charge', 'student'] });
  },
  describe: () => 'Admission',
};
