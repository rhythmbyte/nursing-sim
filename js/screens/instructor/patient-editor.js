// Patient editor (no JSON in the normal workflow): sectioned form, editable orders and labs tables,
// scenario changes (timeline + builder), outcome and code branch. Works on a copy (`work`); Save validates
// and stores it in this browser. "Advanced: edit JSON" stays available but hidden.

import { helpField } from '../shared/help.js';
import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { toast } from '../shared/toast.js';
import { downloadJson } from '../shared/download.js';
import { saveLocal, removeLocal, validateItem } from '../../data-loader.js';
import { toForm, fromForm, blankPatient } from './editor-model.js';
import { ordersTable, labsTable } from './editor-tables.js';
import { listChanges, minToClock, retimeChange, duplicateChange, deleteChange } from './change-model.js';
import { openChangeBuilder } from './change-builder.js';
import { patientTimeline } from './patient-timeline.js';

const TAGS = ['red', 'yellow', 'green', 'black'];
const field = (label, el, hint) => helpField('editor', label, el, hint); // help text: data/catalogs/help.json

export function mountPatientEditor(root, { data, reloadData, editorTarget, scenario, catalogs }) {
  const startClock = scenario.startClock;
  const body = h('div', {});
  let id = editorTarget.get() || data.patients[0]?.id;
  let work = null;      // working copy of the patient being edited
  let isNew = false;    // not saved yet (new or duplicate)
  let dirty = false;
  let collect = () => work;

  function load(pid) {
    const t = data.patients.find((p) => p.id === pid) || data.patients[0];
    id = t?.id; work = t ? structuredClone(t) : null; isNew = false; dirty = false;
  }
  /** Pull form + tables into `work` (before any re-render, so nothing typed is lost). */
  function sync() { work = collect(); }
  function update(next) { work = next; dirty = true; render(); }

  function render() {
    if (!work) { clear(body).append(h('p', { class: 'muted' }, 'No patients.')); return; }
    const f = toForm(work);
    const inputs = {};
    const inp = (k, type = 'text') => (inputs[k] = h('input', { class: 'input', type, value: f[k] ?? '' }));
    const area = (k, rows = 3) => { const el = h('textarea', { class: 'input', rows }); el.value = f[k] ?? ''; inputs[k] = el; return el; };
    const sel = (k, opts) => (inputs[k] = h('select', {}, opts.map((o) => h('option', { value: o, selected: String(f[k]) === String(o) }, o))));
    const chk = (k) => (inputs[k] = h('input', { type: 'checkbox', checked: Boolean(f[k]) }));
    const orders = ordersTable(work.orders, catalogs);
    const labs = labsTable(work.labs, catalogs, work.orders);
    const jsonBox = h('textarea', { class: 'input', rows: 16, 'aria-label': 'Patient JSON (advanced)' });
    jsonBox.value = JSON.stringify(work, null, 2);
    const errBox = h('div', {});
    collect = () => {
      const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
      return fromForm(values, work, { orders: orders.collect(work.id), labs: labs.collect() });
    };
    const showErrors = (errors) => clear(errBox).append(h('div', { class: 'banner banner-error', role: 'alert' }, h('strong', {}, 'Not saved:'), h('ul', {}, errors.slice(0, 10).map((e) => h('li', {}, e)))));

    const openChange = (key) => { sync(); openChangeBuilder({ template: work, key, startClock, catalogs, onSave: update }); };
    const changes = listChanges(work);
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => importFile(e.target.files[0]) });

    async function onSave() {
      sync();
      const errors = saveLocal('patient', work, data.schemas);
      if (errors.length) { showErrors(errors); return; }
      editorTarget.set(work.id);
      toast('Saved in this browser');
      await reloadData();
    }
    async function importFile(file) {
      if (!file) return;
      let obj;
      try { obj = JSON.parse(await file.text()); } catch (e) { showErrors([`Not valid JSON: ${e.message}`]); return; }
      const errors = validateItem('patient', obj, data.schemas);
      if (errors.length) { showErrors(errors); return; }
      saveLocal('patient', obj, data.schemas);
      editorTarget.set(obj.id);
      await reloadData();
    }
    function newPatient(copyOf) {
      sync();
      const stamp = Date.now().toString(36);
      work = copyOf
        ? { ...structuredClone(copyOf), id: `${copyOf.id}-copy-${stamp}`, source: `Copy of ${copyOf.demographics.name}`, demographics: { ...copyOf.demographics, name: `${copyOf.demographics.name} (copy)` } }
        : blankPatient(`p-new-${stamp}`);
      id = work.id; isNew = true; dirty = true; render();
    }

    const isLocal = data.local.patients.has(id);
    const inFiles = data.fileIds.patients.has(id);
    const picker = h('select', { 'aria-label': 'Patient', onchange: (e) => {
      if (dirty && !window.confirm('Discard unsaved changes?')) { e.target.value = id; return; }
      load(e.target.value); editorTarget.set(id); render();
    } }, [...data.patients, ...(isNew ? [work] : [])].map((p) => h('option', { value: p.id, selected: p.id === id }, `${p.demographics.room || '—'} ${p.demographics.name || p.id}`)));

    clear(body).append(
      h('header', { class: 'screen-header' }, h('h2', {}, 'Patient editor'), picker,
        isNew ? badge('New, not saved', 'review') : isLocal ? badge(inFiles ? 'Edited in this browser' : 'Created in this browser', 'pending') : badge('File version', 'neutral'),
        dirty && !isNew ? badge('Unsaved changes', 'review') : null,
        h('div', { class: 'debrief-actions' },
          h('button', { class: 'btn', onclick: () => newPatient(null) }, 'New patient'),
          h('button', { class: 'btn', onclick: () => newPatient(collect()) }, 'Duplicate patient'),
          h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import JSON'), fileInput,
          h('button', { class: 'btn', onclick: () => { sync(); downloadJson(`${work.id}.json`, work); } }, 'Export JSON'),
          isLocal ? h('button', { class: 'btn btn-ghost', onclick: async () => {
            if (!window.confirm(inFiles ? 'Discard this browser\'s edits and go back to the file version?' : 'Delete this browser-only patient?')) return;
            removeLocal('patient', id);
            if (!inFiles) editorTarget.set(null);
            await reloadData();
          } }, inFiles ? 'Revert to file' : 'Delete') : null)),
      h('p', { class: 'muted' }, 'Edits save in this browser after a check. Export JSON and commit it to data/patients/ to publish. Mark items approved when you have reviewed them.'),
      errBox,
      h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Demographics'),
        field('Name', inp('name')), field('Age', inp('age', 'number')), field('Sex', inp('sex')), field('Room', inp('room')),
        field('Triage tag (yours)', sel('tag', TAGS)), field('Priority label', inp('priorityLabel')), field('Admitting diagnosis', inp('admittingDx')),
        field('Code status', inp('codeStatus')), field('Review status', sel('review', ['proposed', 'partial', 'approved'])), field('Source', inp('source'))),
      h('section', { class: 'panel' }, h('h3', {}, 'H&P'),
        field('Allergies', area('allergies', 2), 'One per line: agent | reaction'), field('Allergy note', inp('allergyText'), 'e.g. "No known drug allergies"'),
        field('HPI', area('hpi', 5)), field('PMH', area('pmh', 3), 'One per line'), field('Home meds', area('homeMeds', 3), 'One per line: name | dose | frequency')),
      h('section', { class: 'panel' }, h('h3', {}, 'Handoff (SBAR)'), ['situation', 'background', 'assessment', 'recommendation'].map((k) => field(k[0].toUpperCase() + k.slice(1), area(k, 2)))),
      h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Baseline vitals'), ['bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain'].map((k) => field(k, inp(`v_${k}`)))),
      h('section', { class: 'panel' }, h('h3', {}, 'Baseline findings'), field('Shown when the student assesses (one per line)', area('findings', 5))),
      h('section', { class: 'panel' }, h('h3', {}, 'Orders at shift start'), orders.el),
      h('section', { class: 'panel' }, h('h3', {}, 'Labs'), labs.el),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h3', {}, 'Scenario changes'), h('button', { class: 'btn btn-small btn-primary', onclick: () => openChange(null) }, 'Add scenario change')),
        patientTimeline(work, startClock, { onOpen: openChange, onRetime: (key, m) => { sync(); update(retimeChange(work, key, m)); } }),
        changes.length ? h('ul', { class: 'feed change-list' }, changes.map((c) => h('li', {},
          h('span', { class: 'feed-time' }, c.manual ? 'trigger' : minToClock(startClock, c.atMin)),
          h('span', {}, c.label.slice(0, 90)), h('span', { class: 'muted small' }, ` · ${c.events.length} event${c.events.length > 1 ? 's' : ''}`),
          h('button', { class: 'btn btn-small', onclick: () => openChange(c.key) }, 'Edit'),
          h('button', { class: 'btn btn-small', onclick: () => { sync(); update(duplicateChange(work, c.key, startClock).template); } }, 'Duplicate'),
          h('button', { class: 'btn btn-small btn-ghost', onclick: () => { if (window.confirm('Delete this scenario change?')) { sync(); update(deleteChange(work, c.key, startClock)); } } }, 'Delete'))))
          : h('p', { class: 'muted' }, 'No scenario changes yet.')),
      h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Outcome and code branch'),
        field('Outcome', sel('outcomeMode', ['survive', 'die', 'instructor'])), field('Outcome notes', inp('outcomeNotes')),
        h('label', { class: 'inline' }, chk('cbOn'), ' Has a code branch'), h('label', { class: 'inline' }, chk('cbEnabled'), ' Code branch enabled'),
        field('Code branch description', inp('cbDescription')), field('Codes if NOT charted (intervention ids, comma separated)', inp('cbIfNotCharted')),
        field('…by sim minute', inp('cbByMin', 'number')), field('Rhythm', inp('cbRhythm')), field('Code message', inp('cbMessage'))),
      h('section', { class: 'panel' }, h('h3', {}, 'Debrief (instructor only)'),
        field('Should recognize', area('shouldRecognize', 4), 'One per line (per-change notes live in each scenario change)'), field('Instructor notes', area('instructorNotes', 3)),
        field('Notes for review', area('reviewNotes', 3), 'Things to confirm, one per line')),
      h('details', { class: 'panel advanced' }, h('summary', {}, 'Advanced: edit JSON'),
        h('p', { class: 'muted small' }, 'For fields without a form (PRN limits, parameters). Applying replaces the working copy; Save still checks it.'),
        jsonBox, h('button', { class: 'btn btn-small', onclick: () => {
          try { update(JSON.parse(jsonBox.value)); } catch (e) { showErrors([`Not valid JSON: ${e.message}`]); }
        } }, 'Apply JSON')),
      h('div', { class: 'controls' }, h('button', { class: 'btn btn-primary', onclick: onSave }, 'Save')),
    );
  }

  load(id);
  root.append(body);
  render();
}
