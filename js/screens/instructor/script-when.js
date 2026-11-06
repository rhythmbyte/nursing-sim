// Script builder: the "When" (trigger) and "If" (conditions) parts of a reaction form. Each returns
// { el, value() } with the form shape script-model-reactions.js expects. Display only.

import { h, clear } from '../shared/dom.js';
import { helpField } from '../shared/help.js';
import { select, input, checkList, VITAL_LABELS } from './script-parts.js';

const field = (label, el, hint) => helpField('script', label, el, hint);
const KINDS = [['intervention', 'A student charts an intervention'], ['order', 'Work is done on an order'], ['med', 'A med is given, held or not given'],
  ['vitals', 'A vital sign crosses a threshold'], ['elapsed', 'Time passes (optionally without an action)'], ['fired', 'Another reaction or event fires']];
const OPS = [['<=', '≤ (falls to)'], ['<', '< (falls below)'], ['>=', '≥ (rises to)'], ['>', '> (rises above)']];
const THRESHOLD_FIELDS = VITAL_LABELS.filter(([k]) => !['bp', 'o2', 'pain'].includes(k));
const show = (el, on) => { el.hidden = !on; };

export function whenPart(w, opts) {
  const kind = select('Trigger', KINDS, w.kind);
  const iv = select('Intervention', opts.interventions.map((i) => [i.id, i.label]), w.interventionId, { blank: '(pick one)' });
  const mode = select('Field tests combine', [['all', 'All of these'], ['any', 'Any one of these']], w.where.mode);
  const rows = [];
  const rowsBox = h('div', { class: 'pick-list' });
  const fieldsOf = () => opts.interventions.find((i) => i.id === iv.value)?.fields || [];
  function addRow(r = { field: '', min: '', max: '', matches: '', excludes: '' }) {
    const n = rows.length + 1;
    const row = { field: select(`Field test ${n} field`, fieldsOf().map((f) => [f, f]), r.field, { blank: '(field)' }),
      min: input(`Field test ${n} at least`, r.min, { placeholder: 'at least' }), max: input(`Field test ${n} at most`, r.max, { placeholder: 'at most' }),
      matches: input(`Field test ${n} contains`, r.matches, { placeholder: 'contains (comma list)' }), excludes: input(`Field test ${n} does not contain`, r.excludes, { placeholder: 'does not contain' }) };
    rows.push(row);
    rowsBox.append(h('div', { class: 'pick-row' }, row.field, row.min, row.max, row.matches, row.excludes));
  }
  w.where.rows.forEach(addRow);
  iv.addEventListener('change', () => { const keep = rows.map((r) => ({ field: r.field.value, min: r.min.value, max: r.max.value, matches: r.matches.value, excludes: r.excludes.value })); rows.length = 0; clear(rowsBox); keep.forEach(addRow); });
  const order = select('Order', opts.orders.map((o) => [o.id, o.label]), w.orderId, { blank: '(pick one)' });
  const medOrder = select('Med order', opts.medOrders.map((o) => [o.id, o.med]), w.orderId, { blank: '(pick one)' });
  const medResult = select('MAR result', [['given', 'given'], ['held', 'held'], ['not-given', 'not given']], w.medResult);
  const doseMin = input('Dose at least', w.doseMin); const doseMax = input('Dose at most', w.doseMax);
  const vfield = select('Vital sign', THRESHOLD_FIELDS, w.field); const op = select('Direction', OPS, w.op); const value = input('Threshold', w.value, { type: 'number' });
  const afterMin = input('Minutes', w.afterMin, { type: 'number', min: 0 });
  const since = select('Counting from', [['state', 'entering a state'], ['event', 'an event firing'], ['reaction', 'a reaction firing'], ['start', 'the start of the sim']], w.since);
  const sState = select('Countdown state', opts.states.map((s) => [s.id, s.label]), w.state, { blank: '(pick one)' });
  const sEvent = select('Event', opts.events.map((e) => [e.id, e.label]), w.eventId, { blank: '(pick one)' });
  const sReaction = select('Reaction', opts.reactions.map((r) => [r.id, r.label]), w.reactionId, { blank: '(pick one)' });
  const without = checkList('…unless the student does any of these first', opts.matchers, w.without);
  const firedKind = select('Fired by', [['reaction', 'a reaction'], ['event', 'an event']], w.firedKind);

  const groups = {
    intervention: h('div', {}, field('Intervention', iv), field('Field tests combine', mode), rowsBox, h('button', { class: 'btn btn-small', type: 'button', onclick: () => addRow() }, 'Add field test')),
    order: field('Order', order),
    med: h('div', { class: 'editor-grid' }, field('Med order', medOrder), field('MAR result', medResult), field('Dose at least', doseMin), field('Dose at most', doseMax)),
    vitals: h('div', { class: 'editor-grid' }, field('Vital sign', vfield), field('Direction', op), field('Threshold', value)),
    elapsed: h('div', {}, h('div', { class: 'editor-grid' }, field('Minutes', afterMin), field('Counting from', since)), sState, sEvent, sReaction, without.el),
    fired: h('div', { class: 'editor-grid' }, field('Fired by', firedKind)),
  };
  const sinceWrap = { state: field('Countdown state', sState), event: field('Event', sEvent), reaction: field('Reaction', sReaction) };
  groups.elapsed.replaceChildren(groups.elapsed.firstChild, ...Object.values(sinceWrap), without.el);
  const firedWrap = { reaction: field('Reaction', select('Fired reaction', opts.reactions.map((r) => [r.id, r.label]), w.reactionId, { blank: '(pick one)' })), event: field('Event', select('Fired event', opts.events.map((e) => [e.id, e.label]), w.eventId, { blank: '(pick one)' })) };
  groups.fired.append(firedWrap.reaction, firedWrap.event);
  const sync = () => {
    for (const [k, el] of Object.entries(groups)) show(el, kind.value === k);
    for (const [k, el] of Object.entries(sinceWrap)) show(el, since.value === k);
    for (const [k, el] of Object.entries(firedWrap)) show(el, firedKind.value === k);
  };
  [kind, since, firedKind].forEach((x) => x.addEventListener('change', sync));
  sync();

  return {
    el: h('div', { class: 'script-when' }, field('Trigger', kind), ...Object.values(groups)),
    value: () => ({
      kind: kind.value, interventionId: iv.value, where: { mode: mode.value, rows: rows.map((r) => ({ field: r.field.value, min: r.min.value, max: r.max.value, matches: r.matches.value, excludes: r.excludes.value })), raw: w.where.raw },
      orderId: kind.value === 'med' ? medOrder.value : order.value, medResult: medResult.value, doseMin: doseMin.value, doseMax: doseMax.value,
      field: vfield.value, op: op.value, value: value.value, afterMin: afterMin.value, since: since.value, state: sState.value,
      eventId: kind.value === 'fired' ? firedWrap.event.querySelector('select').value : sEvent.value,
      reactionId: kind.value === 'fired' ? firedWrap.reaction.querySelector('select').value : sReaction.value,
      without: without.value(), firedKind: firedKind.value,
    }),
  };
}

