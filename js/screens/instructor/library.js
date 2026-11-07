// Instructor → Patient library (read-only overview; edit in the Patient editor).
// Left: patient cards. Right: the selected patient's full template.

import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { triageChip } from '../shared/triage-chip.js';
import { countNeedsReview } from '../../review.js';
import { load, save } from '../../storage.js';
import { patientDetail } from './library-detail.js';
import { firstScheduled } from '../../engine/scheduler.js';
import { formatShiftTime } from '../../engine/time.js';
import { matchesTags, filterText } from '../../engine/patient-tags.js';
import { tagChips } from './patient-tags-ui.js';
import { helpTip } from '../shared/help.js';

const SELECTED_KEY = 'ui.library.selected';

function firstEventLine(p, startClock) {
  const e = firstScheduled(p.events);
  if (!e) return h('div', { class: 'card-next muted' }, 'No scheduled events');
  return h('div', { class: 'card-next' }, `First event ${formatShiftTime(startClock, e.atMin)} · ${e.type.replaceAll('-', ' ')}`);
}

/** Library category: the patient's first topic tag (cases are grouped by it, e.g. "Cardiac"), else "Other". */
function categoryOf(p, catalogs) {
  const id = p.patientTags?.topic?.[0];
  return (id && catalogs.patientTags?.groups.find((g) => g.id === 'topic')?.tags.find((t) => t.id === id)?.label) || id || 'Other';
}

function patientCard(p, selected, onSelect, startClock) {
  const pending = countNeedsReview(p);
  return h('button', {
    class: `patient-card${selected ? ' selected' : ''}`,
    'aria-pressed': selected ? 'true' : 'false',
    onclick: () => onSelect(p.id),
  },
    h('div', { class: 'card-top' },
      h('span', { class: 'room' }, `Rm ${p.demographics.room}`),
      triageChip(p.tag),
    ),
    p.case ? h('div', { class: 'card-name' }, p.case.title, ' ', badge('Case', 'neutral', 'Case template: each sim makes its own patient (name, values, drugs) from it')) : h('div', { class: 'card-name' }, p.demographics.name),
    h('div', { class: 'muted' }, p.case ? `As written: ${p.demographics.name}, ${p.demographics.age}${p.demographics.sex} · ages ${p.case.ageRange?.join('–') ?? p.demographics.age}` : `${p.demographics.age}${p.demographics.sex} · ${p.admittingDx}`),
    p.case ? h('div', { class: 'muted small' }, p.admittingDx) : null,
    firstEventLine(p, startClock),
    h('div', { class: 'card-badges' },
      pending ? badge(`Needs review (${pending})`, 'review', `${pending} item(s) drafted by AI await instructor approval`) : badge('Approved', 'ok'),
    ),
  );
}

/** Assessment tools catalog with license status: anything not clearly public shows "License check needed". */
function toolsPanel(catalogs) {
  const tools = catalogs.assessmentTools?.tools || [];
  if (!tools.length) return null;
  return h('details', { class: 'panel' }, h('summary', {}, h('strong', {}, `Assessment tools (${tools.length})`), ` · ${tools.filter((t) => t.license?.status !== 'public').length} need a license check`),
    h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, ['Tool', 'Category', 'Reassess', 'License', 'Source'].map((c) => h('th', {}, c)))),
      h('tbody', {}, tools.map((t) => h('tr', {}, h('td', {}, t.name, ' ', t.review !== 'approved' ? badge('Needs review', 'review') : null), h('td', {}, t.category), h('td', {}, `${t.reassessMin} min`),
        h('td', {}, t.license?.status === 'public' ? badge('Public', 'neutral') : badge('License check needed', 'review')), h('td', { class: 'small muted' }, t.license?.note || ''))))));
}

export function mountLibrary(root, { data: { patients, catalogs, problems }, scenario }) {
  const sorted = [...patients].sort((a, b) => a.demographics.room.localeCompare(b.demographics.room, undefined, { numeric: true }));
  const startClock = scenario?.startClock || '07:00';
  let selectedId = load(SELECTED_KEY);
  if (!sorted.some((p) => p.id === selectedId)) selectedId = sorted[0]?.id ?? null;

  const list = h('div', { class: 'library-list', role: 'list' });
  const detail = h('div', { class: 'library-detail' });

  // Filter by patient tags (any within a group, all across groups) and search name / room / diagnosis / tag labels.
  let tagFilter = load('ui.library.tagFilter', {}) || {};
  const search = h('input', { class: 'input', type: 'search', 'aria-label': 'Search patients', placeholder: 'Search name, room, diagnosis or tag', oninput: () => render() });
  const tagLabels = (p) => Object.entries(p.patientTags || {}).flatMap(([g, ids]) => ids.map((id) => catalogs.patientTags?.groups.find((x) => x.id === g)?.tags.find((x) => x.id === id)?.label || id));
  const count = h('span', { class: 'muted small' });
  const chips = catalogs.patientTags ? tagChips(catalogs.patientTags, tagFilter, { label: 'Filter by patient tags', onChange: (v) => { tagFilter = v; save('ui.library.tagFilter', v); render(); } }) : null;
  const shown = () => {
    const q = search.value.trim().toLowerCase();
    return sorted.filter((p) => matchesTags(p, tagFilter) && (!q || [p.demographics.name, p.demographics.room, p.admittingDx, ...tagLabels(p)].join(' ').toLowerCase().includes(q)));
  };
  function render() {
    const vis = shown();
    count.textContent = `${vis.length} of ${sorted.length} match ${filterText(tagFilter, catalogs.patientTags)}`;
    const groups = new Map();
    for (const p of vis) { const c = categoryOf(p, catalogs); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(p); }
    const byTitle = (a, b) => (a.case?.title || a.demographics.name).localeCompare(b.case?.title || b.demographics.name, undefined, { numeric: true });
    clear(list).append(...(vis.length ? [...groups.entries()].sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b)).flatMap(([c, ps]) => [
      h('h4', { class: 'library-group' }, c), ...ps.sort(byTitle).map((p) => patientCard(p, p.id === selectedId, select, startClock))]) : [h('p', { class: 'muted' }, 'No patients match these patient tags.')]));
    const p = sorted.find((x) => x.id === selectedId);
    clear(detail).append(p ? patientDetail(p, { catalogs, startClock }) : h('p', { class: 'muted' }, 'No patients loaded.'));
  }

  function select(id) {
    selectedId = id;
    save(SELECTED_KEY, id);
    render();
  }

  const parts = [
    h('header', { class: 'screen-header' },
      h('h2', {}, 'Patient library'),
      h('span', { class: 'muted' }, `${sorted.length} patient template${sorted.length === 1 ? '' : 's'} · read-only`),
    ),
    problems.length ? problemsBanner(problems) : null,
    h('details', { class: 'panel', open: Object.keys(tagFilter).length > 0 }, h('summary', {}, h('strong', {}, 'Find patients '), helpTip('library.patient-tags'), ' ', count), search, chips?.el),
    h('div', { class: 'library' }, list, detail),
    toolsPanel(catalogs),
  ];
  clear(root).append(...parts.filter(Boolean));
  render();
}

function problemsBanner(problems) {
  return h('div', { class: 'banner banner-error', role: 'alert' },
    h('strong', {}, `${problems.length} data file(s) failed validation and were skipped:`),
    h('ul', {}, problems.map((pr) => h('li', {},
      h('code', {}, pr.file),
      h('ul', {}, pr.errors.slice(0, 5).map((e) => h('li', {}, e))),
    ))),
  );
}
