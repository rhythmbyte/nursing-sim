// Instructor overrides for the reaction script (pure transitions, logged with the acting user; no DOM).
// ctx = { now, user, templatesById, catalogs, refs }. None of these fight the script: they change its
// position or switches, and the processor carries on from there.

import { simMinOf } from '../session.js';
import { append } from '../log.js';
import { enterState } from './effects.js';
import { tryFire, effectCtx, anchorOf } from '../reactions.js';
import { earnPenalty, changePenalty } from '../penalties.js';

function begin(state, pid, ctx) {
  const ps = state.patients[pid];
  if (!ps?.script) throw new Error(`${pid} has no reaction script`);
  return { draft: structuredClone(state), t: simMinOf(state, ctx.now) };
}

const reactionOf = (ctx, pid, rid) => {
  const r = ctx.templatesById[pid]?.script?.reactions.find((x) => x.id === rid);
  if (!r) throw new Error(`No reaction "${rid}" on ${pid}`);
  return r;
};

const log = (draft, t, ctx, pid, action, details) => append(draft, { simMin: t, wallTime: ctx.now, ...ctx.user, patientId: pid, action, details });

/** "Force state": jumps to a state now, applying its vitals even if the instructor has control of vitals. */
export function forceState(state, pid, stateId, ctx) {
  const { draft, t } = begin(state, pid, ctx);
  if (!ctx.templatesById[pid].script.states.some((s) => s.id === stateId)) throw new Error(`No state "${stateId}"`);
  enterState(draft, pid, stateId, effectCtx(draft, pid, t, { kind: 'instructor', userId: ctx.user.userId }, ctx, ctx.user), { force: true });
  draft.patients[pid].script.at = Math.max(draft.patients[pid].script.at, t);
  return draft;
}

/** "Fire now": runs a reaction's effects now, whatever its trigger and conditions (counts as one of its fires). */
export function fireReactionNow(state, pid, rid, ctx) {
  const { draft, t } = begin(state, pid, ctx);
  tryFire(draft, pid, reactionOf(ctx, pid, rid), t, { kind: 'instructor', userId: ctx.user.userId }, ctx, { force: true, user: ctx.user });
  draft.patients[pid].script.at = Math.max(draft.patients[pid].script.at, t);
  return draft;
}

/** Disable / re-enable one reaction (it stays visible in Live control). */
export function setReactionEnabled(state, pid, rid, enabled, ctx) {
  reactionOf(ctx, pid, rid);
  if (!state.patients[pid].script.disabled[rid] === Boolean(enabled)) return state;
  const { draft, t } = begin(state, pid, ctx);
  if (enabled) delete draft.patients[pid].script.disabled[rid];
  else draft.patients[pid].script.disabled[rid] = true;
  log(draft, t, ctx, pid, enabled ? 'reaction-enabled' : 'reaction-disabled', { reactionId: rid });
  return draft;
}

/** "Skip": cancels a countdown that is running now; it re-arms only if its anchor happens again. */
export function skipArmed(state, pid, rid, ctx) {
  const r = reactionOf(ctx, pid, rid);
  const w = r.when.kind === 'duration' ? { ...r.when, id: r.id } : r.when;
  const anchor = r.when.kind === 'elapsed' || r.when.kind === 'duration' ? anchorOf(state.patients[pid].script, w) : null;
  if (anchor == null) return state;
  const { draft, t } = begin(state, pid, ctx);
  draft.patients[pid].script.consumed[rid] = anchor;
  log(draft, t, ctx, pid, 'reaction-skipped', { reactionId: rid, anchor });
  return draft;
}

/**
 * Pause / resume scripting for one patient. While paused nothing reacts (what happens meanwhile is not
 * replayed later). Resuming restarts every countdown from the moment of resuming.
 */
export function setScriptPaused(state, pid, paused, ctx) {
  if (Boolean(state.patients[pid]?.script?.paused) === Boolean(paused)) return state;
  const { draft, t } = begin(state, pid, ctx);
  const sc = draft.patients[pid].script;
  sc.paused = Boolean(paused);
  if (!paused) { sc.resumedAt = t; sc.logCursor = draft.log.length; sc.histCursor = draft.patients[pid].vitalsHistory.length; sc.at = Math.max(sc.at, t); }
  log(draft, t, ctx, pid, paused ? 'script-paused' : 'script-resumed', {});
  if (!paused) sc.logCursor = draft.log.length; // the resume entry itself isn't a trigger
  return draft;
}

/** Instructor adds a recovery penalty now ({ percent?, caps?, label? }); logged. */
export function addPenalty(state, pid, penalty, ctx) {
  const { draft, t } = begin(state, pid, ctx);
  earnPenalty(draft, pid, { label: 'Added by instructor', ...penalty }, { t, now: ctx.now, user: ctx.user, cause: { kind: 'instructor', userId: ctx.user.userId } });
  return draft;
}

/** Instructor reduces a penalty to `percent`, or clears it (percent null; penaltyId null clears all). The patient recovers to match. */
export function setPenalty(state, pid, penaltyId, percent, ctx) {
  const { draft, t } = begin(state, pid, ctx);
  changePenalty(draft, pid, penaltyId, percent, { t, now: ctx.now, user: ctx.user, catalogs: ctx.catalogs, template: ctx.templatesById[pid] });
  return draft;
}
