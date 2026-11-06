// Instructor live actions (besides clock/event control): left unattended, ad-hoc orders, codes, call lights. No DOM.
import { simMinOf } from './session.js';
import { append } from './log.js';
import { getEventType } from './registry.js';
import { addAlert } from './alerts.js';

/** Mark that student(s) left an unstable patient unattended (flagged red by the left-unattended rule). */
export function markLeftUnattended(state, patientId, { studentIds, note = '' }, { now, user }) {
  if (!studentIds?.length) return state;
  const draft = structuredClone(state);
  append(draft, { simMin: simMinOf(state, now), wallTime: now, ...user, patientId, action: 'left-unattended', details: { studentIds, note } });
  return draft;
}


const ORDER_TYPES = ['once', 'scheduled', 'prn', 'continuous', 'parameter'];

/**
 * Push an ad-hoc order from the "provider" (instructor). Lives in state.adhoc[pid].orders and reaches every
 * screen and rule through effective templates (engine/templates.js). Arrives as "new" with an alert.
 * order: { text, type, tier, interventionIds?, med?, delegable? }
 */
export function pushOrder(state, patientId, order, { now, user }) {
  if (!order?.text?.trim()) throw new Error('Order text is required.');
  if (!ORDER_TYPES.includes(order.type)) throw new Error(`Order type must be one of ${ORDER_TYPES.join(', ')}`);
  if (![1, 2, 3].includes(Number(order.tier))) throw new Error('Tier must be 1, 2 or 3.');
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  draft.adhoc[patientId] ??= { orders: [] };
  const n = draft.adhoc[patientId].orders.length + 1;
  const o = {
    id: `o-adhoc-${patientId}-${n}`, text: order.text.trim(), type: order.type, tier: Number(order.tier),
    orderSet: `os-adhoc-${patientId}-${n}`, activeFromMin: Math.ceil(simMin), interventionIds: order.interventionIds || [],
    delegable: Boolean(order.delegable), ...(order.med ? { med: order.med.trim() } : {}), adhoc: true,
  };
  draft.adhoc[patientId].orders.push(o);
  draft.patients[patientId].orders[o.id] = { status: 'new', activeAtMin: simMin };
  addAlert(draft, { simMin, patientId, kind: 'new-orders', message: `New order from provider: ${o.text}` });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'order-pushed', details: { orderId: o.id, text: o.text, tier: o.tier, type: o.type } });
  return draft;
}

/** Start a code now (uses the `code` event type), e.g. when the instructor decides the patient arrests. */
export function startCode(state, patientId, { rhythm = '', message = '' }, { now, user }) {
  if (state.patients[patientId]?.code) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  getEventType('code').apply(draft, { id: 'e-live-code', type: 'code', payload: { rhythm, message: message || 'Patient is unresponsive. No pulse.' } }, { simMin, patientId });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'code-started', details: { rhythm } });
  return draft;
}

/** Code outcome: 'rosc' (tag → settings.roscTag) or 'no-rosc' (patient dies, tag stays black). */
export function setCodeOutcome(state, patientId, outcome, { now, user }) {
  const code = state.patients[patientId]?.code;
  if (!code || code.outcome || !['rosc', 'no-rosc'].includes(outcome)) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  const ps = draft.patients[patientId];
  ps.code.outcome = outcome;
  ps.code.endedMin = simMin;
  if (outcome === 'rosc') ps.tag = state.settings.roscTag;
  else ps.alive = false;
  addAlert(draft, { simMin, patientId, kind: 'code', message: outcome === 'rosc' ? 'ROSC achieved.' : 'Resuscitation stopped. No ROSC.', audience: ['student', 'instructor', 'charge'] });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'code-outcome', details: { outcome, durationMin: Math.round((simMin - code.startedMin) * 100) / 100 } });
  return draft;
}

/** Instructor turns a call light on (ad hoc) or off. */
export function setCallLight(state, patientId, { on, message = '' }, { now, user }) {
  const ps = state.patients[patientId];
  if (!ps || Boolean(ps.callLight) === Boolean(on)) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  if (on) getEventType('call-light').apply(draft, { id: 'e-live-call-light', payload: { message: message || 'Call light on' } }, { simMin, patientId });
  else draft.patients[patientId].callLight = null;
  append(draft, { simMin, wallTime: now, ...user, patientId, action: on ? 'call-light-on' : 'call-light-off', details: { message } });
  return draft;
}
