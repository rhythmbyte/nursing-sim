// vitals-change: applies the keyframe whose eventId === payload.keyframe to the patient's current vitals.
// After the instructor adjusts vitals live, settings.scriptedVitalsAfterInstructor decides: 'apply' (the scripted
// change wins and ends the instructor's trend/override) or 'skip' (the instructor stays in control). SPEC §14.
import { recordVitals } from '../vitals-control.js';
import { addAlert } from '../alerts.js';

export default {
  type: 'vitals-change',
  apply(draft, event, { simMin, patientId, template }) {
    const kf = template.vitals.keyframes?.find((k) => k.eventId === event.payload.keyframe);
    if (!kf) {
      console.warn(`vitals-change ${event.id}: no keyframe "${event.payload.keyframe}"`);
      return;
    }
    const ps = draft.patients[patientId];
    if (ps.vitalsOverride && draft.settings.scriptedVitalsAfterInstructor === 'skip') {
      addAlert(draft, { simMin, patientId, kind: 'vitals', message: `Scripted vitals change skipped (instructor has control): ${event.id}`, audience: ['instructor'] });
      return;
    }
    Object.assign(ps.vitals, kf.values);
    ps.vitalsTrend = null;
    ps.vitalsOverride = false;
    recordVitals(ps, simMin);
  },
  describe: (event) => `Vitals change (${event.payload.keyframe})`,
};
