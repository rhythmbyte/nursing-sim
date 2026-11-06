// MAR: active med orders. Give / Hold (with reason) / Not given (with reason).
// PRN checks come from engine/prn.js (max doses, interval, required pre-check). The student is
// warned and can still proceed; the choice is logged and the prn-limit rule flags it.

import { h, clear } from '../shared/dom.js';
import { confirmWarnings, promptText } from '../shared/modal.js';
import { toast } from '../shared/toast.js';
import { prnWarnings, dosesGiven, prnOptions } from '../../engine/prn.js';
import { at } from './util.js';
import { activeLog } from '../../engine/struck.js';
import { strikeButton, struckMark } from './strike.js';

function schedule(o, state) {
  if (o.type === 'prn') {
    const p = o.prn || {};
    return ['PRN', p.max ? `max ${p.max}` : null, p.intervalMin ? `q${p.intervalMin >= 60 ? `${p.intervalMin / 60}h` : `${p.intervalMin}min`}` : null].filter(Boolean).join(' · ');
  }
  if (o.dueAtMin != null) return `Due ${at(state, o.dueAtMin)}`;
  if (o.frequencyMin) return o.frequencyMin >= 1440 ? 'Daily' : `Every ${o.frequencyMin / 60} h`;
  return o.type === 'once' ? 'Once' : o.type;
}

export default {
  id: 'mar',
  label: 'MAR',
  mount(root, ctx) {
    const { pid, act, runner, catalogs } = ctx;
    const body = h('div', {});
    root.append(h('section', { class: 'panel' }, h('h3', {}, 'Medication administration record'), body));

    async function give(o) {
      const state = runner.state;
      const warnings = prnWarnings(o, { log: activeLog(state), patientId: pid, simMin: runner.simMin(), ...prnOptions(catalogs, state.patients[pid], state.settings) });
      if (warnings.length) {
        const ok = await confirmWarnings(`Give ${o.med}?`, 'Check before giving:', warnings.map((w) => w.message), 'Give anyway');
        if (!ok) return;
      }
      const r = act('medAction', { orderId: o.id, result: 'given', warnings });
      if (r) toast(r.task ? `Giving ${o.med} (${Math.round(r.task.lockSec)} s)` : `Given: ${o.med}`);
    }

    async function withReason(o, result, title) {
      const reason = await promptText(`${title}: ${o.med}`, 'Reason', { draftKey: `mar.${ctx.user.userId}.${pid}.${o.id}.${result}` });
      if (reason == null) return;
      const r = act('medAction', { orderId: o.id, result, reason });
      if (r) toast(`${title}: ${o.med}`);
    }

    return {
      update(state) {
        const active = ctx.view.orders.filter((o) => o.med && state.patients[pid].orders[o.id]);
        if (!active.length) { clear(body).append(h('p', { class: 'muted' }, 'No active medication orders.')); return; }
        clear(body).append(h('table', { class: 'data-table mar-table' },
          h('thead', {}, h('tr', {}, ['Medication', 'Schedule', 'Given', 'Last action', ''].map((c) => h('th', {}, c)))),
          h('tbody', {}, active.map((o) => {
            const os = state.patients[pid].orders[o.id];
            const doses = dosesGiven(activeLog(state), pid, o.id);
            const last = state.log.filter((l) => l.action === 'med' && l.patientId === pid && l.details.orderId === o.id).at(-1);
            const done = os.status === 'done';
            return h('tr', { class: done ? 'is-done' : '' },
              h('td', {}, h('strong', {}, o.med), h('div', { class: 'muted small' }, o.text)),
              h('td', {}, schedule(o, state)),
              h('td', {}, String(doses.length)),
              h('td', { class: last && state.struck?.[last.id] ? 'struck' : '' }, last ? `${last.details.result.replace('-', ' ')} ${at(state, last.simMin)}${last.details.reason ? ` (${last.details.reason})` : ''}` : '—',
                last ? struckMark(state, last) : null, last ? strikeButton(state, last, ctx) : null),
              h('td', { class: 'row-actions' },
                h('button', { class: 'btn btn-primary btn-small', disabled: done, onclick: () => give(o) }, 'Give'),
                h('button', { class: 'btn btn-small', disabled: done, onclick: () => withReason(o, 'held', 'Held') }, 'Hold'),
                h('button', { class: 'btn btn-small', disabled: done, onclick: () => withReason(o, 'not-given', 'Not given') }, 'Not given'),
              ),
            );
          })),
        ));
      },
    };
  },
};
