// Charge → Unit overview: every patient on the unit with live tag, assigned students, call lights,
// codes, new orders and open flags, plus admissions waiting on the board.

import { h } from '../shared/dom.js';
import { triageChip } from '../shared/triage-chip.js';
import { badge } from '../shared/badge.js';
import { elapsed } from '../shared/timer.js';
import { formatShiftTime } from '../../engine/time.js';
import { waitingAdmissions } from '../../engine/admissions.js';

export function unitOverview(runner, templatesById, scenario) {
  const state = runner.state;
  const simMin = runner.simMin();
  const at = (m) => formatShiftTime(state.startClock, m);
  const flags = runner.flags();
  const groupName = (gid) => scenario.groups.find((g) => g.id === gid)?.name || gid;
  const studentsIn = (gid) => Object.values(state.roster).filter((r) => r.groupId === gid).map((r) => r.name);
  const waiting = waitingAdmissions(state);
  const rows = Object.entries(state.patients).filter(([, ps]) => ps.present)
    .sort((a, b) => templatesById[a[0]].demographics.room.localeCompare(templatesById[b[0]].demographics.room, undefined, { numeric: true }));

  return h('div', {},
    waiting.length ? h('div', { class: 'banner banner-review' },
      h('strong', {}, `${waiting.length} admission${waiting.length > 1 ? 's' : ''} waiting: `),
      waiting.map((a) => `${templatesById[a.patientId].demographics.name} (${a.status}, ${elapsed(simMin, a.arrivedAtMin)})`).join('; ')) : null,
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Room', 'Patient', 'Tag', 'Group · students', 'Now', 'Open flags'].map((c) => h('th', {}, c)))),
      h('tbody', {}, rows.map(([pid, ps]) => {
        const d = templatesById[pid].demographics;
        const f = flags.filter((x) => x.patientId === pid);
        const red = f.filter((x) => x.severity === 'red').length;
        const newOrders = Object.values(ps.orders).filter((o) => o.status === 'new').length;
        const now = [
          ps.callLight ? `call light ${elapsed(simMin, ps.callLight.since)}` : null,
          ps.code && !ps.code.outcome ? `CODING since ${at(ps.code.startedMin)}` : null,
          !ps.alive ? 'deceased' : null,
          newOrders ? `${newOrders} new order${newOrders > 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' · ') || '—';
        const students = studentsIn(ps.groupId);
        return h('tr', { class: ps.code && !ps.code.outcome ? 'needs-attention' : '' },
          h('td', {}, d.room), h('td', {}, `${d.name}, ${d.age}${d.sex}`), h('td', {}, triageChip(ps.tag)),
          h('td', {}, `${groupName(ps.groupId)} · ${students.length ? students.join(', ') : 'nobody joined'}`),
          h('td', {}, now),
          h('td', {}, f.length ? [red ? badge(`${red} red`, 'review') : null, ' ', f.length - red ? badge(`${f.length - red} amber`, 'neutral') : null] : '—'),
        );
      })),
    ),
  );
}
