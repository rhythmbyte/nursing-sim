// Reactive patient scripting (pure, no DOM). A patient's `script` (template.script, SPEC §4.6) has
// STATES (target vitals/rhythm/findings + a label) and REACTIONS: when [trigger] and [conditions] then [effects].
// Runs as a session processor (`reactionsProcessor`), interleaved in time order with events, trends and the
// monitor. Triggers come from:
//   - new log entries for the patient (student charting, meds, order work, events fired, reactions fired)
//   - new vitalsHistory entries (thresholds crossed, on the way down or up)
//   - deadlines ("N min since a state/event/reaction WITHOUT an action")
// Session state per patient: patients[id].script (see initScript). Every transition is logged
// ('reaction-fired', 'script-state'); instructor overrides live in reactions/control.js.

import { append, SYSTEM } from './log.js';
import { addAlert } from './alerts.js';
import { activeLog } from './struck.js';
import { fireEventGroup } from './session.js';
import { ACTION_KINDS, entryMatches, crossed, conditionsHold, thresholdHolds, OPS } from './reactions/match.js';
import { EFFECTS } from './reactions/effects.js';

const MAX_STEPS_PER_RUN = 200; // safety net; per-instant loop protection is below

/** Initial script state for a patient template (null when it has no script). */
export function initScript(template) {
  if (!template?.script) return null;
  return {
    state: template.script.initialState, enteredAt: 0,
    paused: false, resumedAt: null,
    disabled: {}, fires: {}, lastFire: {}, lastEvent: {}, consumed: {},
    // duration triggers: since when each threshold has held (baseline counts from minute 0)
    holdSince: Object.fromEntries(template.script.reactions.filter((r) => r.when.kind === 'duration' && thresholdHolds(template.vitals.baseline, r.when)).map((r) => [r.id, 0])),
    logCursor: 0, histCursor: 1, at: 0, // what has been processed so far
    instant: { t: -1, count: 0 },
  };
}

/** How many times a reaction may fire: once, or `maxFires` (default settings.reactionMaxFires) if it repeats. */
export const maxFires = (r, settings) => (r.repeat ? r.maxFires ?? settings.reactionMaxFires : 1);

/** Anchor of an elapsed trigger (the moment its countdown started), or null if it isn't counting. */
export function anchorOf(sc, w) {
  let a = null;
  if (w.since === 'state') a = sc.state === w.state ? sc.enteredAt : null;
  else if (w.since === 'event') a = sc.lastEvent[w.eventId] ?? null;
  else if (w.since === 'reaction') a = sc.lastFire[w.reactionId] ?? null;
  else if (w.since === 'start') a = 0;
  if (w.kind === 'duration') a = sc.holdSince?.[w.id] ?? null;
  if (a == null) return null;
  return sc.resumedAt != null ? Math.max(a, sc.resumedAt) : a; // resuming restarts countdowns
}

const usable = (sc, r, settings) => !sc.disabled[r.id] && (sc.fires[r.id] || 0) < maxFires(r, settings);

/** Elapsed reactions currently counting down: [{ reaction, anchor, deadline }]. */
export function armedTimers(sc, template, settings) {
  if (!sc || sc.paused) return [];
  return template.script.reactions.flatMap((r) => {
    if ((r.when.kind !== 'elapsed' && r.when.kind !== 'duration') || !usable(sc, r, settings)) return [];
    const anchor = anchorOf(sc, r.when.kind === 'duration' ? { ...r.when, id: r.id } : r.when);
    if (anchor == null || sc.consumed[r.id] === anchor) return [];
    return [{ reaction: r, anchor, deadline: anchor + (r.when.kind === 'duration' ? r.when.forMin : r.when.afterMin) }];
  });
}

const relevant = (l, pid) => l.patientId === pid;

/** Earliest unprocessed trigger for one patient: { t, kind: 'log'|'hist'|'deadline', … } or null. */
function nextItem(state, pid, upto, ctx) {
  const ps = state.patients[pid];
  const sc = ps.script;
  const items = [];
  for (let i = sc.logCursor; i < state.log.length; i++) {
    if (relevant(state.log[i], pid)) { items.push({ t: Math.max(state.log[i].simMin, sc.at), kind: 'log', index: i }); break; }
  }
  if (ps.vitalsHistory.length > sc.histCursor) items.push({ t: Math.max(ps.vitalsHistory[sc.histCursor].atMin, sc.at), kind: 'hist', index: sc.histCursor });
  for (const a of armedTimers(sc, ctx.templatesById[pid], state.settings)) items.push({ t: Math.max(a.deadline, sc.at), kind: 'deadline', ...a });
  const due = items.filter((i) => i.t <= upto + 1e-9);
  return due.length ? due.reduce((a, b) => (b.t < a.t ? b : a)) : null;
}

