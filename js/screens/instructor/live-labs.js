// Pending labs with "Release now". Labs with no scripted value (or unscripted repeat draws)
// ask the instructor for a value first.

import { h } from '../shared/dom.js';
import { promptText } from '../shared/modal.js';
import { formatShiftTime } from '../../engine/time.js';

export function labsPanel(runner, templatesById, user) {
  const state = runner.state;
  const at = (m) => formatShiftTime(state.startClock, m);
  const rows = Object.entries(state.patients).flatMap(([pid, ps]) => (ps.present ? ps.labs : [])
    .filter((l) => l.status === 'pending').map((l) => ({ pid, l })));
  if (!rows.length) return h('p', { class: 'muted' }, 'No pending labs.');

  async function release(pid, l) {
    let value = null;
    if (l.value == null) {
      value = await promptText(`Release ${l.label || l.code}`, 'Result value (no scripted value)', { okLabel: 'Release' });
      if (value == null) return;
    }
    runner.releaseLab(pid, l.uid, value, user);
  }

  return h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Patient', 'Lab', 'Status', 'Scripted value', ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map(({ pid, l }) => h('tr', { class: l.awaitingValue ? 'needs-attention' : '' },
      h('td', {}, `Rm ${templatesById[pid].demographics.room} ${templatesById[pid].demographics.name}`),
      h('td', {}, l.label || l.code),
      h('td', {}, l.awaitingValue ? 'Ready: needs a value'
        : l.drawnAtMin == null ? 'Not drawn' : `Drawn ${at(l.drawnAtMin)} · due ${at(l.resultAtMin)}`),
      h('td', {}, l.value ?? '—'),
      h('td', {}, h('button', { class: 'btn btn-small', onclick: () => release(pid, l) }, 'Release now')),
    ))),
  );
}
