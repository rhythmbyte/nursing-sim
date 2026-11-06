// Labs: draw → pending → resulted after a delay. No DOM.
// Lab state (in patients[id].labs): template fields + { uid, drawnAtMin, resultAtMin, awaitingValue, resultedAtMin }
// - A pending lab that some order can draw (order.labCodes) starts undrawn; otherwise it counts as drawn at 0.
// - A lab with `forOrder` is drawn only by that order (e.g. Linda's scripted repeat lactate belongs to the
//   STAT sepsis order). Drawing a code with no matching undrawn pending lab creates an unscripted one (value null).
// - At resultAtMin: a scripted value results automatically; a null value waits for the instructor (Live control).

import { addAlert } from './alerts.js';
import { append, SYSTEM } from './log.js';


/** catalogs.labs.fallbackDelayMin applies when neither the lab nor the labs catalog sets a delay. */
export function initLabs(template, catalogs) {
  const drawable = new Set(template.orders.flatMap((o) => o.labCodes || []));
  const orderIds = new Set(template.orders.map((o) => o.id));
  return template.labs.map((l, i) => {
    const lab = { ...l, uid: `${l.code}#${i}` };
    const canBeDrawn = l.forOrder ? orderIds.has(l.forOrder) : drawable.has(l.code);
    if (l.status === 'pending' && !canBeDrawn) {
      Object.assign(lab, { drawnAtMin: 0, resultAtMin: delayFor(lab, catalogs) });
    }
    return lab;
  });
}

function delayFor(lab, catalogs) {
  const delay = lab.resultDelayMin ?? catalogs?.labs?.labs.find((c) => c.code === lab.code)?.defaultDelayMin ?? catalogs?.labs?.fallbackDelayMin;
  if (delay == null) throw new Error(`No result delay for lab ${lab.code}: set fallbackDelayMin in data/catalogs/labs.json`);
  return delay;
}

/** Draw labs for codes at simMin, for orderId. Mutates draft; returns the drawn labs. */
export function drawLabs(draft, patientId, codes, simMin, catalogs, orderId = null) {
  const labs = draft.patients[patientId].labs;
  const drawn = [];
  const undrawn = (l, code) => l.code === code && l.status === 'pending' && l.drawnAtMin == null;
  for (const code of codes) {
    // A lab reserved for this order first, then any unreserved one.
    let lab = labs.find((l) => undrawn(l, code) && l.forOrder && l.forOrder === orderId)
      || labs.find((l) => undrawn(l, code) && !l.forOrder);
    if (!lab) {
      const name = catalogs?.labs?.labs.find((c) => c.code === code)?.name || code;
      lab = { code, label: `${name} (unscripted)`, value: null, status: 'pending', uid: `${code}#x${labs.length}`, unscripted: true };
      labs.push(lab);
    }
    Object.assign(lab, { drawnAtMin: simMin, resultAtMin: simMin + delayFor(lab, catalogs) });
    drawn.push(lab);
  }
  return drawn;
}

/** Tick processor: results labs whose delay has passed (up to and including `upto`). */
export const labsProcessor = {
  due(state, upto) {
    return Object.values(state.patients).some((ps) => ps.labs.some((l) => l.status === 'pending' && !l.awaitingValue && l.resultAtMin != null && l.resultAtMin <= upto));
  },
  apply(draft, upto, { templatesById, now }) {
    for (const [pid, ps] of Object.entries(draft.patients)) {
      for (const l of ps.labs) {
        if (l.status !== 'pending' || l.awaitingValue || l.resultAtMin == null || l.resultAtMin > upto) continue;
        const name = l.label || l.code;
        const who = templatesById[pid].demographics.name;
        if (l.value == null) {
          l.awaitingValue = true;
          addAlert(draft, { simMin: l.resultAtMin, patientId: pid, kind: 'lab-needs-value', message: `${name} for ${who} is ready but has no scripted value. Release it from Live control.`, audience: ['instructor'] });
          continue;
        }
        Object.assign(l, { status: 'resulted', resultedAtMin: l.resultAtMin });
        addAlert(draft, { simMin: l.resultAtMin, patientId: pid, kind: 'lab-result', message: `Lab resulted: ${name}` });
        append(draft, { simMin: l.resultAtMin, wallTime: now, ...SYSTEM, patientId: pid, action: 'lab-resulted', details: { uid: l.uid, code: l.code } });
      }
    }
  },
};

/** Instructor releases a lab now (early, or with a value for an unscripted/null one). */
export function releaseLab(state, patientId, { uid, value = null }, { now, user, simMin }) {
  const lab = state.patients[patientId]?.labs.find((l) => l.uid === uid);
  if (!lab || lab.status !== 'pending') return state;
  if (lab.value == null && (value == null || value === '')) throw new Error('This lab has no scripted value; enter one to release it.');
  const draft = structuredClone(state);
  const l = draft.patients[patientId].labs.find((x) => x.uid === uid);
  Object.assign(l, { status: 'resulted', resultedAtMin: simMin, awaitingValue: false, ...(value != null && value !== '' ? { value: String(value) } : {}) });
  addAlert(draft, { simMin, patientId, kind: 'lab-result', message: `Lab resulted: ${l.label || l.code}` });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'lab-released', details: { uid, code: l.code, value: l.value, early: l.resultAtMin == null || simMin < l.resultAtMin } });
  return draft;
}
