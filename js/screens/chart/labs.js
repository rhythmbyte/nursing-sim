// Labs: resulted values and pending labs. Pending values are never shown.
// Phase 4 adds ordering from orders and result delays.

import { h, clear } from '../shared/dom.js';
import { at } from './util.js';

export default {
  id: 'labs',
  label: 'Labs',
  mount(root, { pid, view, catalogs }) {
    const byCode = Object.fromEntries((catalogs.labs?.labs || []).map((l) => [l.code, l]));
    const body = h('div', {});
    root.append(h('section', { class: 'panel' }, h('h3', {}, 'Laboratory results'), body,
      view.labNote ? h('p', { class: 'muted small' }, view.labNote) : null));

    return {
      update(state) {
        const labs = state.patients[pid].labs;
        clear(body).append(h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {}, ['Test', 'Result', 'Reference', 'Status'].map((c) => h('th', {}, c)))),
          h('tbody', {}, labs.map((l) => {
            const cat = byCode[l.code] || {};
            const resulted = l.status === 'resulted';
            return h('tr', {},
              h('td', {}, l.label || cat.name || l.code),
              h('td', {}, resulted && l.value != null ? `${l.value} ${l.unit || cat.unit || ''}`.trim() : '—'),
              h('td', {}, cat.refRange || ''),
              h('td', {}, resulted ? (l.resultedAtMin != null ? `Resulted ${at(state, l.resultedAtMin)}` : 'Resulted') : h('span', { class: 'badge badge-pending' }, 'Pending')),
            );
          })),
        ));
      },
    };
  },
};
