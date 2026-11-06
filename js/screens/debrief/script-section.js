// Debrief → Patient states: per scripted patient, which state, when, and what caused each change
// (student action, nothing done in time, vitals threshold, event, another reaction, instructor).
// "Nothing done in time" rows are highlighted (symbol + word + color). Display only; data from buildDebrief.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';

export function scriptStatesSection(d, { at, room }) {
  if (!d.scripts?.length) return null;
  return h('section', { class: 'panel' },
    h('h3', {}, 'Patient states ', helpTip('debrief.states')),
    ...d.scripts.map((p) => {
      const neglect = p.rows.filter((r) => r.nothingDone).length;
      return h('div', { class: 'debrief-states' },
        h('h4', {}, room(p.patientId), neglect ? h('span', { class: 'tone-chip tone-red' }, `⚠ ${neglect} change${neglect > 1 ? 's' : ''} because nothing was done`) : null),
        h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {}, ['Time', 'State', 'Why', 'Teaching note'].map((c) => h('th', {}, c)))),
          h('tbody', {}, p.rows.map((r) => h('tr', { class: r.nothingDone ? 'tl-red' : r.cause?.kind === 'instructor' ? 'tl-amber' : '' },
            h('td', {}, at(r.atMin)),
            h('td', {}, r.from ? `${r.fromLabel} → ` : '', h('strong', {}, r.label)),
            h('td', {}, r.nothingDone ? h('span', { class: 'tone-chip tone-red' }, '⚠ Nothing done') : null, ' ', r.causeText, r.by && r.cause?.kind === 'instructor' ? ` (${r.by})` : ''),
            h('td', {}, r.note || ''))))),
        p.penalties?.length ? h('div', {}, h('h5', {}, 'Recovery penalties'),
          h('table', { class: 'data-table' }, h('tbody', {}, p.penalties.map((x) => h('tr', { class: x.kind === 'earned' ? 'tl-amber' : '' },
            h('td', {}, at(x.atMin)), h('td', {}, x.kind === 'earned' ? h('span', { class: 'tone-chip tone-yellow' }, '▼ Penalty') : x.kind === 'limited' ? h('span', { class: 'tone-chip tone-neutral' }, '↧ Limited') : ''),
            h('td', {}, x.text, x.why ? h('div', { class: 'muted small' }, `Why: ${x.why}`) : null)))))) : null,
      );
    }));
}
