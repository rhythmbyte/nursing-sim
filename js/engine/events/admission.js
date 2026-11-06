// admission: a new patient arrives on the unit.
// - settings.chargeNurse "off": the patient goes straight to its scenario group.
// - otherwise: the patient waits on the charge nurse's admissions board (engine/admissions.js), who
//   assigns them to a group or holds them. Not present (no student sees them) until assigned.
import { addAlert } from '../alerts.js';

export default {
  type: 'admission',
  apply(draft, event, { simMin, patientId }) {
    const ps = draft.patients[patientId];
    if (ps.present || ps.admission) return;
    const message = event.payload.message || 'New admission';
    if (draft.settings.chargeNurse === 'off') {
      ps.present = true;
      ps.arrivedAtMin = simMin;
      addAlert(draft, { simMin, patientId, kind: 'admission', message, audience: ['instructor', 'student'] });
      return;
    }
    ps.admission = { status: 'pending', arrivedAtMin: simMin, message, suggestedGroupId: ps.groupId };
    addAlert(draft, { simMin, patientId, kind: 'admission', message: `${message} Waiting on the admissions board.`, audience: ['instructor', 'charge'] });
  },
  describe: () => 'Admission',
};
