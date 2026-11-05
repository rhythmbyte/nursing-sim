// lab-result: releases a pending lab. payload: { code, label? } — label picks among labs sharing a code.
import { addAlert } from '../alerts.js';

export default {
  type: 'lab-result',
  apply(draft, event, { simMin, patientId }) {
    const { code, label } = event.payload;
    const lab = draft.patients[patientId].labs.find(
      (l) => l.code === code && l.status === 'pending' && (!label || l.label === label),
    );
    if (!lab) {
      console.warn(`lab-result ${event.id}: no pending lab "${code}"`);
      return;
    }
    lab.status = 'resulted';
    lab.resultedAtMin = simMin;
    addAlert(draft, { simMin, patientId, kind: 'lab-result', message: `Lab resulted: ${lab.label || code}` });
  },
  describe: (event) => `Lab result (${event.payload.code})`,
};
