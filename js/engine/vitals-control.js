// Instructor live vitals control: apply now or trend toward a target over N minutes. Pure, no DOM.
// Every vitals change (scripted keyframe, instructor adjust, each trend minute) is recorded in
// patients[id].vitalsHistory [{ atMin, values }], which the monitor, delegated reports and the
// parameter rules read via vitalsAt(), so they see what the vitals actually were at that moment.

import { simMinOf } from './session.js';
import { append } from './log.js';

const NUMERIC = ['hr', 'rr', 'tempF', 'spo2', 'gcs', 'glucose'];
const DECIMALS = { tempF: 1 };
const round = (k, v) => { const p = 10 ** (DECIMALS[k] || 0); return Math.round(v * p) / p; };
const parseBp = (bp) => { const m = /^(\d{2,3})\/(\d{2,3})$/.exec(String(bp ?? '')); return m ? [Number(m[1]), Number(m[2])] : null; };

/**
 * Records the patient's current vitals at atMin. Mutates ps. A second change in the same minute is appended,
 * not written over the first (vitalsAt takes the last one), because the reaction script reads history entries
 * in order and must see every change. Unchanged values aren't recorded again.
 */
export function recordVitals(ps, atMin) {
  const last = ps.vitalsHistory.at(-1);
  if (last && last.atMin === atMin && JSON.stringify(last.values) === JSON.stringify(ps.vitals)) return;
  ps.vitalsHistory.push({ atMin, values: { ...ps.vitals } });
}

/** Vitals at a sim minute (last recorded change at or before t). */
export function vitalsAt(ps, t) {
  let v = ps.vitalsHistory[0]?.values ?? ps.vitals;
  for (const h of ps.vitalsHistory) if (h.atMin <= t + 1e-9) v = h.values;
  return v;
}

