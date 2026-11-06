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

const SELECTED_KEY = 'ui.library.selected';

function firstEventLine(p, startClock) {
  const e = firstScheduled(p.events);
  if (!e) return h('div', { class: 'card-next muted' }, 'No scheduled events');
  return h('div', { class: 'card-next' }, `First event ${formatShiftTime(startClock, e.atMin)} · ${e.type.replaceAll('-', ' ')}`);
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
    h('div', { class: 'card-name' }, p.demographics.name),
    h('div', { class: 'muted' }, `${p.demographics.age}${p.demographics.sex} · ${p.admittingDx}`),
    firstEventLine(p, startClock),
    h('div', { class: 'card-badges' },
      pending ? badge(`Needs review (${pending})`, 'review', `${pending} item(s) drafted by AI await instructor approval`) : badge('Approved', 'ok'),
    ),
  );
}

export function mountLibrary(root, { data: { patients, catalogs, problems }, scenario }) {
  const sorted = [...patients].sort((a, b) => a.demographics.room.localeCompare(b.demographics.room, undefined, { numeric: true }));
  const startClock = scenario?.startClock || '07:00';
  let selectedId = load(SELECTED_KEY);
  if (!sorted.some((p) => p.id === selectedId)) selectedId = sorted[0]?.id ?? null;

  const list = h('div', { class: 'library-list', role: 'list' });
  const detail = h('div', { class: 'library-detail' });

  function render() {
    clear(list).append(...sorted.map((p) => patientCard(p, p.id === selectedId, select, startClock)));
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
    h('div', { class: 'library' }, list, detail),
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
