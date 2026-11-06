// Reaction matching (pure, no DOM): charted-field tests, log-entry matchers, vitals thresholds, conditions.
// Used by engine/reactions.js (live), the dry run, and the integrity checks. Data shapes: SPEC §4.6.

import { countsAsWork } from '../orders.js';

/** Log actions that can trigger a reaction (`when.kind` → matches a log entry). */
export const ACTION_KINDS = ['intervention', 'order', 'med'];
/** Vitals fields a threshold can watch (sbp/dbp come from bp). */
export const VITAL_FIELDS = ['spo2', 'hr', 'rr', 'sbp', 'dbp', 'tempF', 'gcs', 'glucose'];
export const OPS = { '<=': (a, b) => a <= b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '>': (a, b) => a > b };

const lower = (v) => String(v ?? '').toLowerCase();

/** First number in a value ("10", "10 L", "Ceftriaxone 1 g IV" → 1), or null. */
export function numberIn(v) {
  const m = /-?\d+(\.\d+)?/.exec(String(v ?? ''));
  return m ? Number(m[0]) : null;
}

/** One field test: { min?, max?, equals?, matches?: [text], excludes?: [text] } (all parts must hold). */
export function fieldTest(value, test = {}) {
  if (test.min != null || test.max != null) {
    const n = numberIn(value);
    if (n == null || (test.min != null && n < test.min) || (test.max != null && n > test.max)) return false;
  }
  if (test.equals != null && lower(value).trim() !== lower(test.equals).trim()) return false;
  if (test.matches?.length && !test.matches.some((m) => lower(value).includes(lower(m)))) return false;
  if (test.excludes?.length && test.excludes.some((m) => lower(value).includes(lower(m)))) return false;
  return true;
}

/** `where` is { field: test } (all must hold) or a list of those (any one may hold). Missing = matches. */
export function whereMatches(fields = {}, where) {
  if (!where) return true;
  const alts = Array.isArray(where) ? where : [where];
  return alts.some((w) => Object.entries(w).every(([k, t]) => fieldTest(fields[k], t)));
}

/**
 * Does a log entry match an action matcher?
 *   { kind: 'intervention', interventionId, where? }   student (or delegated staff) charted it
 *   { kind: 'order', orderId }                         any work that counts for the order (orders.js countsAsWork)
 *   { kind: 'med', orderId?, med?, result? = 'given', dose? }  MAR entry; dose tests the first number in the med text
 */
export function entryMatches(entry, m, template) {
  const d = entry.details || {};
  if (m.kind === 'intervention') {
    const own = entry.action === 'intervention' && !d.delegatedTo;
    const delegated = entry.action === 'delegation-completed';
    return (own || delegated) && d.interventionId === m.interventionId && whereMatches(own ? d.fields : d.values || {}, m.where);
  }
  if (m.kind === 'order') {
    const order = template?.orders.find((o) => o.id === m.orderId);
    return Boolean(order) && countsAsWork(entry, order);
  }
  if (m.kind === 'med') {
    if (entry.action !== 'med' || d.result !== (m.result || 'given')) return false;
    if (m.orderId && d.orderId !== m.orderId) return false;
    if (m.med && !lower(d.med).includes(lower(m.med))) return false;
    return !m.dose || fieldTest(d.dose ?? d.med, m.dose);
  }
  return false;
}

/** A vitals value by field name (sbp/dbp from "120/80"). */
export function vitalValue(values, field) {
  if (field === 'sbp' || field === 'dbp') {
    const m = /^(\d+)\/(\d+)$/.exec(String(values?.bp ?? ''));
    return m ? Number(m[field === 'sbp' ? 1 : 2]) : null;
  }
  const v = values?.[field];
  return typeof v === 'number' ? v : numberIn(v);
}

/** Threshold { field, op, value } holds for these vitals? */
export function thresholdHolds(values, w) {
  const v = vitalValue(values, w.field);
  return v != null && Boolean(OPS[w.op]?.(v, w.value));
}

/** Crossed into the threshold between two readings (it didn't hold before, it does now). */
export function crossed(prev, cur, w) {
  return thresholdHolds(cur, w) && !thresholdHolds(prev, w);
}

/**
 * Conditions (`if`): { inState?: [ids], notInState?: [ids], vitals?: { field: { min?, max? } },
 * done?: [matchers], notDone?: [matchers], betweenMin?: [from, to] }. All parts must hold.
 * `entries` is this patient's active log (struck entries removed) up to now.
 */
export function conditionsHold(cond, { scriptState, vitals, entries, t, template }) {
  if (!cond) return true;
  if (cond.inState?.length && !cond.inState.includes(scriptState)) return false;
  if (cond.notInState?.includes(scriptState)) return false;
  for (const [field, range] of Object.entries(cond.vitals || {})) {
    const v = vitalValue(vitals, field);
    if (v == null || (range.min != null && v < range.min) || (range.max != null && v > range.max)) return false;
  }
  const any = (m) => entries.some((e) => entryMatches(e, m, template));
  if (cond.done?.length && !cond.done.every(any)) return false;
  if (cond.notDone?.some(any)) return false;
  if (cond.betweenMin && (t < cond.betweenMin[0] || t > cond.betweenMin[1])) return false;
  return true;
}
