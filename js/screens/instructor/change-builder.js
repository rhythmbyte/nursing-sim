// "Scenario change" builder: one moment in the case, written the way the instructor writes cases.
// Saving generates the linked events (shared group) via change-model.js. Reopening edits the same change.

import { h } from '../shared/dom.js';
import { openModal } from '../shared/modal.js';
import { changeToForm, formToChange } from './change-model.js';

const VITALS = [['bp', 'BP'], ['hr', 'HR'], ['rr', 'RR'], ['tempF', 'Temp °F'], ['spo2', 'SpO₂ %'], ['o2', 'O₂'], ['pain', 'Pain']];
const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('span', { class: 'muted small' }, hint) : null);

/** onSave(newTemplate) gets the whole updated template. */
export function openChangeBuilder({ template, key, startClock, catalogs, onSave }) {
  const f = changeToForm(template, key, startClock);
  const time = h('input', { class: 'input', type: 'time', value: f.time });
  const manual = h('input', { type: 'checkbox', checked: f.manual });
  const start = h('select', {}, [['call-light', 'Call light'], ['staff-message', 'Staff message (CNA, LPN, family…)'], ['silent', 'Silent (no alert)']].map(([v, l]) => h('option', { value: v, selected: f.start === v }, l)));
  const from = h('input', { class: 'input', value: f.from });
  const message = h('textarea', { class: 'input', rows: 2 }, f.message);
  const vitals = Object.fromEntries(Object.keys(f.vitals).map((k) => [k, h('input', { class: 'input', value: f.vitals[k] ?? '' })]));
  const findings = h('textarea', { class: 'input', rows: 3 }, f.findings);
  const recognize = h('textarea', { class: 'input', rows: 3 }, f.recognize);
  const orderRows = [];
  const ordersBody = h('div', { class: 'pick-list' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const ivOpts = (sel) => [h('option', { value: '' }, '(none)'), ...catalogs.interventions.interventions.map((i) => h('option', { value: i.id, selected: i.id === sel }, i.label))];
  function addOrder(o = { text: '', type: 'once', tier: 2 }) {
    const row = { id: o.id || null, text: h('input', { class: 'input', value: o.text, placeholder: 'e.g. Obtain 12-lead ECG now' }),
      type: h('select', {}, ['once', 'prn', 'scheduled', 'continuous'].map((x) => h('option', { value: x, selected: o.type === x }, x))),
      tier: h('select', {}, [1, 2, 3].map((x) => h('option', { value: x, selected: Number(o.tier) === x }, `Tier ${x}`))),
      iv: h('select', {}, ivOpts(o.interventionId)), med: h('input', { class: 'input', value: o.med || '', placeholder: 'med (optional)' }) };
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
        h('label', { class: 'inline' }, manual, ' Instructor triggers it (Fire now)'),
        field('How it starts', start), fromWrap),
      field('What the patient says / what is reported', message),
      h('h4', {}, 'New vitals (leave blank to keep)'),
      h('div', { class: 'editor-grid' }, Object.keys(vitals).map((k) => field(VITALS.find(([x]) => x === k)?.[1] || k, vitals[k]))),
      field('New assessment findings (one per line; students see them when they reassess)', findings),
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
            vitals: Object.fromEntries(Object.entries(vitals).map(([k, el]) => [k, el.value.trim()])), findings: findings.value, recognize: recognize.value,
            orders: orderRows.map((r) => ({ id: r.id, text: r.text.value, type: r.type.value, tier: Number(r.tier.value), interventionId: r.iv.value, med: r.med.value.trim() })) };
          if (form.start !== 'silent' && !form.message) { err.textContent = 'Write what the patient says or what is reported.'; return false; }
          onSave(formToChange(template, form, startClock).template);
          return true;
        },
      },
    ],
  });
}
