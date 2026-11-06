// Script builder: "Test this patient" — a dry run of the working copy through simulated student actions
// and time jumps (engine/reactions/dry-run.js: a private throwaway session; the live sim is never touched).

import { h, clear } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { openModal } from '../shared/modal.js';
import { formatShiftTime } from '../../engine/time.js';
import { dryRun } from '../../engine/reactions/dry-run.js';
import { names, causeText } from '../../engine/reactions/describe.js';
import { scriptOptions, select, input } from './script-parts.js';

const KINDS = [['wait', 'Wait'], ['chart', 'Student charts'], ['med', 'Student gives a med'], ['order', 'Student marks an order done'], ['fire', 'Fire an event'], ['force', 'Instructor forces a state']];

function stepRow(step, opts, n, onRemove) {
  const kind = select(`Step ${n}`, KINDS, step.kind);
  const min = input(`Step ${n} minutes`, step.min ?? 5, { type: 'number', min: 0 });
  const iv = select(`Step ${n} intervention`, opts.interventions.map((i) => [i.id, i.label]), step.interventionId, { blank: '(intervention)' });
  const fieldsBox = h('span', { class: 'pick-row' });
  let fieldInputs = {};
  const drawFields = () => {
    const fields = opts.interventions.find((i) => i.id === iv.value)?.fields || [];
    fieldInputs = Object.fromEntries(fields.map((f) => [f, input(`Step ${n} ${f}`, step.fields?.[f] ?? '', { placeholder: f })]));
    clear(fieldsBox).append(...Object.values(fieldInputs));
  };
  iv.addEventListener('change', drawFields); drawFields();
  const med = select(`Step ${n} med order`, opts.medOrders.map((o) => [o.id, o.med]), step.orderId, { blank: '(med order)' });
  const result = select(`Step ${n} result`, [['given', 'given'], ['held', 'held'], ['not-given', 'not given']], step.result || 'given');
  const order = select(`Step ${n} order`, opts.orders.map((o) => [o.id, o.label]), step.orderId, { blank: '(order)' });
  const ev = select(`Step ${n} event`, opts.events.map((e) => [e.id, e.label]), step.eventId, { blank: '(event)' });
  const st = select(`Step ${n} state`, opts.states.map((s) => [s.id, s.label]), step.stateId, { blank: '(state)' });
  const parts = { wait: h('span', {}, min, ' min'), chart: h('span', {}, iv, fieldsBox), med: h('span', {}, med, result), order: h('span', {}, order), fire: h('span', {}, ev), force: h('span', {}, st) };
  const sync = () => { for (const [k, el] of Object.entries(parts)) el.hidden = kind.value !== k; };
  kind.addEventListener('change', sync); sync();
  const el = h('div', { class: 'pick-row test-step' }, kind, ...Object.values(parts), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { el.remove(); onRemove(); } }, 'Remove'));
  return {
    el,
    value: () => {
      const k = kind.value;
      if (k === 'wait') return { kind: k, min: Number(min.value) || 0 };
      if (k === 'chart') return { kind: k, interventionId: iv.value, fields: Object.fromEntries(Object.entries(fieldInputs).map(([f, x]) => [f, x.value])) };
      if (k === 'med') return { kind: k, orderId: med.value, result: result.value };
      if (k === 'order') return { kind: k, orderId: order.value };
      if (k === 'fire') return { kind: k, eventId: ev.value };
      return { kind: k, stateId: st.value };
    },
  };
}

const VIT = (v) => [`SpO₂ ${v.spo2 ?? '—'}`, `HR ${v.hr ?? '—'}`, `RR ${v.rr ?? '—'}`, `BP ${v.bp ?? '—'}`].join(' · ');

/** Steps are remembered per patient while the page is open, so re-testing after an edit is one click. */
const lastSteps = new Map();

export function openScriptTest({ template, catalogs, settings, startClock }) {
  const opts = scriptOptions(template, catalogs);
  const n = names(template, catalogs);
  const rows = [];
  const list = h('div', { class: 'pick-list' });
  const add = (s = { kind: 'wait', min: 5 }) => { const r = stepRow(s, opts, rows.length + 1, () => rows.splice(rows.indexOf(r), 1)); rows.push(r); list.append(r.el); };
  (lastSteps.get(template.id) || [{ kind: 'wait', min: 60 }, { kind: 'wait', min: 5 }, { kind: 'wait', min: 10 }]).forEach(add);
  const out = h('div', { class: 'test-results' });
  const at = (m) => formatShiftTime(startClock, m);
  function run() {
    const steps = rows.map((r) => r.value());
    lastSteps.set(template.id, steps);
    const frames = dryRun(template, { catalogs, settings, steps, startClock });
    clear(out).append(h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Time', 'Step', 'State', 'Vitals', 'What fired', 'Alerts'].map((c) => h('th', {}, c)))),
      h('tbody', {}, frames.map((f) => h('tr', { class: f.error ? 'tl-red' : f.transitions?.some((x) => x.cause.kind === 'timeout') ? 'tl-amber' : '' },
        h('td', {}, at(f.atMin)), h('td', {}, f.label),
        h('td', {}, f.error ? h('span', { class: 'form-error' }, f.error) : f.stateLabel),
        h('td', {}, f.vitals ? VIT(f.vitals) : '', f.trend ? h('div', { class: 'muted small' }, `trending to ${Object.entries(f.trend.to).map(([k, v]) => `${k} ${v}`).join(', ')} by ${at(f.trend.toMin)}`) : null),
        h('td', {}, (f.fired || []).map((x) => h('div', {}, `${x.label} `, h('span', { class: 'muted small' }, `(${causeText(x.cause, n)})`))), (f.events || []).length ? h('div', { class: 'muted small' }, `Events: ${f.events.join(', ')}`) : null),
        h('td', {}, (f.alerts || []).map((a) => h('div', { class: 'small' }, a))))))));
  }
  openModal({
    title: `Test this patient: ${template.demographics.name}`,
    wide: true,
    body: h('div', { class: 'iv-form' },
      h('p', { class: 'muted' }, 'A dry run of the working copy (unsaved edits included). Nothing here touches the live sim. ', helpTip('script.test')),
      list,
      h('div', { class: 'controls' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => add() }, 'Add step'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => add({ kind: 'chart', interventionId: 'o2-apply', fields: {} }) }, 'Add charting step'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: run }, 'Run')),
      out),
    actions: [{ label: 'Close', kind: 'ghost' }],
  });
  run();
}
