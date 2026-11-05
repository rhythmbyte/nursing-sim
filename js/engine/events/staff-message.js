// staff-message: a message from the CNA/LPN/family to the student.
import { addAlert } from '../alerts.js';

export default {
  type: 'staff-message',
  apply(draft, event, { simMin, patientId }) {
    const from = event.payload.from ? `${event.payload.from}: ` : '';
    addAlert(draft, { simMin, patientId, kind: 'staff-message', message: from + (event.payload.message || '') });
  },
  describe: (event) => `Message from ${event.payload.from || 'staff'}`,
};
