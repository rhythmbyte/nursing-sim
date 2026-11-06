// Editable tables for the patient editor: orders and labs. Each returns { el, collect() }.
// Fields the table doesn't show (PRN limits, parameters, activation) are kept from the original row.

import { h, clear } from '../shared/dom.js';

const ORDER_TYPES = ['once', 'scheduled', 'prn', 'continuous', 'parameter'];

export function ordersTable(orders, catalogs) {
  let rows = orders.map((o) => ({ o }));
  const body = h('tbody', {});
  const ivOptions = (sel) => [h('option', { value: '' }, '(none)'), ...catalogs.interventions.interventions.map((i) => h('option', { value: i.id, selected: i.id === sel }, i.label))];
  function render() {
    clear(body).append(...rows.map((r, i) => {
      const n = i + 1;
      r.text ??= h('textarea', { class: 'input', rows: 2, 'aria-label': `Order ${n} text` }, r.o.text || '');
      r.type ??= h('select', { 'aria-label': `Order ${n} type` }, ORDER_TYPES.map((x) => h('option', { value: x, selected: (r.o.type || 'once') === x }, x)));
      r.tier ??= h('select', { 'aria-label': `Order ${n} tier` }, [1, 2, 3].map((x) => h('option', { value: x, selected: (r.o.tier || 2) === x }, `T${x}`)));
      r.set ??= h('input', { class: 'input', value: r.o.orderSet || '', 'aria-label': `Order ${n} order set` });
      r.iv ??= h('select', { 'aria-label': `Order ${n} satisfied by` }, ivOptions(r.o.interventionIds?.[0]));
      r.med ??= h('input', { class: 'input', value: r.o.med || '', placeholder: 'med (MAR)', 'aria-label': `Order ${n} medication` });
      r.delegable ??= h('input', { type: 'checkbox', checked: Boolean(r.o.delegable), 'aria-label': `Order ${n} delegable` });
      return h('tr', {}, [r.text, r.type, r.tier, r.set, r.iv, r.med, r.delegable].map((el) => h('td', {}, el)),
        h('td', {}, h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { rows.splice(i, 1); render(); } }, 'Remove')));
    }));
  }
  render();
  const el = h('div', {},
    h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, ['Order', 'Type', 'Tier', 'Order set', 'Satisfied by', 'Medication', 'Delegable', ''].map((c) => h('th', {}, c)))), body),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => { rows.push({ o: { tier: 2, type: 'once', activeFromMin: 0 } }); render(); } }, 'Add order'));
  return {
    el,
    collect: (patientId) => rows.filter((r) => r.text.value.trim()).map((r, i) => {
      const iv = r.iv.value;
      const { med: _m, ...rest } = r.o;
      return {
        ...rest, id: r.o.id || `o-${patientId.split('-')[0]}-new-${Date.now().toString(36)}-${i}`,
        text: r.text.value.trim(), type: r.type.value, tier: Number(r.tier.value), orderSet: r.set.value.trim() || `os-${patientId.split('-')[0]}-admit`,
        interventionIds: iv ? [iv, ...(r.o.interventionIds || []).filter((x) => x !== iv)] : (r.o.interventionIds || []),
        delegable: r.delegable.checked, ...(r.med.value.trim() ? { med: r.med.value.trim() } : {}),
        ...(r.o.activeFromMin == null && !r.o.activeOnEvent ? { activeFromMin: 0 } : {}),
      };
    }),
  };
}

export function labsTable(labs, catalogs, orders) {
  let rows = labs.map((l) => ({ l }));
  const body = h('tbody', {});
  function render() {
    clear(body).append(...rows.map((r, i) => {
      const n = i + 1;
      r.code ??= h('select', { 'aria-label': `Lab ${n} test` }, catalogs.labs.labs.map((c) => h('option', { value: c.code, selected: c.code === r.l.code }, c.name)));
      r.label ??= h('input', { class: 'input', value: r.l.label || '', placeholder: 'optional label', 'aria-label': `Lab ${n} label` });
      r.value ??= h('input', { class: 'input', value: r.l.value ?? '', placeholder: 'blank = instructor enters live', 'aria-label': `Lab ${n} value` });
      r.status ??= h('select', { 'aria-label': `Lab ${n} status` }, ['resulted', 'pending'].map((x) => h('option', { value: x, selected: (r.l.status || 'resulted') === x }, x)));
      r.delay ??= h('input', { class: 'input', type: 'number', min: 0, value: r.l.resultDelayMin ?? '', placeholder: 'catalog default', 'aria-label': `Lab ${n} delay in minutes` });
      r.forOrder ??= h('select', { 'aria-label': `Lab ${n} result belongs to order` }, h('option', { value: '' }, '(any lab order)'), orders.filter((o) => o.labCodes?.length).map((o) => h('option', { value: o.id, selected: o.id === r.l.forOrder }, o.text.slice(0, 50))));
      return h('tr', {}, [r.code, r.label, r.value, r.status, r.delay, r.forOrder].map((el) => h('td', {}, el)),
        h('td', {}, h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { rows.splice(i, 1); render(); } }, 'Remove')));
    }));
  }
  render();
  const el = h('div', {},
    h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, ['Test', 'Label', 'Value', 'Status', 'Delay (min)', 'Result belongs to', ''].map((c) => h('th', {}, c)))), body),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => { rows.push({ l: { status: 'resulted' } }); render(); } }, 'Add lab'));
  return {
    el,
    collect: () => rows.map((r) => {
      const { label: _a, value: _b, resultDelayMin: _c, forOrder: _d, ...rest } = r.l;
      return {
        ...rest, code: r.code.value, status: r.status.value, value: r.value.value.trim() === '' ? (r.status.value === 'pending' ? null : '') : r.value.value.trim(),
        ...(r.label.value.trim() ? { label: r.label.value.trim() } : {}),
        ...(r.delay.value !== '' ? { resultDelayMin: Number(r.delay.value) } : {}),
        ...(r.forOrder.value ? { forOrder: r.forOrder.value } : {}),
      };
    }),
  };
}
