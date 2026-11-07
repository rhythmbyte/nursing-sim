// Setup wizard → groups: the group list shared by the "Groups and students", "Patients" and "Sim options" steps
// (each step renders its own part of every group). Pure UI state; Create builds the scenario (setup-wizard.js).

import { codeName } from '../../engine/cases.js';
import { helpField, helpTip } from '../shared/help.js';
import { h, clear } from '../shared/dom.js';
import { triageChip } from '../shared/triage-chip.js';
import { countByTriage, filterText, mergeFilters } from '../../engine/patient-tags.js';
import { tagChips } from './patient-tags-ui.js';

export const TAGS = ['red', 'yellow', 'green', 'black'];
const field = (label, el, hint) => helpField('setup', label, el, hint);

export function createGroups(data, { pool, onChange = () => {} }) {
  const groups = [];
  const lib = [...data.patients].sort((a, b) => (a.case?.code || a.demographics.room).localeCompare(b.case?.code || b.demographics.room, undefined, { numeric: true }));
  const staffRoles = (data.catalogs.staff?.staff || []).filter((s) => s.speedFactor != null && s.offered !== false).map((s) => s.role); // the program's helper roles
  const boxes = { students: h('div', {}), patients: h('div', {}), staff: h('div', { class: 'editor-grid' }) };
  let simFilter = {};
  let manual = () => false;
  const countLine = (filter, need = null) => {
    const c = countByTriage(data.patients, filter);
    return TAGS.map((t) => `${t} ${c[t]}${need ? `/${need[t] || 0}` : ''}${need && (need[t] || 0) > c[t] ? ' ⚠' : ''}`).join(' · ');
  };
  const simCount = h('p', { class: 'tag-count', 'aria-live': 'polite' });
  const simWarn = h('p', { class: 'form-error', role: 'status' });
  const refreshCounts = () => {
    simCount.textContent = `Matching patients (${filterText(simFilter, data.catalogs.patientTags)}): ${countLine(simFilter)}`;
    const need = {};
    for (const g of groups.filter((x) => x.mode === 'tags')) for (const t of TAGS) need[t] = (need[t] || 0) + (g.tagCounts[t] || 0);
    const c = countByTriage(data.patients, simFilter);
    const short = TAGS.filter((t) => (need[t] || 0) > c[t]);
    simWarn.textContent = short.length ? `⚠ Not enough matching patients: ${short.map((t) => `${t} needs ${need[t]}, ${c[t]} match`).join('; ')}. Loosen the patient tags or lower the counts.` : '';
    for (const g of groups) g.refreshCount?.();
  };
  const simChips = data.catalogs.patientTags ? tagChips(data.catalogs.patientTags, {}, { data, label: 'Randomizer patient tags', onChange: (v) => { simFilter = v; refreshCounts(); } }) : null;

  const blank = (n) => ({ id: `g${n}`, name: `Group ${n}`, studentCount: 1, staff: { ...pool }, mode: 'pick', patients: new Set(), admissions: new Set(), tagCounts: { red: 1, yellow: 1, green: 1, black: 0 }, names: '' });
  function add() { groups.push(blank(groups.length + 1)); render(); refreshCounts(); onChange(); }

  function render() {
    clear(boxes.students).append(...groups.map((g, gi) => h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', {}, g.name), groups.length > 1 ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { groups.splice(gi, 1); render(); onChange(); } }, 'Remove group') : null),
      h('div', { class: 'editor-grid' },
        field('Group name', h('input', { class: 'input', value: g.name, oninput: (e) => { g.name = e.target.value; onChange(); } })),
        field('Students', h('input', { class: 'input', type: 'number', min: 1, value: g.studentCount, oninput: (e) => { g.studentCount = Number(e.target.value); onChange(); } }))),
      manual() ? field('Student names (one per line)', (() => { const a = h('textarea', { class: 'input', rows: 3, oninput: (e) => { g.names = e.target.value; onChange(); } }); a.value = g.names; return a; })()) : null)));
    clear(boxes.patients).append(...groups.map((g) => h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', {}, g.name),
        field('Patients', h('select', { onchange: (e) => { g.mode = e.target.value; render(); refreshCounts(); onChange(); } },
          h('option', { value: 'pick', selected: g.mode === 'pick' }, 'Pick cases'), h('option', { value: 'tags', selected: g.mode === 'tags' }, 'Random by patient tags and triage counts')))),
      g.mode === 'pick'
        ? h('div', { class: 'pick-list' }, lib.map((p) => h('div', { class: 'pick-row' },
          h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: g.patients.has(p.id), onchange: (e) => { if (e.target.checked) g.patients.add(p.id); else g.patients.delete(p.id); onChange(); } }),
            ` ${codeName(p)} `, p.case ? h('span', { class: 'muted small' }, `${p.case.title} · `) : null, h('span', { class: 'muted small' }, p.admittingDx), ' ', triageChip(p.tag)),
          h('label', { class: 'inline muted small' }, h('input', { type: 'checkbox', checked: g.admissions.has(p.id), onchange: (e) => { if (e.target.checked) g.admissions.add(p.id); else g.admissions.delete(p.id); onChange(); } }), ' arrives later (admission)'))))
        : h('div', {}, h('div', { class: 'editor-grid' }, TAGS.map((t) => field(`${t} patients`, h('input', { class: 'input', type: 'number', min: 0, value: g.tagCounts[t], oninput: (e) => { g.tagCounts[t] = Number(e.target.value); refreshCounts(); onChange(); } })))),
          data.catalogs.patientTags ? h('details', { open: Object.keys(g.tagFilter || {}).length > 0 }, h('summary', {}, 'This group\'s own patient tags (optional) ', helpTip('setup.group-patient-tags')),
            tagChips(data.catalogs.patientTags, g.tagFilter || {}, { label: `${g.name} patient tags`, onChange: (v) => { g.tagFilter = v; refreshCounts(); onChange(); } }).el) : null,
          (() => { const line = h('p', { class: 'tag-count muted' }); g.refreshCount = () => { line.textContent = `Matching for ${g.name} (${filterText(mergeFilters(simFilter, g.tagFilter), data.catalogs.patientTags)}): ${countLine(mergeFilters(simFilter, g.tagFilter), g.tagCounts)}`; }; g.refreshCount(); return line; })()))));
    clear(boxes.staff).append(...groups.flatMap((g) => staffRoles.map((r) => field(`${r} helpers`, h('input', { class: 'input', type: 'number', min: 0, max: 9, value: g.staff[r] ?? 0, 'aria-label': `${g.name} ${r} helpers`, oninput: (e) => { g.staff[r] = Number(e.target.value) || 0; onChange(); } }), g.name))));
  }

  return {
    groups, boxes, add, render, refreshCounts,
    simFilter: () => simFilter,
    randomizer: simChips ? h('div', {}, h('h4', {}, 'Patient tags for the randomizer ', helpTip('setup.patient-tags')), h('p', { class: 'muted small' }, 'Used by groups set to "Random by patient tags". Not the triage tag.'), simChips.el, simCount, simWarn) : null,
    setManual: (fn) => { manual = fn; },
    /** Replace the groups (a saved scenario as the starting point, or a restored draft). */
    load(list) {
      groups.length = 0;
      list.forEach((g) => groups.push({ ...blank(groups.length + 1), ...g, patients: new Set(g.patients || []), admissions: new Set(g.admissions || []), staff: { ...pool, ...(g.staff || {}) } }));
      if (!groups.length) groups.push(blank(1));
      render(); refreshCounts();
    },
    plain: () => groups.map(({ refreshCount, patients, admissions, ...g }) => ({ ...g, patients: [...patients], admissions: [...admissions] })),
  };
}
