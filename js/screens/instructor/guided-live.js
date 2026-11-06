// Guided event builder → Live control: one guided event becomes the runner calls the Live control button makes.
// (Split from guided-model.js; same ge shape.)

import { rowsToValues, geToEffects } from './guided-model.js';

// ---------- Live control: ge → runner calls ----------
/** [{ method, args }] the Live control button runs (runner.<method>(pid, ...args, user)). */
export function geToLiveCalls(ge, fromVitals = {}) {
  switch (ge.type) {
    case 'vitals': { const v = rowsToValues(ge.rows, fromVitals); if (!Object.keys(v.values).length) throw new Error('Enter at least one "To" value'); return [{ method: 'adjustVitals', args: [{ values: v.values, overMin: v.overMin, overMinBy: v.overMinBy }] }]; }
    case 'rhythm': if (!ge.rhythm) throw new Error('Pick a rhythm'); return [{ method: 'adjustVitals', args: [{ values: { rhythm: ge.rhythm } }] }];
    case 'call-light': if (!ge.message?.trim()) throw new Error('Write what the patient says'); return [{ method: 'setCallLight', args: [true, ge.message.trim()] }];
    case 'new-orders': {
      const orders = (ge.orders || []).filter((o) => o.text?.trim());
      if (!orders.length) throw new Error('Write at least one order');
      return orders.map((o) => ({ method: 'pushOrder', args: [{ text: o.text.trim(), type: o.type || 'once', tier: Number(o.tier) || 2, interventionIds: o.interventionId ? [o.interventionId] : [], ...(o.med ? { med: o.med } : {}) }] }));
    }
    case 'state': if (!ge.to) throw new Error('Pick a state'); return [{ method: 'script', args: ['forceState', [ge.to]], scripted: true }];
    default: {
      const [e] = geToEffects(ge, fromVitals);
      const event = e.type === 'assessment' ? { type: 'assessment-change', payload: { answers: e.answers } } : e.event;
      return [{ method: 'liveEvent', args: [event] }];
    }
  }
}
