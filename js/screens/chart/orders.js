// Orders: active orders with status (new / active / done). New orders highlight until acknowledged.

import { h, clear } from '../shared/dom.js';
import { at, ORDER_STATUS } from './util.js';

const TYPE_LABEL = { once: 'Once', scheduled: 'Scheduled', prn: 'PRN', continuous: 'Continuous', parameter: 'Parameter' };

export default {
  id: 'orders',
  label: 'Orders',
  mount(root, ctx) {
    const { pid, act } = ctx;
    const body = h('div', {});
    root.append(h('section', { class: 'panel' }, h('h3', {}, 'Active orders'), body));

    return {
      update(state) {
        const byId = Object.fromEntries(ctx.view.orders.map((o) => [o.id, o]));
        const rows = Object.entries(state.patients[pid].orders)
          .map(([id, os]) => ({ o: byId[id], os }))
          .filter((r) => r.o)
          .sort((a, b) => (a.os.status === 'new' ? -1 : 0) - (b.os.status === 'new' ? -1 : 0) || b.os.activeAtMin - a.os.activeAtMin);
        if (!rows.length) { clear(body).append(h('p', { class: 'muted' }, 'No active orders.')); return; }
        clear(body).append(h('table', { class: 'data-table orders-table' },
          h('thead', {}, h('tr', {}, ['Order', 'Type', 'Ordered', 'Status', ''].map((c) => h('th', {}, c)))),
          h('tbody', {}, rows.map(({ o, os }) => h('tr', { class: `order-${os.status}` },
            h('td', {}, o.text),
            h('td', {}, TYPE_LABEL[o.type] || o.type),
            h('td', {}, at(state, os.activeAtMin)),
            h('td', {}, h('span', { class: `status-chip status-${os.status}` }, ORDER_STATUS[os.status])),
            h('td', { class: 'row-actions' },
              os.status === 'new' ? h('button', { class: 'btn btn-primary btn-small', onclick: () => act('acknowledgeOrder', { orderId: o.id }) }, 'Acknowledge') : null,
              os.status !== 'done' ? h('button', { class: 'btn btn-small', onclick: () => act('completeOrder', { orderId: o.id }) }, 'Mark done') : null,
            ),
          ))),
        ));
      },
    };
  },
};