const scripted = (state, ctx) => Object.entries(state.patients).filter(([pid, ps]) => ps.script && ps.present && ctx.templatesById[pid]?.script);
const behind = (state, ps) => state.log.length > ps.script.logCursor || ps.vitalsHistory.length > ps.script.histCursor;

export const reactionsProcessor = {
  due(state, upto, ctx) {
    return scripted(state, ctx).some(([pid, ps]) => (ps.script.paused ? behind(state, ps) : Boolean(nextItem(state, pid, upto, ctx))));
  },
  /** Earliest pending trigger time before `upto`, so the session can stop there first (keeps time order). */
  nextAt(state, upto, ctx) {
    let best = Infinity;
    for (const [pid, ps] of scripted(state, ctx)) {
      if (ps.script.paused) continue;
      const i = nextItem(state, pid, upto, ctx);
      if (i && i.t < best) best = i.t;
    }
    return best;
  },
  apply(draft, upto, ctx) {
    for (const [pid, ps] of scripted(draft, ctx)) {
      if (ps.script.paused) { ps.script.logCursor = draft.log.length; ps.script.histCursor = ps.vitalsHistory.length; continue; }
      runPatient(draft, pid, upto, ctx);
    }
  },
};

function runPatient(draft, pid, upto, ctx) {
  const ps = draft.patients[pid];
  const sc = ps.script;
  const template = ctx.templatesById[pid];
  for (let step = 0; step < MAX_STEPS_PER_RUN; step++) {
    const item = nextItem(draft, pid, upto, ctx);
    if (!item) return;
    sc.at = item.t;
    if (item.kind === 'log') {
      sc.logCursor = item.index + 1;
      onLogEntry(draft, pid, draft.log[item.index], item.t, ctx);
    } else if (item.kind === 'hist') {
      sc.histCursor = item.index + 1;
      const prev = ps.vitalsHistory[item.index - 1].values;
      const cur = ps.vitalsHistory[item.index].values;
      for (const r of template.script.reactions) {
        if (r.when.kind === 'duration') {
          sc.holdSince ??= {};
          if (!thresholdHolds(cur, r.when)) delete sc.holdSince[r.id];
          else sc.holdSince[r.id] ??= item.t;
        }
        if (r.when.kind === 'vitals' && crossed(prev, cur, r.when)) tryFire(draft, pid, r, item.t, { kind: 'threshold', field: r.when.field, op: r.when.op, value: r.when.value }, ctx);
      }
    } else {
      sc.consumed[item.reaction.id] = item.anchor;
      const w = item.reaction.when;
      const done = (w.without || []).length && activeLog(draft).some((l) => relevant(l, pid) && l.simMin >= item.anchor - 1e-9 && l.simMin <= item.t + 1e-9 && w.without.some((m) => entryMatches(l, m, template)));
      if (w.kind === 'duration') tryFire(draft, pid, item.reaction, item.t, { kind: 'duration', field: w.field, op: w.op, value: w.value, forMin: w.forMin }, ctx);
      else if (!done) tryFire(draft, pid, item.reaction, item.t, { kind: 'timeout', since: w.since, afterMin: w.afterMin, without: w.without || [] }, ctx);
    }
  }
  console.warn(`Reaction script for ${pid}: stopped after ${MAX_STEPS_PER_RUN} steps in one run`);
}

