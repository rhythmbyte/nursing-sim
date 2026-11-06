// Debrief → Delegation: each task the student delegated (to whom, wait for a free helper, queued, when it was done)
// and helper utilization per group. Display only; data from engine/staff-review.js.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';

export function delegationSection(d, { at, room, groupName }) {
  const x = d.delegation;
  if (!x || (!x.rows.length && !x.groups.length)) return null;
  return h('section', { class: 'panel' }, h('h3', {}, 'Delegation ', helpTip('debrief.delegation')),
    h('p', {}, h('strong', {}, `${x.rows.length} delegated · ${x.queued} queued for a helper`), ' · utilization ', x.groups.map((g) => `${groupName(g.groupId)} ${g.percent}% (${g.helpers} helpers)`).join(', ')),
    x.rows.length ? h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, ['Asked', 'Patient', 'Task', 'To', 'Waited', 'Done'].map((c) => h('th', {}, c)))),
      h('tbody', {}, x.rows.map((r) => h('tr', { class: r.waitMin > 10 ? 'tl-amber' : '' },
        h('td', {}, at(r.requestedAt)), h('td', {}, room(r.patientId)), h('td', {}, r.label), h('td', {}, r.helper || `${r.to} (waiting)`),
        h('td', {}, `${r.waitMin} min${r.queued ? ' (queued)' : ''}`), h('td', {}, r.doneAt != null ? at(r.doneAt) : r.status)))))
      : h('p', { class: 'muted' }, 'Nothing delegated.'));
}
