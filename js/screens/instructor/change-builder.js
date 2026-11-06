// "Scenario change" builder: one moment in the case, written the way the instructor writes cases.
// Saving generates the linked events (shared group) via change-model.js. Reopening edits the same change.

import { helpField, helpTip } from '../shared/help.js';
import { h } from '../shared/dom.js';
import { openModal } from '../shared/modal.js';
import { changeToForm, formToChange } from './change-model.js';
import { answersEditor } from './assessment-answers.js';

const VITALS = [['rhythm', 'Rhythm (monitor)'], ['bp', 'BP'], ['hr', 'HR'], ['rr', 'RR'], ['tempF', 'Temp °F'], ['spo2', 'SpO₂ %'], ['o2', 'O₂'], ['pain', 'Pain']];
const field = (label, el, hint) => helpField('change', label, el, hint); // help text: data/catalogs/help.json

/** onSave(newTemplate) gets the whole updated template. */
export function openChangeBuilder({ template, key, startClock, catalogs, onSave }) {
  const f = changeToForm(template, key, startClock);
  const time = h('input', { class: 'input', type: 'time', value: f.time });
  const manual = h('input', { type: 'checkbox', checked: f.manual });
  const start = h('select', {}, [['call-light', 'Call light'], ['staff-message', 'Staff message (CNA, LPN, family…)'], ['silent', 'Silent (no alert; e.g. a monitor-only change)']].map(([v, l]) => h('option', { value: v, selected: f.start === v }, l)));
  const from = h('input', { class: 'input', value: f.from });
  const message = h('textarea', { class: 'input', rows: 2 }, f.message);
  const vitals = Object.fromEntries(Object.keys(f.vitals).map((k) => [k, h('input', { class: 'input', value: f.vitals[k] ?? '' })]));
  // Rhythm is picked from data/catalogs/rhythms.json (a silent rhythm change = a monitor-only event).
  vitals.rhythm = h('select', {}, h('option', { value: '' }, '(no change)'),
    Object.entries(catalogs.rhythms?.rhythms || {}).map(([id, r]) => h('option', { value: id, selected: id === f.vitals.rhythm }, r.label)));
  const findings = h('textarea', { class: 'input', rows: 3 }, f.findings);
  const recognize = h('textarea', { class: 'input', rows: 3 }, f.recognize);
  const assess = answersEditor(catalogs, f.assessments, { title: 'Change' });
  const orderRows = [];
  const ordersBody = h('div', { class: 'pick-list' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const ivOpts = (sel) => [h('option', { value: '' }, '(none)'), ...catalogs.interventions.interventions.map((i) => h('option', { value: i.id, selected: i.id === sel }, i.label))];
  function addOrder(o = { text: '', type: 'once', tier: 2 }) {
    const n = orderRows.length + 1;
    const row = { id: o.id || null, text: h('input', { class: 'input', value: o.text, placeholder: 'e.g. Obtain 12-lead ECG now', 'aria-label': `New order ${n}` }),
      type: h('select', { 'aria-label': `New order ${n} type` }, ['once', 'prn', 'scheduled', 'continuous'].map((x) => h('option', { value: x, selected: o.type === x }, x))),
      tier: h('select', { 'aria-label': `New order ${n} tier` }, [1, 2, 3].map((x) => h('option', { value: x, selected: Number(o.tier) === x }, `Tier ${x}`))),
      iv: h('select', { 'aria-label': `New order ${n} satisfied by` }, ivOpts(o.interventionId)), med: h('input', { class: 'input', value: o.med || '', placeholder: 'med (optional)', 'aria-label': `New order ${n} medication` }) };
    orderRows.push(row);
    ordersBody.append(h('div', { class: 'pick-row' }, row.text, row.type, row.tier, row.iv, row.med));
  }
  f.orders.forEach(addOrder);
  const fromWrap = field('From', from);
  const sync = () => { fromWrap.hidden = start.value !== 'staff-message'; time.disabled = manual.checked; };
  start.addEventListener('change', sync);
  manual.addEventListener('change', sync);
  sync();

  openModal({
    title: key ? 'Edit scenario change' : 'New scenario change',
    wide: true,
    body: h('div', { class: 'iv-form' },
      h('div', { class: 'editor-grid' },
        field('Time (shift clock)', time),
        h('label', { class: 'inline' }, manual, ' Instructor triggers it (Fire now) ', helpTip('change.manual')),
        field('How it starts', start), fromWrap),
      field('What the patient says / what is reported', message),
      h('h4', {}, 'New vitals (leave blank to keep)'),
      h('div', { class: 'editor-grid' }, Object.keys(vitals).map((k) => field(VITALS.find(([x]) => x === k)?.[1] || k, vitals[k]))),
      field('New assessment findings (one per line; students see them when they reassess)', findings),
      h('h4', {}, 'Assessment findings from now on (blank = no change)'), assess.el,
      h('h4', {}, 'New orders'), ordersBody,
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => addOrder() }, 'Add order'),
      field('What students should recognize (debrief, one per line)', recognize),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Save change', kind: 'primary', onClick: () => {
          if (!manual.checked && !time.value) { err.textContent = 'Pick a time or make it instructor-triggered.'; return false; }
          const form = { ...f, time: time.value, manual: manual.checked, start: start.value, from: from.value, message: message.value.trim(),
            vitals: Object.fromEntries(Object.entries(vitals).map(([k, el]) => [k, el.value.trim()])), findings: findings.value, recognize: recognize.value, assessments: assess.value(),
            orders: orderRows.map((r) => ({ id: r.id, text: r.text.value, type: r.type.value, tier: Number(r.tier.value), interventionId: r.iv.value, med: r.med.value.trim() })) };
          if (form.start !== 'silent' && !form.message) { err.textContent = 'Write what the patient says or what is reported.'; return false; }
          onSave(formToChange(template, form, startClock).template);
          return true;
        },
      },
    ],
  });
}
