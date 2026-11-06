// Interventions: category → intervention → small form (chartFields) → Save. Each save is time-stamped.
// "Performed by" offers Me / LPN / CNA on every intervention; whether delegating was appropriate is
// judged by the inappropriate-delegation rule, not here.

import { formDraft, loadDraft, saveDraft, clearDraft } from '../shared/drafts.js';
import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { at, byWhom, fieldLabel, patientLog } from './util.js';
import { vitalsInputs } from './vitals-form.js';
import { searchInterventions, recentInterventions } from './search.js';
import { strikeButton, struckMark } from './strike.js';

function pendingNote(state, pid, taskId) {
  const t = state.patients[pid].delegations.find((d) => d.id === taskId);
  if (!t) return null;
  return h('span', { class: `badge ${t.status === 'done' ? 'badge-ok' : 'badge-pending'}` },
    t.status === 'done' ? `reported ${at(state, t.completedAt)}` : `due ~${at(state, t.dueAt)}`);
}

export default {
  id: 'interventions',
  label: 'Interventions',
  mount(root, ctx) {
    const { pid, catalogs, act, runner, scenario } = ctx;
    const reveal = scenario.settings.revealManualVitals;
    const cat = catalogs.interventions;
    let category = cat.categories[0].id;
    // A form in progress is a draft (shared/drafts.js): which intervention, and what was typed.
    const SEL = `ivsel.${ctx.user.userId}.${pid}`;
    let selected = cat.interventions.find((i) => i.id === loadDraft(SEL)) || null;
    let fd = null;

    const search = h('input', { class: 'input iv-search', type: 'search', placeholder: 'Search interventions (e.g. foley, EKG, vitals)', 'aria-label': 'Search interventions', oninput: () => renderBars() });
    const recentRow = h('div', { class: 'pill-row', role: 'group', 'aria-label': 'Recent' });
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
      const recent = recentInterventions(runner.state.log, ctx.user.userId, cat);
      clear(recentRow).append(...(recent.length ? [h('span', { class: 'muted small' }, 'Recent:'), ...recent.map((i) => h('button', { class: 'pill pill-iv', onclick: () => { selected = i; search.value = ''; renderBars(); renderForm(); } }, i.label))] : []));
      const q = search.value.trim();
      catBar.hidden = Boolean(q);
      const list = q ? searchInterventions(cat, q) : cat.interventions.filter((i) => i.category === category);
      clear(ivBar).append(...(q && !list.length ? [h('span', { class: 'muted' }, 'No match. Try another word.')] : []), ...list.map((i) => h('button', {
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
      const forOrders = ctx.view.orders.filter((o) => ps.orders[o.id] && ps.orders[o.id].status !== 'done' && (o.interventionIds || []).includes(iv.id));
      const orderSel = h('select', { name: 'order' },
        h('option', { value: '' }, 'Not for a specific order'),
        forOrders.map((o, i) => h('option', { value: o.id, selected: i === 0 }, o.text.length > 90 ? `${o.text.slice(0, 88)}…` : o.text)));
      const by = h('select', { name: 'by' }, ['Me', 'LPN', 'CNA'].map((x) => h('option', { value: x === 'Me' ? '' : x }, x === 'Me' ? 'Me' : `Delegate to ${x}`)));

      const formEl = h('form', {
        class: 'iv-form',
        onsubmit: (e) => {
          e.preventDefault();
          const fields = vf ? vf.values() : Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
          const r = act('chartIntervention', { interventionId: iv.id, fields, orderId: orderSel.value || null, delegatedTo: by.value || null });
          if (!r) return;
          fd?.clear(); clearDraft(SEL);
          toast(by.value ? `Delegated to ${by.value}: ${iv.label}. They'll report back.` : r.task ? `Started: ${iv.label} (${Math.round(r.task.lockSec)} s)` : `Charted: ${iv.label}`);
          renderBars(); // refresh the Recent row
          renderForm();
        },
      },
        h('h4', {}, iv.label),
        // Interventions linked to scored tools (interventions.json assessmentTools) offer them in the Assessments tab.
        (iv.assessmentTools || []).filter((id) => runner.assessmentTools().some((t) => t.id === id)).length ? h('p', { class: 'small' }, 'Use a scored tool: ',
          ...(iv.assessmentTools || []).filter((id) => runner.assessmentTools().some((t) => t.id === id)).map((id) => h('button', { class: 'btn btn-small', type: 'button', onclick: () => ctx.openSection?.('assessments', { toolId: id }) },
            runner.assessmentTools().find((t) => t.id === id).name))) : null,
        vf ? vf.el : iv.chartFields.map((f) => h('label', { class: 'field' }, h('span', {}, fieldLabel(f)), inputs[f])),
        h('label', { class: 'field' }, h('span', {}, 'For order'), orderSel),
        h('label', { class: 'field' }, h('span', {}, 'Performed by'), by),
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
      );
      clear(form).append(formEl);
      fd = formDraft(formEl, `iv.${ctx.user.userId}.${pid}.${iv.id}`);
      formEl.addEventListener('input', () => saveDraft(SEL, iv.id), { once: true });
      if (fd.note) formEl.prepend(fd.note);
    }

    root.append(h('div', { class: 'chart-grid two' },
      h('section', { class: 'panel' }, h('h3', {}, 'Chart an intervention'), search, recentRow, catBar, ivBar, form),
      h('section', { class: 'panel' }, h('h3', {}, 'Charted this shift'), recent),
    ));
    renderBars();
    renderForm();

    const labelOf = Object.fromEntries(cat.interventions.map((i) => [i.id, i.label]));
    return {
      update(state) {
        const entries = patientLog(state, pid, 'intervention').slice(0, 15);
        clear(recent).append(entries.length
          ? h('ul', { class: 'feed' }, entries.map((l) => h('li', { class: state.struck?.[l.id] ? 'struck' : '' },
            h('span', { class: 'feed-time' }, at(state, l.simMin)),
            h('span', {}, h('strong', {}, labelOf[l.details.interventionId] || l.details.interventionId),
              Object.entries(l.details.fields || {}).filter(([, v]) => v).map(([k, v]) => ` · ${fieldLabel(k)}: ${v}`).join(''),
              h('span', { class: 'muted' }, ` · ${byWhom(l)}`),
              l.details.delegatedTo ? pendingNote(state, pid, l.details.taskId) : null, struckMark(state, l), strikeButton(state, l, ctx)))))
          : h('p', { class: 'muted' }, 'Nothing charted yet.'));
      },
    };
  },
};
