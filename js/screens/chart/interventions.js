// Interventions: category → intervention → small form (chartFields) → Save. Each save is time-stamped.
// "Performed by" offers Me / LPN / CNA on every intervention; whether delegating was appropriate is
// judged by the inappropriate-delegation rule (phase 5), not here.

import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { at, byWhom, fieldLabel, patientLog } from './util.js';
import { vitalsInputs } from './vitals-form.js';

function pendingNote(state, pid, taskId) {
  const t = state.patients[pid].delegations.find((d) => d.id === taskId);
  if (!t) return null;
  return h('span', { class: `badge ${t.status === 'done' ? 'badge-ok' : 'badge-pending'}` },
    t.status === 'done' ? `reported ${at(state, t.completedAt)}` : `due ~${at(state, t.dueAt)}`);
}

export default {
  id: 'interventions',
  label: 'Interventions',
  mount(root, { pid, view, catalogs, act, runner, scenario }) {
    const reveal = scenario.settings.revealManualVitals;
    const cat = catalogs.interventions;
    let category = cat.categories[0].id;
    let selected = null;

    const catBar = h('div', { class: 'pill-row', role: 'group', 'aria-label': 'Categories' });
    const ivBar = h('div', { class: 'pill-row', role: 'group', 'aria-label': 'Interventions' });
    const form = h('div', {});
    const recent = h('div', {});

    function renderBars() {
      clear(catBar).append(...cat.categories.map((c) => h('button', {
        class: `pill${c.id === category ? ' active' : ''}`,
        'aria-pressed': c.id === category ? 'true' : 'false',
        onclick: () => { category = c.id; selected = null; renderBars(); renderForm(); },
      }, c.label)));
      clear(ivBar).append(...cat.interventions.filter((i) => i.category === category).map((i) => h('button', {
        class: `pill pill-iv${selected?.id === i.id ? ' active' : ''}`,
        'aria-pressed': selected?.id === i.id ? 'true' : 'false',
        onclick: () => { selected = i; renderBars(); renderForm(); },
      }, i.label)));
    }

    function renderForm() {
      if (!selected) { clear(form).append(h('p', { class: 'muted' }, 'Pick an intervention to chart it.')); return; }
      const iv = selected;
      // Vital-sign interventions get the vitals form (device values from the monitor, Measure if revealed).
      const vf = iv.vitalsCapture ? vitalsInputs(iv.chartFields, { reveal, vcat: catalogs.vitals, measure: () => runner.measure(pid) }) : null;
      const inputs = vf ? {} : Object.fromEntries(iv.chartFields.map((f) => [f, h('input', { type: 'text', class: 'input', name: f })]));
      const ps = runner.state.patients[pid];
      const forOrders = view.orders.filter((o) => ps.orders[o.id] && ps.orders[o.id].status !== 'done' && (o.interventionIds || []).includes(iv.id));
      const orderSel = h('select', { name: 'order' },
        h('option', { value: '' }, 'Not for a specific order'),
        forOrders.map((o, i) => h('option', { value: o.id, selected: i === 0 }, o.text.length > 90 ? `${o.text.slice(0, 88)}…` : o.text)));
      const by = h('select', { name: 'by' }, ['Me', 'LPN', 'CNA'].map((x) => h('option', { value: x === 'Me' ? '' : x }, x === 'Me' ? 'Me' : `Delegate to ${x}`)));

      clear(form).append(h('form', {
        class: 'iv-form',
        onsubmit: (e) => {
          e.preventDefault();
          const fields = vf ? vf.values() : Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
          act('chartIntervention', { interventionId: iv.id, fields, orderId: orderSel.value || null, delegatedTo: by.value || null });
          toast(by.value ? `Delegated to ${by.value}: ${iv.label}. They'll report back.` : `Charted: ${iv.label}`);
          renderForm();
        },
      },
        h('h4', {}, iv.label),
        vf ? vf.el : iv.chartFields.map((f) => h('label', { class: 'field' }, h('span', {}, fieldLabel(f)), inputs[f])),
        h('label', { class: 'field' }, h('span', {}, 'For order'), orderSel),
        h('label', { class: 'field' }, h('span', {}, 'Performed by'), by),
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
      ));
    }

    root.append(h('div', { class: 'chart-grid two' },
      h('section', { class: 'panel' }, h('h3', {}, 'Chart an intervention'), catBar, ivBar, form),
      h('section', { class: 'panel' }, h('h3', {}, 'Charted this shift'), recent),
    ));
    renderBars();
    renderForm();

    const labelOf = Object.fromEntries(cat.interventions.map((i) => [i.id, i.label]));
    return {
      update(state) {
        const entries = patientLog(state, pid, 'intervention').slice(0, 15);
        clear(recent).append(entries.length
          ? h('ul', { class: 'feed' }, entries.map((l) => h('li', {},
            h('span', { class: 'feed-time' }, at(state, l.simMin)),
            h('span', {}, h('strong', {}, labelOf[l.details.interventionId] || l.details.interventionId),
              Object.entries(l.details.fields || {}).filter(([, v]) => v).map(([k, v]) => ` · ${fieldLabel(k)}: ${v}`).join(''),
              h('span', { class: 'muted' }, ` · ${byWhom(l)}`),
              l.details.delegatedTo ? pendingNote(state, pid, l.details.taskId) : null))))
          : h('p', { class: 'muted' }, 'Nothing charted yet.'));
      },
    };
  },
};
