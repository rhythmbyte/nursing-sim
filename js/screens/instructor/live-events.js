// Event timeline with "Fire now". Lists every event in the session: scheduled ones by time,
// then trigger-only ones (fired only from here).

import { h } from '../shared/dom.js';
import { reviewBadge } from '../shared/badge.js';
import { formatShiftTime } from '../../engine/time.js';
import { nextAt } from '../../engine/scheduler.js';
import { getEventType } from '../../engine/registry.js';

export function eventsPanel(runner, templatesById, user) {
  const { state, refs } = { state: runner.state, refs: runner.refs };
  const rows = refs.map((ref) => ({ ref, next: nextAt(ref, state.fired), count: state.fired[ref.key] || 0 }))
    .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity) || (a.ref.event.atMin ?? Infinity) - (b.ref.event.atMin ?? Infinity));

  return h('table', { class: 'data-table events-table' },
    h('thead', {}, h('tr', {}, ['When', 'Patient', 'Event', 'Status', ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map(({ ref, next, count }) => {
      const t = ref.patientId ? templatesById[ref.patientId] : null;
      const type = getEventType(ref.event.type);
      const when = typeof ref.event.atMin === 'number'
        ? formatShiftTime(state.startClock, next ?? ref.event.atMin)
        : `On trigger (${ref.event.trigger})`;
      const status = count === 0 ? 'Pending' : next == null ? `Fired${count > 1 ? ` ×${count}` : ''}` : `Fired ×${count}, repeats`;
      return h('tr', { class: count && next == null ? 'is-done' : '' },
        h('td', {}, when),
        h('td', {}, t ? `Rm ${t.demographics.room} ${t.demographics.name}` : 'Unit'),
        h('td', {},
          h('code', {}, ref.event.type), ' ',
          ref.event.payload?.message || (type ? type.describe(ref.event) : ref.event.id), ' ',
          reviewBadge(ref.event)),
        h('td', {}, status),
        h('td', {}, h('button', {
          class: 'btn btn-small',
          disabled: state.clock.status === 'ended',
          title: 'Fire this event now',
          onclick: () => runner.fireNow(ref.key, user),
        }, 'Fire now')),
      );
    })),
  );
}
