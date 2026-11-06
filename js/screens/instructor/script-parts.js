// Small form parts for the script builder (display only): option lists from the template and catalogs,
// a checkbox list, and select helpers. Labels from data go through h() (text only).

import { h } from '../shared/dom.js';
import { matcherKey } from './script-model.js';

/** Everything the builder's dropdowns offer, from this patient and the catalogs. */
export function scriptOptions(t, catalogs) {
  const ivs = catalogs.interventions.interventions;
  const orders = t.orders.map((o) => ({ id: o.id, label: o.text.length > 70 ? `${o.text.slice(0, 68)}…` : o.text, med: o.med }));
  return {
    interventions: ivs.map((i) => ({ id: i.id, label: i.label, fields: i.chartFields || [] })),
    orders,
    medOrders: orders.filter((o) => o.med),
    states: (t.script?.states || []).map((s) => ({ id: s.id, label: s.label })),
    reactions: (t.script?.reactions || []).map((r) => ({ id: r.id, label: r.label || r.id })),
    events: t.events.map((e) => ({ id: e.id, label: `${e.id} (${e.type}${typeof e.atMin === 'number' ? `, minute ${e.atMin}` : ', on trigger'})` })),
    orderSets: [...new Set(t.orders.map((o) => o.orderSet).filter(Boolean))],
    pendingLabs: t.labs.filter((l) => l.status === 'pending').map((l) => ({ code: l.code, label: l.label || l.code })),
    rhythms: Object.entries(catalogs.rhythms?.rhythms || {}).map(([id, r]) => ({ id, label: r.label })),
    /** Actions for "without" / "done" lists: interventions, orders, med orders. */
    matchers: [
      ...ivs.map((i) => ({ key: matcherKey({ kind: 'intervention', interventionId: i.id }), label: i.label })),
      ...orders.map((o) => ({ key: matcherKey({ kind: 'order', orderId: o.id }), label: `Order: ${o.label}` })),
      ...orders.filter((o) => o.med).map((o) => ({ key: matcherKey({ kind: 'med', orderId: o.id }), label: `Med given: ${o.med}` })),
    ],
  };
}

export const VITAL_LABELS = [['spo2', 'SpO₂ %'], ['hr', 'HR'], ['rr', 'RR'], ['bp', 'BP'], ['sbp', 'Systolic BP'], ['dbp', 'Diastolic BP'], ['tempF', 'Temp °F'], ['o2', 'O₂'], ['pain', 'Pain'], ['gcs', 'GCS'], ['glucose', 'Glucose']];
export const vitalLabel = (k) => VITAL_LABELS.find(([x]) => x === k)?.[1] || k;

/** <select> from [{ value, label }] (or [value, label] pairs), with a blank option when `blank` is a string. */
export function select(label, options, value, { blank = null, onchange = null } = {}) {
  const opts = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));
  return h('select', { 'aria-label': label, onchange },
    blank != null ? h('option', { value: '' }, blank) : null,
    opts.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label)));
}

/** A scrolling list of checkboxes. Returns { el, value() → selected keys }. */
export function checkList(label, options, selected = []) {
  const boxes = options.map((o) => ({ key: o.key, box: h('input', { type: 'checkbox', checked: selected.includes(o.key) }) }));
  const extra = selected.filter((k) => !options.some((o) => o.key === k)); // kept even if not offered
  return {
    el: h('fieldset', { class: 'check-list' }, h('legend', {}, label),
      boxes.map(({ box }, i) => h('label', { class: 'inline' }, box, ` ${options[i].label}`))),
    value: () => [...boxes.filter((b) => b.box.checked).map((b) => b.key), ...extra],
  };
}

export const input = (label, value = '', attrs = {}) => h('input', { class: 'input', 'aria-label': label, value: value ?? '', ...attrs });
