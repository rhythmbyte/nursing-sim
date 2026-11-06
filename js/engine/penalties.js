// Recovery penalties (pure, no DOM). Neglect stays reversible, but late treatment helps less.
// A penalty is earned by a reaction effect { type: 'penalty', percent?, caps?, vitals?, wearOffMin?, slowFactor?, label? }.
//   percent   — the patient recovers only (100 − percent)% of the way to a scripted target (70 → 99 with 20%: ~93)
//   caps      — { spo2: 94, sbp: 95 }: recovery stops at this value (in whichever direction is recovery)
//   vitals    — which vitals it limits (default all of RECOVERABLE)
//   wearOffMin — once treated (the first recovery after it was earned), it fades to nothing over N min; else permanent
//   slowFactor — recovery trends take this many times longer
// Penalties stack (percent adds up, the tightest cap wins) up to settings.recoveryPenaltyMaxPercent.
// "Recovery" = a scripted target that moves a vital toward vitals.json recovery.normal. Worsening is never limited.
// Session: patients[id].penalties [{ id, label, percent, caps, vitals, wearOffMin, slowFactor, earnedAt, treatedAt, cause, by }]
//          patients[id].scriptTarget { values, overMin, at } — the last scripted target before penalties (re-applied as they wear off).

import { append, SYSTEM } from './log.js';
import { addAlert } from './alerts.js';
import { recordVitals, setVitalsTarget } from './vitals-control.js';

export const RECOVERABLE = ['spo2', 'hr', 'rr', 'sbp', 'dbp', 'tempF'];
const DECIMALS = { tempF: 1 };
const round = (k, v) => { const p = 10 ** (DECIMALS[k] || 0); return Math.round(v * p) / p; };
const parseBp = (bp) => { const m = /^(\d{2,3})\/(\d{2,3})$/.exec(String(bp ?? '')); return m ? { sbp: Number(m[1]), dbp: Number(m[2]) } : null; };

/** Vitals → flat numbers ({ bp: '90/50' } → { sbp: 90, dbp: 50 }). */
function flat(values) {
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (k === 'bp') Object.assign(out, parseBp(v) || {});
    else if (typeof v === 'number') out[k] = v;
  }
  return out;
}

const distance = (v, [lo, hi]) => (v < lo ? lo - v : v > hi ? v - hi : 0);

/**
 * Normal ranges for one patient: vitals.json recovery.normal with the patient's own normalRanges on top
 * (e.g. Linda's COPD SpO₂ 88–92). Used by penalties, the event builder's "To" hint and the debrief.
 */
export function normalFor(template, catalogs) {
  return { ...(catalogs?.vitals?.recovery?.normal || {}), ...(template?.normalRanges || {}) };
}

/** Does moving `from` → `to` bring this vital closer to normal? */
export function isRecovery(k, from, to, normal) {
  const range = normal?.[k];
  return Boolean(range) && from != null && to != null && distance(to, range) < distance(from, range);
}

/** Wear-off factor of one penalty at time t: 1 = full, 0 = gone. */
export function strength(p, t) {
  if (!p.wearOffMin || p.treatedAt == null) return 1;
  return Math.max(0, 1 - (t - p.treatedAt) / p.wearOffMin);
}

/** Combined penalty for one vital at time t: { percent (stacked, max applied), caps: [values], slow (largest factor) }. */
export function penaltyFor(penalties, k, t, maxPercent) {
  let percent = 0; let slow = 1;
  const caps = [];
  for (const p of penalties || []) {
    const s = strength(p, t);
    if (s <= 0 || (p.vitals?.length && !p.vitals.includes(k))) continue;
    percent += (p.percent || 0) * s;
    if (p.caps?.[k] != null) caps.push(p.caps[k]); // all apply, so the tightest one wins
    if (p.slowFactor > slow) slow = p.slowFactor;
  }
  return { percent: Math.min(percent, maxPercent), caps, slow };
}

/** One vital: where a recovery from `from` toward `to` actually ends up. */
export function limitOne(k, from, to, pen, normal) {
  if (!isRecovery(k, from, to, normal)) return to;
  let v = from + (to - from) * (1 - pen.percent / 100);
  const up = to > from;
  for (const c of pen.caps) v = up ? Math.min(v, Math.max(c, from)) : Math.max(v, Math.min(c, from));
  return round(k, v);
}

/**
 * Applies the patient's penalties to a scripted target. Returns { values, overMin, limited: [{ k, target, effective }] }.
 * `current` = the patient's vitals now. Non-numeric values (rhythm, O₂ text) pass through.
 */
