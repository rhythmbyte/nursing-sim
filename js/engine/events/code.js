// code: patient arrests. Instructor tag → settings.codeTag, code timer starts; the instructor records
// ROSC / no ROSC in Live control (engine/instructor.js).
import { addAlert } from '../alerts.js';
import { setInstructorTag } from '../priority.js';
import { recordVitals } from '../vitals-control.js';

export default {
  type: 'code',
  apply(draft, event, { simMin, patientId }) {
    const ps = draft.patients[patientId];
    if (ps.code) return; // already coding
    setInstructorTag(ps, draft.settings.codeTag, simMin);
    // Planned outcome and ROSC rhythm (guided builder) are shown to the instructor, who still records the outcome.
    ps.code = { startedMin: simMin, rhythm: event.payload.rhythm || null, outcome: null, planned: event.payload.outcome || null, roscRhythm: event.payload.roscRhythm || null };
    // The monitor shows the arrest rhythm (names resolve via rhythms.json aliases, e.g. "PEA").
    if (event.payload.rhythm) { ps.vitals.rhythm = event.payload.rhythm; recordVitals(ps, simMin); }
    addAlert(draft, { simMin, patientId, kind: 'code', message: event.payload.message || 'Patient is coding', audience: ['student', 'instructor', 'charge'] });
  },
  describe: (event) => `Code${event.payload.rhythm ? ` (${event.payload.rhythm})` : ''}`,
};
