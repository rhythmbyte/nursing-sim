// Review queue: every item drafted by AI (review: proposed/partial) in one list, per patient, with
// Approve (instructor's call) and Edit. Approvals save in this browser; export to publish.

import { instructorPatientLabel } from '../shared/labels.js';
import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { toast } from '../shared/toast.js';
import { reviewItems, approveAt } from '../../review.js';
import { saveLocal, saveLocalCatalog, removeLocalCatalog } from '../../data-loader.js';
import { downloadJson } from '../shared/download.js';

export function mountReviewQueue(root, { data, reloadData, openEditor }) {
  const body = h('div', {});
  let onlyPatient = '';

  function render() {
    const patients = [...data.patients].sort((a, b) => a.demographics.room.localeCompare(b.demographics.room, undefined, { numeric: true }));
    const catalogNames = Object.keys(data.catalogs).filter((k) => data.catalogs[k]);
    const total = patients.reduce((n, p) => n + reviewItems(p).length, 0)
      + catalogNames.reduce((n, k) => n + reviewItems(data.catalogs[k], 'Whole catalog').length, 0);
    const filter = h('select', { 'aria-label': 'Patient', onchange: (e) => { onlyPatient = e.target.value; render(); } },
      h('option', { value: '' }, 'Everything'), h('option', { value: '@catalogs', selected: onlyPatient === '@catalogs' }, 'Catalogs only'), patients.map((p) => h('option', { value: p.id, selected: p.id === onlyPatient }, instructorPatientLabel(p))));

    clear(body).append(
      h('header', { class: 'screen-header' }, h('h2', {}, 'Review queue'), badge(`${total} item${total === 1 ? '' : 's'} need review`, total ? 'review' : 'ok'), filter),
      h('div', { class: 'banner banner-review' },
        'Approvals and edits save in this browser only. To publish them, export the patient JSON and commit it to the repo (data/patients/). ',
        'Only the instructor approves clinical content.'),
      onlyPatient && onlyPatient !== '@catalogs' ? null : catalogsSection(catalogNames),
      ...patients.filter((p) => !onlyPatient || p.id === onlyPatient).map((p) => {
        const items = reviewItems(p);
        return h('section', { class: 'panel' },
          h('div', { class: 'panel-head' },
            h('h3', {}, instructorPatientLabel(p), ' ', data.local.patients.has(p.id) ? badge('Edited in this browser', 'pending') : null),
            h('div', { class: 'row-actions' },
              h('button', { class: 'btn btn-small', onclick: () => openEditor(p.id) }, 'Edit patient'),
              h('button', { class: 'btn btn-small', onclick: () => downloadJson(`${p.id}.json`, p) }, 'Export JSON'))),
          items.length ? h('table', { class: 'data-table' },
            h('tbody', {}, items.map((it) => h('tr', {},
              h('td', {}, badge(it.status === 'partial' ? 'Partial' : 'Proposed', 'review')),
              h('td', {}, it.label),
              h('td', { class: 'row-actions' }, h('button', {
                class: 'btn btn-small btn-primary',
                onclick: async () => {
                  const errors = saveLocal('patient', approveAt(p, it.path), data.schemas);
                  if (errors.length) { toast(`Not saved: ${errors[0]}`); return; }
                  toast('Approved');
                  await reloadData();
                },
              }, 'Approve')),
            )))) : h('p', { class: 'muted' }, 'Nothing left to review.'));
      }),
    );
  }

  // Catalogs (interventions, labs, staff, rules, vitals, scenario defaults): instructor decisions too.
  function catalogsSection(names) {
    return h('section', { class: 'panel' },
      h('h3', {}, 'Catalogs'),
      h('table', { class: 'data-table' }, h('tbody', {}, names.map((name) => {
        const cat = data.catalogs[name];
        const items = reviewItems(cat, 'Whole catalog');
        const edited = data.local.catalogs?.has(name);
        return h('tr', {},
          h('td', {}, h('code', {}, `${name}`), edited ? [' ', badge('Edited in this browser', 'pending')] : null),
          h('td', {}, items.length ? items.map((it) => h('div', {}, badge(it.status === 'partial' ? 'Partial' : 'Proposed', 'review'), ' ', it.label)) : badge('Approved', 'ok')),
          h('td', { class: 'row-actions' },
            items.map((it) => h('button', {
              class: 'btn btn-small btn-primary',
              onclick: async () => {
                const errors = saveLocalCatalog(name, approveAt(cat, it.path), data.schemas);
                if (errors.length) { toast(`Not saved: ${errors[0]}`); return; }
                toast(`Approved ${name}`);
                await reloadData();
              },
            }, 'Approve')),
            h('button', { class: 'btn btn-small', onclick: () => downloadJson(`${name === 'scenarioDefaults' ? 'scenario-defaults' : name}.json`, cat) }, 'Export JSON'),
            edited ? h('button', { class: 'btn btn-small btn-ghost', onclick: async () => { removeLocalCatalog(name); await reloadData(); } }, 'Revert to file') : null,
          ),
        );
      }))),
      h('p', { class: 'muted small' }, 'Approve a catalog after reviewing its file (data/catalogs/). To change values, edit the exported JSON and commit it.'),
    );
  }

  root.append(body);
  render();
}
