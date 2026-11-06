// Live session state + pure transitions. No DOM, no timers; wall time (`now`) is passed in.
// Shape (SPEC §4.5):
// { version, scenarioId, startClock, settings, clock, patients: { id → patientState },
//   joinCode, roster, adhoc, students: { userId → { seen, handoff } }, fired: { key → n }, alerts, log }
// Timed work besides events (monitor cycles, lab results, delegated tasks) runs as "processors",
// interleaved with events in time order (see advance()).
// Every transition returns a NEW state; event types mutate a structuredClone draft.

import './events/index.js';
import { getEventType } from './registry.js';
import * as clock from './clock.js';
import { dueEvents, groupMembers, nextAt } from './scheduler.js';
import { append, SYSTEM } from './log.js';
import { addAlert } from './alerts.js';
import { shiftLengthMin } from './time.js';
import { initLabs, labsProcessor } from './labs.js';
import { initFlowsheet, monitorProcessor } from './vitals.js';
import { delegationProcessor } from './delegation.js';
import { trendProcessor } from './vitals-control.js';

// Order matters within one instant: trends step first, then monitor readings (which read vitalsAt).
const PROCESSORS = [trendProcessor, monitorProcessor, labsProcessor, delegationProcessor];

export const SESSION_VERSION = 9; // bump when the shape changes; older saved sessions are discarded

/** Patients in the scenario: [{ id, groupId, admission }]. */
export function scenarioPatients(scenario) {
  return scenario.groups.flatMap((g) => [
    ...(g.patients || []).map((id) => ({ id, groupId: g.id, admission: false })),
    ...(g.admissions || []).map((id) => ({ id, groupId: g.id, admission: true })),
  ]);
}

function initialPatientState(t, groupId, admission, catalogs) {
  const orders = {};
  for (const o of t.orders) {
    // Orders in place at shift start count as already acknowledged (received in report).
    if (o.activeFromMin === 0 && !admission) orders[o.id] = { status: 'acknowledged', activeAtMin: 0 };
  }
  return {
    present: !admission,
    groupId,
    tag: t.tag,                  // instructor's tag (answer key); see engine/priority.js for who may see it
    tagHistory: [{ atMin: 0, tag: t.tag }],
    alive: true,
    vitals: { ...t.vitals.baseline },          // current vitals
    vitalsHistory: [{ atMin: 0, values: { ...t.vitals.baseline } }], // every change (engine/vitals-control.js)
    vitalsTrend: null,                         // instructor trend in progress
    vitalsOverride: false,                     // instructor has taken over vitals (until the next scripted change)
    callLight: null,
    findingChanges: [], // event ids whose findings are waiting to be revealed by an assessment
    revealed: [],       // [{ source: 'baseline' | eventId, atMin, findings }] once the student assesses
    orders,
    labs: initLabs(t, catalogs),
    flowsheet: initFlowsheet(t), // [{ atMin, source, values, by }]
    monitor: null,               // { intervalMin, fromMin, count } when the student runs a cycle
    delegations: [],             // tasks delegated to LPN/CNA (engine/delegation.js)
    admission: null,             // { status: pending|held|assigned, arrivedAtMin, message, … } (engine/admissions.js)
    code: null,
  };
}

/** scenario.settings must already be merged with defaults (engine/settings.js withDefaults). */
export function createSession(scenario, templatesById, catalogs, { joinCode = null } = {}) {
  const patients = {};
  for (const { id, groupId, admission } of scenarioPatients(scenario)) {
    const t = templatesById[id];
    if (!t) {
      console.warn(`Scenario ${scenario.id} lists unknown patient ${id}; skipped`);
      continue;
    }
    patients[id] = initialPatientState(t, groupId, admission, catalogs);
  }
  return {
    version: SESSION_VERSION,
    scenarioId: scenario.id,
    startClock: scenario.startClock,
    endMin: scenario.endClock ? shiftLengthMin(scenario.startClock, scenario.endClock) : null, // sim ends here (null = open-ended)
    settings: { ...scenario.settings },
    clock: clock.createClock(scenario.speed),
    patients,
    joinCode,      // students join with this code (engine/roster.js)
    roster: {},    // userId → { name, groupId, joinedAtMin }
    priorities: {}, // userId → patientId → [{ atMin, levelId }] (student-assigned, engine/priority.js)
    adhoc: {},     // patientId → { orders } pushed live by the instructor (engine/templates.js)
    students: {},
    fired: {},
    alerts: [],
    log: [],
  };
}

