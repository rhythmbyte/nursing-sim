// "Test this patient": runs one patient's script in a private throwaway session (never the live sim, never
// saved) through simulated student actions and time jumps. Uses the real session, chart actions and
// processors, so what fires here is what would fire live. Pure, no DOM.
//
// steps: [{ kind: 'wait', min } | { kind: 'chart', interventionId, fields? } | { kind: 'med', orderId, result? }
//         | { kind: 'order', orderId } | { kind: 'fire', eventId } | { kind: 'force', stateId }]
// Returns frames: one per step + the start, each { label, atMin, state, stateLabel, vitals, trend, fired, transitions, events, alerts }.

import * as session from '../session.js';
import * as chart from '../chart.js';
import { collectEvents, eventKey } from '../scheduler.js';
import { forceState } from './control.js';
import { names } from './describe.js';

const MIN = 60000;
const STUDENT = { userId: 'dry-run-student', role: 'student' };
const INSTRUCTOR = { userId: 'dry-run-instructor', role: 'instructor' };

export function stepLabel(step, n) {
  if (step.kind === 'wait') return `Wait ${step.min} min`;
  if (step.kind === 'chart') {
    const f = Object.entries(step.fields || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k} ${v}`).join(', ');
    return `Chart ${n.iv(step.interventionId)}${f ? ` (${f})` : ''}`;
  }
  if (step.kind === 'med') return `${step.result || 'given'}: ${n.order(step.orderId)}`;
  if (step.kind === 'order') return `Mark done: ${n.order(step.orderId)}`;
  if (step.kind === 'fire') return `Fire event ${step.eventId}`;
  if (step.kind === 'force') return `Force state ${n.state(step.stateId)}`;
  return step.kind;
}

/** settings must be merged scenario settings (engine/settings.js effectiveSettings). */
export function dryRun(template, { catalogs, settings, steps = [], startClock = '07:00' }) {
  const pid = template.id;
  const templatesById = { [pid]: template };
  const scenario = { id: 'dry-run', name: 'Dry run', startClock, speed: 1, settings, groups: [{ id: 'dry', name: 'Dry run', patients: [pid] }] };
  const refs = collectEvents([pid], templatesById, scenario);
  const n = names(template, catalogs);
  let t = 0;
  let s = session.controlClock(session.createSession(scenario, templatesById, catalogs), 'start', { now: 0, user: INSTRUCTOR });
  const ctx = (user = STUDENT) => ({ now: t * MIN, user, templatesById, catalogs, refs });
  const settle = () => { s = session.tick(s, { now: t * MIN, refs, templatesById, catalogs }).state; };
  const frames = [];
  let seenLog = 0;
  let seenAlerts = 0;
  const snap = (label) => {
    const fresh = s.log.slice(seenLog);
    const ps = s.patients[pid];
    frames.push({
      label, atMin: t, state: ps.script?.state ?? null, stateLabel: ps.script ? n.state(ps.script.state) : '',
      vitals: { ...ps.vitals },
      trend: ps.vitalsTrend ? { to: { ...ps.vitalsTrend.to }, toMin: ps.vitalsTrend.toMin } : null,
      fired: fresh.filter((l) => l.action === 'reaction-fired').map((l) => ({ reactionId: l.details.reactionId, label: l.details.label, cause: l.details.cause })),
      transitions: fresh.filter((l) => l.action === 'script-state').map((l) => ({ atMin: l.simMin, from: l.details.from, to: l.details.to, cause: l.details.cause })),
      events: fresh.filter((l) => l.action === 'event-fired').map((l) => l.details.eventId),
      alerts: s.alerts.slice(seenAlerts).map((a) => a.message),
    });
    seenLog = s.log.length;
    seenAlerts = s.alerts.length;
  };
  settle();
  snap('Start');
  for (const step of steps) {
    try {
      if (step.kind === 'wait') { t += Number(step.min) || 0; settle(); }
      else if (step.kind === 'chart') s = chart.chartIntervention(s, pid, { interventionId: step.interventionId, fields: step.fields || {} }, ctx());
      else if (step.kind === 'med') s = chart.medAction(s, pid, { orderId: step.orderId, result: step.result || 'given' }, ctx());
      else if (step.kind === 'order') s = chart.completeOrder(s, pid, { orderId: step.orderId }, ctx());
      else if (step.kind === 'fire') s = session.fireNow(s, refs.find((r) => r.key === eventKey(pid, step.eventId)), { now: t * MIN, refs, templatesById, catalogs, user: INSTRUCTOR });
      else if (step.kind === 'force') s = forceState(s, pid, step.stateId, ctx(INSTRUCTOR));
      settle();
      snap(stepLabel(step, n));
    } catch (e) {
      frames.push({ label: stepLabel(step, n), atMin: t, error: e.message });
    }
  }
  return frames;
}
