// Charge nurse / instructor: every group's helpers on the unit. Move a free helper to another group, send one on break
// or back, and change how many helpers of a role a group has. All logged (engine/staff.js). Display + runner calls.

import { h } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { helpTip } from '../shared/help.js';

export function staffBoard(runner, scenario, user, templatesById, catalogs) {
  const roles = (catalogs.staff?.staff || []).filter((s) => ['LPN', 'CNA'].includes(s.role)).map((s) => s.role);
  const room = (pid) => `Rm ${templatesById[pid]?.demographics.room ?? '?'}`;
  const run = (name, args) => { try { runner.staff(name, args, user); } catch (e) { toast(e.message, 5000); } };
  return h('div', { class: 'staff-board' }, h('p', { class: 'muted small' }, 'Delegation helpers per group ', helpTip('charge.staff')),
    ...scenario.groups.map((g) => {
      const v = runner.staffView(g.id);
      return h('div', { class: 'staff-group' }, h('h4', {}, g.name),
        h('div', { class: 'controls' }, roles.map((r) => {
          const n = v.helpers.filter((x) => x.role === r).length;
          return h('span', { class: 'pick-row' }, `${r}: ${n} `,
            h('button', { class: 'btn btn-small', 'aria-label': `One more ${r} in ${g.name}`, onclick: () => run('setStaffCount', [g.id, r, n + 1]) }, '+'),
            h('button', { class: 'btn btn-small', 'aria-label': `One fewer ${r} in ${g.name}`, disabled: !n, onclick: () => run('setStaffCount', [g.id, r, n - 1]) }, '−'));
        })),
        h('table', { class: 'data-table' }, h('tbody', {}, v.helpers.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.label)),
          h('td', {}, x.status === 'free' ? '✓ free' : x.status === 'break' ? '☕ on break' : `⏳ ${x.taskLabel} · ${room(x.patientId)} · ${Math.ceil(x.leftMin)} min`),
          h('td', {}, h('button', { class: 'btn btn-small', disabled: x.status === 'busy', onclick: () => run('setOnBreak', [x.id, x.status !== 'break']) }, x.status === 'break' ? 'Back from break' : 'Break'),
            ' ', h('select', { 'aria-label': `Move ${x.label} to group`, disabled: x.status === 'busy', onchange: (e) => { if (e.target.value) run('moveHelper', [x.id, e.target.value]); } },
              h('option', { value: '' }, 'Move to…'), scenario.groups.filter((o) => o.id !== g.id).map((o) => h('option', { value: o.id }, o.name)))))))),
        v.queued.length ? h('p', { class: 'small' }, `Waiting for a helper: ${v.queued.map((q) => `${q.to} · ${q.taskLabel} (${room(q.patientId)})`).join('; ')}`) : null);
    }));
}
