// code: patient arrests. Tag → black, code timer starts; instructor outcome controls come in phase 6.
import { addAlert } from '../alerts.js';

export default {
  type: 'code',
  apply(draft, event, { simMin, patientId }) {
    const ps = draft.patients[patientId];
    if (ps.code) return; // already coding
    ps.tag = 'black';
    ps.code = { startedMin: simMin, rhythm: event.payload.rhythm || null, outcome: null };
    addAlert(draft, { simMin, patientId, kind: 'code', message: event.payload.message || 'Patient is coding', audience: ['student', 'instructor', 'charge'] });
  },
  describe: (event) => `Code${event.payload.rhythm ? ` (${event.payload.rhythm})` : ''}`,
};