export function limitTarget(current, target, overMin, { penalties, t, maxPercent, normal, enabled = true, overMinBy = null }) {
  if (!enabled || !penalties?.length) return { values: target, overMin, overMinBy, limited: [] };
  const cur = flat(current);
  const tgt = flat(target);
  const eff = {};
  const limited = [];
  let slow = 1;
  for (const [k, to] of Object.entries(tgt).filter(([x]) => RECOVERABLE.includes(x))) {
    const pen = penaltyFor(penalties, k, t, maxPercent);
    if (!pen.percent && !pen.caps.length) { eff[k] = to; continue; }
    const v = limitOne(k, cur[k], to, pen, normal);
    eff[k] = v;
    if (v !== to) limited.push({ k, target: to, effective: v });
    if (isRecovery(k, cur[k], to, normal) && pen.slow > slow) slow = pen.slow;
  }
  const values = { ...target };
  for (const k of RECOVERABLE.filter((x) => x !== 'sbp' && x !== 'dbp')) if (k in eff && k in values) values[k] = eff[k];
  if ('bp' in target && eff.sbp != null && eff.dbp != null) values.bp = `${Math.round(eff.sbp)}/${Math.round(eff.dbp)}`;
  const slowBy = overMinBy && slow !== 1 ? Object.fromEntries(Object.entries(overMinBy).map(([k, v]) => [k, v * slow])) : overMinBy;
  return { values, overMin: overMin ? overMin * slow : overMin, overMinBy: slowBy, limited };
}

/** Total percent now (for Live control and the "penalty reaches X%" trigger), capped at the maximum. */
export function totalPercent(penalties, t, maxPercent) {
  return Math.min(maxPercent, (penalties || []).reduce((s, p) => s + (p.percent || 0) * strength(p, t), 0));
}

const settingsOf = (draft) => ({ maxPercent: draft.settings.recoveryPenaltyMaxPercent ?? 60, enabled: draft.settings.recoveryPenalties !== false });

function logChange(draft, pid, t, user, action, details, before) {
  const ps = draft.patients[pid];
  const { maxPercent } = settingsOf(draft);
  append(draft, { simMin: t, wallTime: details.now, ...user, patientId: pid, action, details: { ...details, now: undefined, beforePercent: before, afterPercent: totalPercent(ps.penalties, t, maxPercent) } });
}

/** Reaction effect / instructor "Add penalty". Mutates draft. Skipped (logged) when penalties are off for this sim. */
export function earnPenalty(draft, pid, e, { t, now, user = SYSTEM, cause = {} }) {
  const ps = draft.patients[pid];
  ps.penalties ??= [];
  const { maxPercent, enabled } = settingsOf(draft);
  if (!enabled) { append(draft, { simMin: t, wallTime: now, ...user, patientId: pid, action: 'penalty-skipped', details: { reason: 'recovery penalties are off in this sim', cause } }); return null; }
  const before = totalPercent(ps.penalties, t, maxPercent);
  const p = { id: `pen${ps.penalties.length + 1}`, label: e.label || cause.label || 'Recovery penalty', percent: e.percent || 0, caps: e.caps || null, vitals: e.vitals || null,
    wearOffMin: e.wearOffMin || null, slowFactor: e.slowFactor || null, earnedAt: t, treatedAt: null, cause, by: user.userId };
  ps.penalties.push(p);
  logChange(draft, pid, t, user, 'penalty-earned', { penaltyId: p.id, label: p.label, percent: p.percent, caps: p.caps, vitals: p.vitals, wearOffMin: p.wearOffMin, cause, now }, before);
  addAlert(draft, { simMin: t, patientId: pid, kind: 'penalty', message: `Recovery penalty: ${p.label}${p.percent ? ` (−${p.percent}%)` : ''}`, audience: ['instructor'] });
  return p;
}

/** Instructor: set a penalty's percent (reduce) or remove it (percent null → clear; id null → clear all). Re-applies the target. */
export function changePenalty(draft, pid, penaltyId, percent, { t, now, user, catalogs, template = null }) {
  const ps = draft.patients[pid];
  const { maxPercent } = settingsOf(draft);
  const before = totalPercent(ps.penalties, t, maxPercent);
  if (percent == null) ps.penalties = penaltyId ? (ps.penalties || []).filter((p) => p.id !== penaltyId) : [];
  else { const p = ps.penalties.find((x) => x.id === penaltyId); if (!p) throw new Error(`No penalty ${penaltyId}`); p.percent = Math.max(0, Number(percent)); }
  logChange(draft, pid, t, user, percent == null ? 'penalty-cleared' : 'penalty-changed', { penaltyId, percent, now }, before);
  reapplyTarget(draft, pid, t, normalFor(template, catalogs));
}

