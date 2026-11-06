// Patient editor: sectioned like the instructor's case write-ups. Simple sections are form fields,
// orders are an editable table (text, type, tier, set, delegable), nested parts are JSON. Saves in this
// browser after schema validation; Export / Import JSON; Revert to the file version.

import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { toast } from '../shared/toast.js';
import { downloadJson } from '../shared/download.js';
import { saveLocal, removeLocal, validateItem } from '../../data-loader.js';
import { toForm, fromForm, blankPatient } from './editor-model.js';

const TAGS = ['red', 'yellow', 'green', 'black'];
const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint ? h('span', { class: 'muted small' }, hint) : null);

export function mountPatientEditor(root, { data, reloadData, editorTarget }) {
  const body = h('div', {});
  let id = editorTarget.get() || data.patients[0]?.id;
  let draft = null; // unsaved new patient

  function current() {
    return draft && draft.id === id ? draft : data.patients.find((p) => p.id === id);
  }

  function render() {
    if (!current()) { id = data.patients[0]?.id; draft = null; }
    const t = current();
    if (!t) { clear(body).append(h('p', { class: 'muted' }, 'No patients.')); return; }
    const f = toForm(t);
    const inputs = {};
    const inp = (k, type = 'text') => (inputs[k] = h('input', { class: 'input', type, value: f[k] ?? '' }));
    const area = (k, rows = 3) => { const el = h('textarea', { class: 'input', rows }); el.value = f[k] ?? ''; inputs[k] = el; return el; };
    const sel = (k, opts) => (inputs[k] = h('select', {}, opts.map((o) => h('option', { value: o, selected: String(f[k]) === String(o) }, o))));

    const orderRows = t.orders.map((o) => ({
      o,
      text: h('textarea', { class: 'input', rows: 2 }, o.text),
      type: h('select', {}, ['once', 'scheduled', 'prn', 'continuous', 'parameter'].map((x) => h('option', { value: x, selected: o.type === x }, x))),
      tier: h('select', {}, [1, 2, 3].map((x) => h('option', { value: x, selected: o.tier === x }, `T${x}`))),
      set: h('input', { class: 'input', value: o.orderSet }),
      delegable: h('input', { type: 'checkbox', checked: Boolean(o.delegable) }),
    }));
    const errBox = h('div', {});
    const picker = h('select', { 'aria-label': 'Patient', onchange: (e) => { id = e.target.value; draft = null; editorTarget.set(id); render(); } },
      [...data.patients, ...(draft ? [draft] : [])].map((p) => h('option', { value: p.id, selected: p.id === id }, `${p.demographics.room || '—'} ${p.demographics.name || p.id}`)));
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => importFile(e.target.files[0]) });

    function collect() {
      const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
      const orders = orderRows.map((r) => ({ ...r.o, text: r.text.value.trim(), type: r.type.value, tier: Number(r.tier.value), orderSet: r.set.value.trim(), delegable: r.delegable.checked }));
      return fromForm(values, t, orders);
    }

    async function onSave() {
      let next;
      try { next = collect(); } catch (e) { showErrors([e.message]); return; }
      const errors = saveLocal('patient', next, data.schemas);
      if (errors.length) { showErrors(errors); return; }
      draft = null;
      editorTarget.set(next.id);
      toast('Saved in this browser');
      await reloadData();
    }

    function showErrors(errors) {
      clear(errBox).append(h('div', { class: 'banner banner-error', role: 'alert' }, h('strong', {}, 'Not saved:'), h('ul', {}, errors.slice(0, 10).map((e) => h('li', {}, e)))));
    }

    async function importFile(file) {
      if (!file) return;
      let obj;
      try { obj = JSON.parse(await file.text()); } catch (e) { showErrors([`Not valid JSON: ${e.message}`]); return; }
      const errors = validateItem('patient', obj, data.schemas);
      if (errors.length) { showErrors(errors); return; }
      saveLocal('patient', obj, data.schemas);
      editorTarget.set(obj.id);
      toast(`Imported ${obj.demographics.name}`);
      await reloadData();
    }

    const isLocal = data.local.patients.has(id);
    const inFiles = data.fileIds.patients.has(id);
    clear(body).append(
      h('header', { class: 'screen-header' }, h('h2', {}, 'Patient editor'), picker,
        draft?.id === id ? badge('New, not saved', 'review') : isLocal ? badge(inFiles ? 'Edited in this browser' : 'Created in this browser', 'pending') : badge('File version', 'neutral'),
        h('div', { class: 'debrief-actions' },
          h('button', { class: 'btn', onclick: () => { const nid = `p-new-${Date.now().toString(36)}`; draft = blankPatient(nid); id = nid; render(); } }, 'New patient'),
          h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import JSON'), fileInput,
          h('button', { class: 'btn', onclick: () => downloadJson(`${t.id}.json`, t) }, 'Export JSON'),
          isLocal ? h('button', { class: 'btn btn-ghost', onclick: async () => {
            if (!window.confirm(inFiles ? 'Discard this browser\'s edits and go back to the file version?' : 'Delete this browser-only patient?')) return;
            removeLocal('patient', id);
            if (!inFiles) editorTarget.set(null);
            await reloadData();
          } }, inFiles ? 'Revert to file' : 'Delete') : null,
        )),
      h('p', { class: 'muted' }, 'Edits save in this browser after validation. Export JSON and commit it to data/patients/ to publish. Anything you write is yours to review; mark it approved when it is.'),
      errBox,
      h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Demographics'),
        field('Name', inp('name')), field('Age', inp('age', 'number')), field('Sex', inp('sex')), field('Room', inp('room')),
        field('Triage tag', sel('tag', TAGS)), field('Priority label', inp('priorityLabel')), field('Admitting diagnosis', inp('admittingDx')),
        field('Code status', inp('codeStatus')), field('Review status', sel('review', ['proposed', 'partial', 'approved'])), field('Source', inp('source'))),
      h('section', { class: 'panel' }, h('h3', {}, 'H&P'),
        field('Allergies', area('allergies', 2), 'One per line: agent | reaction'), field('Allergy note', inp('allergyText'), 'e.g. "No known drug allergies"'),
        field('HPI', area('hpi', 5)), field('PMH', area('pmh', 3), 'One per line'), field('Home meds', area('homeMeds', 3), 'One per line: name | dose | frequency')),
      h('section', { class: 'panel' }, h('h3', {}, 'Handoff (SBAR)'), ['situation', 'background', 'assessment', 'recommendation'].map((k) => field(k[0].toUpperCase() + k.slice(1), area(k, 2)))),
      h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Baseline vitals'),
        ['bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain'].map((k) => field(k, inp(`v_${k}`)))),
      h('section', { class: 'panel' }, h('h3', {}, 'Findings'),
        field('Baseline findings', area('findings', 5), 'One per line; shown when the student assesses'),
        field('Vitals changes (JSON)', area('keyframes', 5), '[{ "atMin": 75, "eventId": "…", "values": { … } }]'),
        field('Finding changes (JSON)', area('findingChanges', 4), '[{ "eventId": "…", "findings": ["…"] }]')),
      h('section', { class: 'panel' }, h('h3', {}, 'Orders'),
        orderRows.length ? h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {}, ['Order', 'Type', 'Tier', 'Order set', 'Delegable'].map((c) => h('th', {}, c)))),
          h('tbody', {}, orderRows.map((r) => h('tr', {}, h('td', {}, r.text), h('td', {}, r.type), h('td', {}, r.tier), h('td', {}, r.set), h('td', {}, r.delegable))))) : h('p', { class: 'muted' }, 'No orders. Add them in the JSON export for now.'),
        h('p', { class: 'muted small' }, 'Other order fields (activation, PRN limits, parameters, interventions) are kept as they are; edit them in exported JSON.')),
      h('section', { class: 'panel' }, h('h3', {}, 'Debrief (instructor only)'),
        field('Should recognize', area('shouldRecognize', 4), 'One per line'), field('Instructor notes', area('instructorNotes', 3), 'One per line')),
      h('section', { class: 'panel' }, h('h3', {}, 'Advanced (JSON)'),
        field('Labs, events, outcome, code branch, review notes', area('advanced', 14))),
      h('div', { class: 'controls' }, h('button', { class: 'btn btn-primary', onclick: onSave }, 'Save'), errBox),
    );
  }

  root.append(body);
  render();
}
