// assessment-change: updates what the patient's assessment tools will find (payload.answers = { toolId: { itemId: value } }).
// Part of a scenario change, alongside vitals, findings and orders. The student sees it only by assessing.
import { applyExpected } from '../assessments.js';

export default {
  type: 'assessment-change',
  apply(draft, event, { patientId }) {
    applyExpected(draft.patients[patientId], event.payload.answers);
  },
  describe: (event) => `Assessment findings change (${Object.keys(event.payload.answers || {}).join(', ')})`,
};