export function simMinOf(state, now) {
  return clock.simMinutes(state.clock, now);
}

function pendingTimedOrders(state, templatesById, simMin) {
  const out = [];
  for (const [pid, ps] of Object.entries(state.patients)) {
    if (!ps.present) continue;
    for (const o of templatesById[pid]?.orders || []) {
      if (typeof o.activeFromMin === 'number' && o.activeFromMin <= simMin && !ps.orders[o.id]) out.push([pid, o]);
    }
  }
  return out;
}

function fireInto(draft, ref, { simMin, now, templatesById, user, source }) {
  const { patientId, event } = ref;
  const type = getEventType(event.type);
  const template = patientId ? templatesById[patientId] : null;
  if (patientId && !draft.patients[patientId]) {
    console.warn(`Event ${event.id}: patient ${patientId} is not in this session; skipped`);
    return;
  }
  if (type) {
    type.apply(draft, event, { simMin, patientId, template });
  } else {
    console.warn(`No handler registered for event type "${event.type}" (${event.id}); logged only`);
  }
  // activeOnEvent orders activate for ANY event type (see DECISIONS.md).
  if (template) {
    const ps = draft.patients[patientId];
    for (const o of template.orders) {
      if (o.activeOnEvent === event.id && !ps.orders[o.id]) ps.orders[o.id] = { status: 'new', activeAtMin: simMin };
    }
  }
  draft.fired[ref.key] = (draft.fired[ref.key] || 0) + 1;
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'event-fired', details: { eventId: event.id, type: event.type, source } });
}

/** Advance to the current sim time: fire due events, activate timed orders. Returns { state, fired }. */
export function tick(state, { now, refs, templatesById, catalogs }) {
  if (state.clock.status !== 'running') return { state, fired: 0 };
  const { state: next, fired } = advance(state, { now, refs, templatesById, catalogs });
  if (state.endMin != null && simMinOf(next, now) >= state.endMin) return { state: endShift(next, now), fired };
  return { state: next, fired };
}

/** End of shift: the clock stops exactly at endMin (events due up to then have fired). */
function endShift(state, now) {
  const draft = { ...state, clock: { ...state.clock, status: 'ended', baseMs: state.endMin * 60000, anchorWall: null }, log: [...state.log], alerts: [...state.alerts] };
  append(draft, { simMin: state.endMin, wallTime: now, ...SYSTEM, action: 'clock-end', details: { reason: 'end-of-shift' } });
  addAlert(draft, { simMin: state.endMin, kind: 'clock', message: 'End of shift. The sim has ended.', audience: ['student', 'instructor', 'charge'] });
  return draft;
}

function runProcessors(draft, upto, ctx) {
  for (const p of PROCESSORS) if (p.due(draft, upto)) p.apply(draft, upto, ctx);
}

/** Fire everything due at the clock's current sim minute (any clock status). Returns { state, fired }. */
function advance(state, { now, refs, templatesById, catalogs }) {
  const simMin = Math.min(simMinOf(state, now), state.endMin ?? Infinity); // nothing past the end of shift
  const due = dueEvents(refs, state.fired, simMin);
  if (!due.length && !pendingTimedOrders(state, templatesById, simMin).length && !PROCESSORS.some((p) => p.due(state, simMin))) {
    return { state, fired: 0 };
  }

  const draft = structuredClone(state);
  const ctx = { now, templatesById, catalogs };
  for (const { ref, at } of due) {
    runProcessors(draft, at - 1e-9, ctx); // everything strictly before this event's instant
    fireInto(draft, ref, { simMin: at, now, templatesById, user: SYSTEM, source: 'scheduled' });
  }
  runProcessors(draft, simMin, ctx);
  // Re-check after firing: an admission may have just made a patient present.
  for (const [pid, o] of pendingTimedOrders(draft, templatesById, simMin)) {
    draft.patients[pid].orders[o.id] = { status: o.activeFromMin === 0 ? 'acknowledged' : 'new', activeAtMin: o.activeFromMin };
  }
  return { state: draft, fired: due.length };
}

