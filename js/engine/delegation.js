// Delegation: an intervention delegated to an LPN/CNA is done after a delay
// (settings.delegationDelayMin[role], from scenario-defaults.json unless the scenario overrides), then the staff member reports
// back as a staff message. Effects (order progress, vitals row, lab draw) happen at completion, not at request.
// Whether delegating was APPROPRIATE is judged by the inappropriate-delegation rule (phase 5), not here.

import { addAlert } from './alerts.js';
import { append } from './log.js';
import { progressOrder, findOrder } from './orders.js';
import { drawLabs } from './labs.js';
import { deviceValues, scriptedSnapshot } from './vitals.js';
import { revealFindings } from './findings.js';
import { vitalsAt } from './vitals-control.js';

/** Delay for a role from merged settings (engine/settings.js turns a single number into per-role values). */
export function delegationDelay(settings, to) {
  const d = settings?.delegationDelayMin?.[to];
  if (d == null) throw new Error(`No delegation delay for ${to}: set settings.delegationDelayMin`);
  return d;
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
    const vcat = catalogs.vitals;
    const v = vitalsAt(ps, at); // what the vitals were when the staff member measured
    const manual = draft.settings.revealManualVitals ? iv.chartFields.filter((k) => vcat.manualScriptedFields.includes(k) && v[k] != null) : [];
    values = { ...deviceValues({ vitals: v }, iv.chartFields, vcat), ...Object.fromEntries(manual.map((k) => [k, v[k]])) };
    ps.flowsheet.push({ atMin: at, source: 'delegated', values, by: task.to });
  }
  if (iv?.drawsLabs && order?.labCodes) drawLabs(draft, patientId, order.labCodes, at, catalogs, order.id);
  // Whether a delegated assessment reveals findings is a scenario setting (default false; SPEC §14).
  if (iv?.revealsFindings && draft.settings.delegatedAssessmentRevealsFindings) revealFindings(draft, patientId, templatesById[patientId], at);
  progressOrder(draft, patientId, order, at);

  Object.assign(task, { status: 'done', completedAt: at });
  const label = iv?.label || task.interventionId;
  const name = templatesById[patientId].demographics.name;
  addAlert(draft, { simMin: at, patientId, kind: 'staff-message', message: `${task.to}: ${label} done for ${name}${values ? `: ${summarize(values)}` : '.'}` });
  append(draft, {
    simMin: at, wallTime: now, userId: `staff-${task.to.toLowerCase()}`, role: 'staff', patientId, action: 'delegation-completed',
    details: { taskId: task.id, interventionId: task.interventionId, orderId: task.orderId, to: task.to, values, ...(values ? { scripted: scriptedSnapshot(ps, catalogs.vitals) } : {}) },
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