function onLogEntry(draft, pid, entry, t, ctx) {
  const sc = draft.patients[pid].script;
  const template = ctx.templatesById[pid];
  if (draft.struck?.[entry.id]) return;
  if (entry.action === 'event-fired') sc.lastEvent[entry.details.eventId] = t;
  for (const r of template.script.reactions) {
    const w = r.when;
    if (ACTION_KINDS.includes(w.kind) && entryMatches(entry, w, template)) {
      tryFire(draft, pid, r, t, { kind: entry.role === 'student' ? 'student' : entry.role, logId: entry.id, userId: entry.userId }, ctx);
    } else if (w.kind === 'assessment' && entry.action === 'assessment' && entry.details.toolId === w.toolId && entry.details.score != null && assessmentTriggered(draft, pid, entry, w)) {
      tryFire(draft, pid, r, t, { kind: 'assessment', toolId: w.toolId, score: entry.details.score, logId: entry.id, userId: entry.userId }, ctx);
    } else if (w.kind === 'penalty' && entry.action.startsWith('penalty-') && entry.details.beforePercent < w.atLeastPercent && entry.details.afterPercent >= w.atLeastPercent) {
      tryFire(draft, pid, r, t, { kind: 'penalty', atLeastPercent: w.atLeastPercent, logId: entry.id }, ctx);
    } else if (w.kind === 'fired' && ((w.eventId && entry.action === 'event-fired' && entry.details.eventId === w.eventId)
      || (w.reactionId && entry.action === 'reaction-fired' && entry.details.reactionId === w.reactionId))) {
      tryFire(draft, pid, r, t, { kind: w.eventId ? 'event' : 'chain', logId: entry.id, ...(w.eventId ? { eventId: w.eventId } : { fromReaction: w.reactionId }) }, ctx);
    }
  }
}

/** Score rule: { op, value } on this score, or { rise } versus the previous charted score of the same tool. */
function assessmentTriggered(state, pid, entry, w) {
  const score = entry.details.score;
  if (w.rise != null) {
    const prev = state.log.filter((l) => l.patientId === pid && l.action === 'assessment' && l.details.toolId === w.toolId && l.details.score != null && l.id !== entry.id && l.simMin <= entry.simMin && !state.struck?.[l.id]).at(-1);
    return prev != null && score - prev.details.score >= w.rise;
  }
  return Boolean(OPS[w.op]?.(score, w.value));
}

/** Effect context shared by the processor and the instructor controls. */
export function effectCtx(draft, pid, t, cause, ctx, user = SYSTEM) {
  return {
    t, user, cause, now: ctx.now, template: ctx.templatesById[pid], settings: draft.settings, catalogs: ctx.catalogs,
    fireEvent: (d, p, eventId, fx) => fireEventGroup(d, p, eventId, { simMin: fx.t, now: fx.now, refs: ctx.refs || [], templatesById: ctx.templatesById, user: fx.user, source: `reaction:${fx.cause.reactionId}` }),
  };
}

/**
 * Fires a reaction if it may (not disabled, under its max, conditions hold, not already fired at this instant).
 * `force` (instructor "Fire now") skips those checks. Logs 'reaction-fired', then applies each effect in order.
 */
export function tryFire(draft, pid, r, t, cause, ctx, { force = false, user = SYSTEM } = {}) {
  const ps = draft.patients[pid];
  const sc = ps.script;
  const template = ctx.templatesById[pid];
  if (!force) {
    if (!usable(sc, r, draft.settings)) return false;
    if (sc.lastFire[r.id] === t) return false; // no same-instant cycles
    const entries = activeLog(draft).filter((l) => relevant(l, pid) && l.simMin <= t + 1e-9);
    if (!conditionsHold(r.if, { scriptState: sc.state, vitals: ps.vitals, entries, t, template })) return false;
    if (sc.instant.t !== t) sc.instant = { t, count: 0 };
    if (++sc.instant.count > draft.settings.reactionMaxPerInstant) {
      if (sc.instant.count === draft.settings.reactionMaxPerInstant + 1) {
        addAlert(draft, { simMin: t, patientId: pid, kind: 'script', message: `Reaction loop stopped: more than ${draft.settings.reactionMaxPerInstant} reactions at one moment (last: ${r.id})`, audience: ['instructor'] });
        append(draft, { simMin: t, wallTime: ctx.now, ...SYSTEM, patientId: pid, action: 'script-loop-stopped', details: { reactionId: r.id, limit: draft.settings.reactionMaxPerInstant } });
      }
      return false;
    }
  }
  sc.fires[r.id] = (sc.fires[r.id] || 0) + 1;
  sc.lastFire[r.id] = t;
  const fullCause = { ...cause, reactionId: r.id };
  append(draft, { simMin: t, wallTime: ctx.now, ...user, patientId: pid, action: 'reaction-fired', details: { reactionId: r.id, label: r.label || r.id, cause: fullCause, forced: force || undefined } });
  const fx = { ...effectCtx(draft, pid, t, fullCause, ctx, user), reactionLabel: r.label || r.id };
  for (const e of r.then) {
    if (EFFECTS[e.type]) EFFECTS[e.type](draft, pid, e, fx);
    else console.warn(`Reaction ${r.id}: unknown effect "${e.type}"`);
  }
  return true;
}
