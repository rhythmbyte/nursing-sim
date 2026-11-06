// Printable report ("brain") sheet: one page per assigned patient. Uses the student view (no answer key).
// sheetData is pure (tested); printReportSheet renders into a print-only container and opens the print dialog.

import { h } from '../shared/dom.js';
import { formatShiftTime, shiftLengthMin } from '../../engine/time.js';

/** Data for one patient's page. */
export function sheetData(state, userId, pid, view) {
  const ps = state.patients[pid];
  const allergies = view.allergies.length ? view.allergies.map((a) => `${a.agent}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ') : view.allergyText || 'NKDA';
  const active = view.orders.filter((o) => ps.orders[o.id] && ps.orders[o.id].status !== 'done').map((o) => o.text);
  const hours = Math.ceil((state.endMin ?? shiftLengthMin(state.startClock, formatShiftTime(state.startClock, 480))) / 60);
  return {
    name: view.demographics.name, room: view.demographics.room, ageSex: `${view.demographics.age}${view.demographics.sex}`,
    dx: view.admittingDx, codeStatus: view.codeStatus, allergies,
    handoffNotes: state.students[userId]?.handoff?.[pid]?.notes || '',
    orders: active,
    times: Array.from({ length: hours + 1 }, (_, i) => formatShiftTime(state.startClock, i * 60)),
  };
}

export function printReportSheet(state, userId, pids, views, studentName) {
  document.getElementById('print-sheet')?.remove();
  const sheets = pids.map((pid) => {
    const d = sheetData(state, userId, pid, views[pid]);
    return h('section', { class: 'sheet' },
      h('header', { class: 'sheet-head' }, h('h2', {}, `Rm ${d.room} · ${d.name}`), h('div', {}, `${d.ageSex} · ${d.codeStatus}`), h('div', { class: 'muted' }, studentName)),
      h('p', {}, h('strong', {}, 'Dx: '), d.dx), h('p', {}, h('strong', {}, 'Allergies: '), d.allergies),
      h('h3', {}, 'My handoff notes'), h('p', { class: 'pre sheet-box' }, d.handoffNotes || ' '),
      h('h3', {}, 'Active orders'), d.orders.length ? h('ul', {}, d.orders.map((o) => h('li', {}, o))) : h('p', {}, '—'),
      h('h3', {}, 'Notes'), h('div', { class: 'sheet-box sheet-notes' }),
      h('h3', {}, 'Time grid'),
      h('table', { class: 'sheet-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Time'), ['VS', 'Meds', 'Assess', 'Labs', 'Notes'].map((c) => h('th', {}, c)))),
        h('tbody', {}, d.times.map((t) => h('tr', {}, h('td', {}, t), [1, 2, 3, 4, 5].map(() => h('td', {})))))),
    );
  });
  const box = h('div', { id: 'print-sheet' }, sheets);
  document.body.append(box);
  document.body.classList.add('printing-sheet');
  const done = () => { document.body.classList.remove('printing-sheet'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