export function ifPart(c, opts) {
  const states = opts.states.map((s) => ({ key: s.id, label: s.label }));
  const inState = checkList('Only while the patient is in', states, c.inState);
  const notInState = checkList('Not while the patient is in', states, c.notInState);
  const done = checkList('Only after the student has done', opts.matchers, c.done);
  const notDone = checkList('Only if the student has NOT done', opts.matchers, c.notDone);
  const vitals = [];
  const vbox = h('div', { class: 'pick-list' });
  const addVital = (v = { field: 'spo2', min: '', max: '' }) => {
    const n = vitals.length + 1;
    const row = { field: select(`Vitals range ${n} field`, THRESHOLD_FIELDS, v.field), min: input(`Vitals range ${n} at least`, v.min, { placeholder: 'at least' }), max: input(`Vitals range ${n} at most`, v.max, { placeholder: 'at most' }) };
    vitals.push(row); vbox.append(h('div', { class: 'pick-row' }, row.field, row.min, row.max));
  };
  c.vitals.forEach(addVital);
  const from = input('From sim minute', c.from, { type: 'number', min: 0 }); const to = input('To sim minute', c.to, { type: 'number', min: 0 });
  return {
    el: h('div', { class: 'script-if' },
      h('div', { class: 'check-grid' }, inState.el, notInState.el),
      h('details', {}, h('summary', {}, 'More conditions (actions, vitals, time window)'),
        h('div', { class: 'check-grid' }, done.el, notDone.el),
        h('h5', {}, 'Vitals ranges'), vbox, h('button', { class: 'btn btn-small', type: 'button', onclick: () => addVital() }, 'Add vitals range'),
        h('div', { class: 'editor-grid' }, field('From sim minute', from), field('To sim minute', to)))),
    value: () => ({ inState: inState.value(), notInState: notInState.value(), done: done.value(), notDone: notDone.value(),
      vitals: vitals.map((r) => ({ field: r.field.value, min: r.min.value, max: r.max.value })), from: from.value, to: to.value }),
  };
}
