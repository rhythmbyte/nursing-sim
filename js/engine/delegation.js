// Delegation: an intervention delegated to an LPN/CNA is done after a delay
// (settings.delegationDelayMin: number or { LPN, CNA }; default 10 sim-min), then the staff member reports
// back as a staff message. Effects (order progress, vitals row, lab draw) happen at completion, not at request.
// Whether delegating was APPROPRIATE is judged by the inappropriate-delegation rule (phase 5), not here.

import { addAlert } from './alerts.js';
import { append } from './log.js';
import { progressOrder, findOrder } from './orders.js';
import { drawLabs } from './labs.js';
import { deviceValues, scriptedSnapshot, revealsManualVitals, SCRIPTED_MANUAL_KEYS } from './vitals.js';

export const DEFAULT_DELEGATION_DELAY_MIN = 10;

export function delegationDelay(settings, to) {
  const d = settings?.delegationDelayMin;
  if (typeof d === 'number') return d;
  return d?.[to] ?? DEFAULT_DELEGATION_DELAY_MIN;
}

/** Mutates draft: queues a delegated task. */
export function requestDelegation(draft, patientId, { interventionId, orderId, to, fields, simMin }) {
  const ps = draft.patients[patientId];
  const task = {
    id: `d${ps.delegations.length + 1}`, interventionId, orderId, to, fields,
    requestedAt: simMin, dueAt: simMin + delegationDelay(draft.settings, to), status: 'pending',
  };
  ps.delegations.push(task);
  return task;
}

const FMT = { bp: (v) => `BP ${v}`, hr: (v) => `HR ${v}`, rr: (v) => `RR ${v}`, tempF: (v) => `Temp ${v}`, spo2: (v) => `SpO₂ ${v}%`, o2: (v) => `on ${v}`, pain: (v) => `pain ${v}` };
const summarize = (values) => Object.entries(values).map(([k, v]) => (FMT[k] ? FMT[k](v) : `${k} ${v}`)).join(', ');

function complete(draft, patientId, task, ctx) {
  const { templatesById, catalogs, now } = ctx;
  const ps = draft.patients[patientId];
  const iv = catalogs?.interventions?.interventions.find((i) => i.id === task.interventionId);
  const order = findOrder(templatesById, patientId, task.orderId);
  const at = task.dueAt;
  let values = null;

  if (iv?.vitalsCapture) {
    // Staff report device values; temp/RR/pain only when the scenario reveals manual vitals
    // (otherwise they come from the manikin/instructor, like the student's own checks).
    const manual = revealsManualVitals(draft.settings) ? iv.chartFields.filter((k) => SCRIPTED_MANUAL_KEYS.includes(k) && ps.vitals[k] != null) : [];
    values = { ...deviceValues(ps, iv.chartFields), ...Object.fromEntries(manual.map((k) => [k, ps.vitals[k]])) };
    ps.flowsheet.push({ atMin: at, source: 'delegated', values, by: task.to });
  }
  if (iv?.drawsLabs && order?.labCodes) drawLabs(draft, patientId, order.labCodes, at, catalogs);
  progressOrder(draft, patientId, order, at);

  Object.assign(task, { status: 'done', completedAt: at });
  const label = iv?.label || task.interventionId;
  const name = templatesById[patientId].demographics.name;
  addAlert(draft, { simMin: at, patientId, kind: 'staff-message', message: `${task.to}: ${label} done for ${name}${values ? `: ${summarize(values)}` : '.'}` });
  append(draft, {
    simMin: at, wallTime: now, userId: `staff-${task.to.toLowerCase()}`, role: 'staff', patientId, action: 'delegation-completed',
    details: { taskId: task.id, interventionId: task.interventionId, orderId: task.orderId, to: task.to, values, ...(values ? { scripted: scriptedSnapshot(ps) } : {}) },
  });
}

/** Tick processor: completes delegated tasks due up to `upto`, in time order. */
export const delegationProcessor = {
  due(state, upto) {
    return Object.values(state.patients).some((ps) => ps.delegations.some((t) => t.status === 'pending' && t.dueAt <= upto));
  },
  apply(draft, upto, ctx) {
    const due = [];
    for (const [pid, ps] of Object.entries(draft.patients)) {
      for (const t of ps.delegations) if (t.status === 'pending' && t.dueAt <= upto) due.push([pid, t]);
    }
    due.sort((a, b) => a[1].dueAt - b[1].dueAt).forEach(([pid, t]) => complete(draft, pid, t, ctx));
  },
};
