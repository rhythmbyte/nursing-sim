// Debrief → Task time: each timed task (how long, finished / interrupted / ended early), busy vs idle time, and what
// went late on the student's patients while they were tied up. Display only; data from engine/task-review.js.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { toneChip } from '../shared/tone-chip.js';

const OUT = { finished: ['✓', 'green', 'Finished'], interrupted: ['✕', 'red', 'Interrupted'], 'ended early': ['⏭', 'yellow', 'Ended early'], 'in progress': ['⏳', 'neutral', 'In progress'], paused: ['⏸', 'yellow', 'Paused'] };

export function taskSection(d, { at, room }) {
  const t = d.tasks;
  if (!t || !t.rows.length) return null;
  return h('section', { class: 'panel' },
    h('h3', {}, 'Task time ', helpTip('debrief.tasks')),
    h('p', {}, h('strong', {}, `Busy ${t.busyMin} min · not on a task ${t.idleMin} min · ${t.rows.length} task${t.rows.length > 1 ? 's' : ''} · ${t.interrupted} interrupted`)),
    h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, ['Started', 'Patient', 'Task', 'Minutes', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, t.rows.map((r) => { const [s, tone, label] = OUT[r.outcome]; return h('tr', {}, h('td', {}, at(r.startedAt)), h('td', {}, room(r.patientId)), h('td', {}, r.label, r.paused ? h('span', { class: 'muted small' }, ' (paused during it)') : null), h('td', {}, String(r.minutes)), h('td', {}, toneChip({ symbol: s, tone, label }))); }))),
    t.waiting.length ? h('div', {}, h('h4', {}, 'Went late while busy'),
      h('ul', {}, t.waiting.map((w) => h('li', {}, `${at(w.lateAt)} ${room(w.patientId)}: ${w.label} went late while doing ${w.during}`)))) : h('p', { class: 'muted small' }, 'Nothing went late while this student was busy.'));
}
