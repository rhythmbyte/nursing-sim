// Student: the group's delegation helpers (engine/staff.js): who is free, who is busy with what and for how long,
// who is on break, and tasks waiting for a helper. Read-only. Returns an element (re-render with the screen).

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';

export function staffPanel(runner, groupId, roomOf) {
  const v = runner.staffView(groupId);
  if (!v.helpers.length && !v.queued.length) return null;
  const left = (m) => (m >= 1 ? `${Math.ceil(m)} min left` : `${Math.ceil(m * 60)} s left`);
  return h('section', { class: 'panel staff-panel' }, h('h3', {}, 'Staff ', helpTip('chart.staff')),
    h('ul', { class: 'feed' }, v.helpers.map((x) => h('li', { class: `staff-${x.status}` },
      h('strong', {}, x.label), ' · ',
      x.status === 'free' ? '✓ free' : x.status === 'break' ? '☕ on break' : `⏳ ${x.taskLabel} · ${roomOf(x.patientId)} · ${left(x.leftMin)}`))),
    v.queued.length ? h('div', {}, h('h4', {}, 'Waiting for a helper'), h('ul', { class: 'feed' }, v.queued.map((q) => h('li', {}, `${q.to}: ${q.taskLabel} · ${roomOf(q.patientId)}`)))) : null);
}
