// new-orders: activates an order set and alerts the student.
// Orders with activeOnEvent === this event's id are activated by the session for ANY event type;
// this type additionally activates every not-yet-active order in payload.orderSet.
import { addAlert } from '../alerts.js';

export default {
  type: 'new-orders',
  apply(draft, event, { simMin, patientId, template }) {
    const ps = draft.patients[patientId];
    for (const o of template.orders) {
      if (o.orderSet === event.payload.orderSet && !ps.orders[o.id]) {
        ps.orders[o.id] = { status: 'new', activeAtMin: simMin };
      }
    }
    addAlert(draft, { simMin, patientId, kind: 'new-orders', message: event.payload.message || 'New orders' });
  },
  describe: (event) => `New orders (${event.payload.orderSet})`,
};