/**
 * The script sets a vitals target: store it un-penalized, then return what actually applies.
 * Marks penalties as treated at the first recovery after they were earned (starts their wear-off).
 */
export function penalizeTarget(draft, pid, target, overMin, { t, now, user = SYSTEM, cause = {}, template = null }, catalogs, overMinBy = null) {
  const ps = draft.patients[pid];
  ps.scriptTarget = { values: { ...target }, from: { ...ps.vitals }, at: t }; // from = where this recovery starts
  const { maxPercent, enabled } = settingsOf(draft);
  const normal = normalFor(template, catalogs);
  const out = limitTarget(ps.vitals, target, overMin, { penalties: ps.penalties, t, maxPercent, normal, enabled, overMinBy });
  const recovering = Object.entries(flat(target)).some(([k, v]) => isRecovery(k, flat(ps.vitals)[k], v, normal));
  if (recovering) for (const p of ps.penalties || []) if (p.treatedAt == null && p.earnedAt <= t) p.treatedAt = t;
  if (out.limited.length) append(draft, { simMin: t, wallTime: now, ...user, patientId: pid, action: 'recovery-limited', details: { limited: out.limited, percent: totalPercent(ps.penalties, t, maxPercent), slowedTo: out.overMin !== overMin ? out.overMin : undefined, cause } });
  return out;
}

/**
 * Re-applies the last scripted target with the penalties as they are now (after wear-off or an instructor change),
 * measured from where that recovery started. A trend still running is re-aimed at the new value (same end time).
 * Mutates ps; returns true if anything changed.
 */
export function reapplyTarget(draft, pid, t, normal) {
  const ps = draft.patients[pid];
  if (!ps.scriptTarget) return false;
  const { maxPercent, enabled } = settingsOf(draft);
  const out = limitTarget(ps.scriptTarget.from, ps.scriptTarget.values, 0, { penalties: ps.penalties, t, maxPercent, normal, enabled });
  const numeric = Object.fromEntries(Object.entries(out.values).filter(([k]) => k === 'bp' || RECOVERABLE.includes(k)));
  if (ps.vitalsTrend && ps.vitalsTrend.toMin > t) {
    const aimed = Object.fromEntries(Object.entries(numeric).filter(([k]) => k in ps.vitalsTrend.to));
    if (Object.entries(aimed).every(([k, v]) => ps.vitalsTrend.to[k] === v)) return false;
    setVitalsTarget(ps, { ...ps.vitalsTrend.to, ...aimed }, ps.vitalsTrend.toMin - t, t);
    return true;
  }
  const changed = Object.entries(numeric).filter(([k, v]) => ps.vitals[k] !== v);
  if (!changed.length) return false;
  for (const [k, v] of changed) ps.vitals[k] = v;
  recordVitals(ps, t);
  return true;
}

const wearing = (ps, t) => (ps.penalties || []).some((p) => p.wearOffMin && p.treatedAt != null && !p.wornOffAt && p.treatedAt <= t);

/** Tick processor: once per sim minute, fades wearing penalties and lets the patient recover further. */
export const penaltyProcessor = {
  due(state, upto) {
    return Object.values(state.patients).some((ps) => wearing(ps, upto) && Math.floor(upto) > (ps.penaltyStepMin ?? -1));
  },
  apply(draft, upto, ctx) {
    const normalOf = (pid) => normalFor(ctx.templatesById?.[pid], ctx.catalogs);
    for (const [pid, ps] of Object.entries(draft.patients)) {
      if (!wearing(ps, upto)) continue;
      for (let m = Math.max(Math.floor(ps.penaltyStepMin ?? -1) + 1, Math.ceil(Math.min(...ps.penalties.filter((p) => p.treatedAt != null).map((p) => p.treatedAt)))); m <= Math.floor(upto); m++) {
        ps.penaltyStepMin = m;
        if (!scriptVitalsFree(draft, ps)) continue;
        reapplyTarget(draft, pid, m, normalOf(pid));
        for (const p of ps.penalties) {
          if (p.wearOffMin && p.treatedAt != null && !p.wornOffAt && strength(p, m) <= 0) {
            p.wornOffAt = m;
            append(draft, { simMin: m, wallTime: ctx.now, ...SYSTEM, patientId: pid, action: 'penalty-worn-off', details: { penaltyId: p.id, label: p.label } });
          }
        }
      }
    }
  },
};

/** The script may move vitals (the instructor hasn't taken over with scriptedVitalsAfterInstructor = skip). */
const scriptVitalsFree = (draft, ps) => !(ps.vitalsOverride && draft.settings.scriptedVitalsAfterInstructor === 'skip');