/**
 * Instructor "Fire now": fires the event and every event in its group immediately
 * (each counts as its next occurrence, so the scheduled firing won't repeat it).
 */
export function fireNow(state, ref, { now, refs = [ref], templatesById, user }) {
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  const members = refs.includes(ref) ? groupMembers(refs, ref) : [ref];
  for (const m of members) {
    fireInto(draft, m, { simMin, now, templatesById, user, source: members.length > 1 ? `manual-group:${ref.event.group}` : 'manual' });
  }
  return draft;
}

/** Sim minute of the next scheduled firing after now, or null if nothing is left. */
export function nextEventMin(state, refs, now) {
  const simMin = simMinOf(state, now);
  const times = refs.map((r) => nextAt(r, state.fired)).filter((t) => t != null && t > simMin && (state.endMin == null || t <= state.endMin));
  return times.length ? Math.min(...times) : null;
}

/** Instructor "Skip to next event": jump sim time to the next scheduled event and fire what's due. */
export function skipToNext(state, { now, refs, templatesById, catalogs, user }) {
  if (state.clock.status !== 'running' && state.clock.status !== 'paused') return state;
  const to = nextEventMin(state, refs, now);
  if (to == null) return state;
  const from = simMinOf(state, now);
  const draft = { ...state, clock: clock.jumpTo(state.clock, to, now), log: [...state.log] };
  append(draft, { simMin: to, wallTime: now, ...user, action: 'clock-skip', details: { fromMin: Math.round(from * 100) / 100, toMin: to } });
  return advance(draft, { now, refs, templatesById, catalogs }).state;
}

/** Student answers a call light; logs response time in sim minutes. */
export function answerCallLight(state, patientId, { now, user }) {
  const light = state.patients[patientId]?.callLight;
  if (!light) return state;
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  draft.patients[patientId].callLight = null;
  append(draft, {
    simMin, wallTime: now, ...user, patientId, action: 'call-light-answered',
    details: { eventId: light.eventId, litAtMin: light.since, responseMin: Math.round((simMin - light.since) * 100) / 100, rings: light.rings },
  });
  return draft;
}

const CLOCK_ACTIONS = { start: clock.start, pause: clock.pause, resume: clock.resume, end: clock.end };

/** Clock control: 'start' | 'pause' | 'resume' | 'end' | 'speed'. Logged with the acting user. */
export function controlClock(state, action, { now, user, speed, reason }) {
  const before = state.clock;
  let after;
  if (action === 'speed') after = clock.setSpeed(before, speed, now);
  else if (CLOCK_ACTIONS[action]) after = CLOCK_ACTIONS[action](before, now);
  else throw new Error(`Unknown clock action: ${action}`);
  if (after === before) return state;
  const draft = { ...state, clock: after, log: [...state.log] };
  append(draft, { simMin: clock.simMinutes(after, now), wallTime: now, ...user, action: `clock-${action}`, details: { ...(action === 'speed' ? { speed } : {}), ...(reason ? { reason } : {}) } });
  return draft;
}

/**
 * Pause-on-close (scenario setting `pauseOnClose`). Pauses a running clock as of
 * `atWall` — the moment the page closed, or the last heartbeat if it crashed/froze.
 */
export function pauseForClose(state, { atWall, now }) {
  if (!state.settings.pauseOnClose || state.clock.status !== 'running') return state;
  const at = Math.min(atWall ?? now, now);
  return controlClock(state, 'pause', { now: at, user: SYSTEM, reason: 'page-closed' });
}