/** Validates and normalizes instructor-entered values. Throws with a readable message. */
export function cleanValues(values) {
  const out = {};
  for (const [k, raw] of Object.entries(values || {})) {
    if (raw === '' || raw == null) continue;
    if (k === 'bp') {
      const bp = String(raw).trim();
      if (!parseBp(bp)) throw new Error(`BP must look like 120/80 (got "${raw}")`);
      out.bp = bp;
    } else if (NUMERIC.includes(k)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${k} must be a number (got "${raw}")`);
      out[k] = n;
    } else {
      out[k] = String(raw).trim(); // o2 device, pain text, rhythm, etc.
    }
  }
  return out;
}

/** f = fraction of the way (0–1), or a function k → fraction (per-vital durations). */
function interpolate(from, to, fr) {
  const out = {};
  for (const [k, target] of Object.entries(to)) {
    const f = typeof fr === 'function' ? fr(k) : fr;
    if (k === 'bp') {
      const a = parseBp(from.bp); const b = parseBp(target);
      out.bp = a && b ? `${Math.round(a[0] + (b[0] - a[0]) * f)}/${Math.round(a[1] + (b[1] - a[1]) * f)}` : target;
    } else if (typeof target === 'number' && typeof from[k] === 'number') {
      out[k] = round(k, from[k] + (target - from[k]) * f);
    } else {
      out[k] = target;
    }
  }
  return out;
}

const trendable = (k, v) => k === 'bp' || typeof v === 'number';

/**
 * Moves vitals toward `target` (already cleaned): now (overMin 0) or as a per-minute trend. Text values apply now.
 * Replaces any trend in progress and records the change. Mutates ps; returns the previous values of the changed keys.
 * Shared by the instructor's Adjust vitals and the reaction script (engine/reactions.js).
 */
export function setVitalsTarget(ps, target, overMin, simMin, overMinBy = null) {
  const from = Object.fromEntries(Object.keys(target).map((k) => [k, ps.vitals[k] ?? null]));
  const dur = (k) => Number(overMinBy?.[k] ?? overMin) || 0; // per-vital duration (guided event builder) or one for all
  const trendTo = Object.fromEntries(Object.entries(target).filter(([k, v]) => dur(k) > 0 && trendable(k, v) && ps.vitals[k] != null));
  const nowValues = Object.fromEntries(Object.entries(target).filter(([k]) => !(k in trendTo)));
  Object.assign(ps.vitals, nowValues);
  const keys = Object.keys(trendTo);
  const longest = Math.max(0, ...keys.map(dur));
  ps.vitalsTrend = keys.length
    ? { fromMin: simMin, toMin: simMin + longest, from: Object.fromEntries(keys.map((k) => [k, ps.vitals[k]])), to: trendTo, lastMin: Math.floor(simMin),
      ...(keys.some((k) => dur(k) !== longest) ? { toMinBy: Object.fromEntries(keys.map((k) => [k, simMin + dur(k)])) } : {}) }
    : null;
  recordVitals(ps, simMin);
  return from;
}

/** Scripted vitals (keyframes, reactions) yield to the instructor when settings.scriptedVitalsAfterInstructor is 'skip'. */
export function scriptedVitalsBlocked(settings, ps) {
  return Boolean(ps.vitalsOverride) && settings.scriptedVitalsAfterInstructor === 'skip';
}

/**
 * Instructor adjusts vitals. args: { values, overMin = 0, presetId? }. overMin 0 = apply now; otherwise
 * numeric values and BP trend linearly to the target (recalculated each sim minute); text values
 * (O₂ device, pain description) apply immediately.
 */
export function adjustVitals(state, patientId, { values, overMin = 0, overMinBy = null, presetId = null }, { now, user }) {
  const target = cleanValues(values);
  if (!Object.keys(target).length) return state;
  if (!(overMin >= 0)) throw new Error('Trend minutes must be 0 or more');
  const draft = structuredClone(state);
  const simMin = simMinOf(state, now);
  const ps = draft.patients[patientId];
  const from = setVitalsTarget(ps, target, overMin, simMin, overMinBy);
  ps.vitalsOverride = true;
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'vitals-adjusted', details: { from, to: target, overMin, ...(overMinBy ? { overMinBy } : {}), presetId } });
  return draft;
}

/** Tick processor: steps active trends once per sim minute up to `upto` (finishing at the target). */
export const trendProcessor = {
  due(state, upto) {
    return Object.values(state.patients).some((ps) => ps.vitalsTrend && (Math.floor(upto) > ps.vitalsTrend.lastMin || upto >= ps.vitalsTrend.toMin));
  },
  apply(draft, upto) {
    for (const ps of Object.values(draft.patients)) {
      const tr = ps.vitalsTrend;
      if (!tr) continue;
      const end = Math.min(upto, tr.toMin);
      for (let t = tr.lastMin + 1; t <= end; t++) {
        Object.assign(ps.vitals, interpolate(tr.from, tr.to, (k) => Math.min(1, (t - tr.fromMin) / ((tr.toMinBy?.[k] ?? tr.toMin) - tr.fromMin))));
        recordVitals(ps, t);
        tr.lastMin = t;
      }
      if (upto >= tr.toMin) {
        Object.assign(ps.vitals, tr.to);
        recordVitals(ps, tr.toMin);
        ps.vitalsTrend = null;
      }
    }
  },
};

/**
 * Target values for a preset. Catalog presets are relative (`delta`, e.g. { sbp: -25, hr: 25 }) and clamped
 * to `limits`; patient presets (patient JSON `vitalsPresets`) are absolute (`values`).
 */
export function presetTarget(current, preset, limits = {}) {
  if (preset.values) return { ...preset.values };
  const clamp = (k, v) => { const [lo, hi] = limits[k] || [-Infinity, Infinity]; return Math.min(hi, Math.max(lo, v)); };
  const out = {};
  const d = preset.delta || {};
  const bp = parseBp(current.bp);
  if (bp && (d.sbp || d.dbp)) out.bp = `${Math.round(clamp('sbp', bp[0] + (d.sbp || 0)))}/${Math.round(clamp('dbp', bp[1] + (d.dbp || 0)))}`;
  for (const [k, dv] of Object.entries(d)) {
    if (k === 'sbp' || k === 'dbp') continue;
    if (typeof current[k] === 'number') out[k] = round(k, clamp(k, current[k] + dv));
  }
  return out;
}
