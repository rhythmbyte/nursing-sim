// Student → Home (phase 2 slice): sim clock, assigned patients, call lights with "Answer", alerts.
// Phase 3 adds the handoff popup, the chart, and the student-view data filter.

import { h, clear } from '../shared/dom.js';
import { simClock, elapsed } from '../shared/timer.js';
import { triageChip } from '../shared/triage-chip.js';
import { badge } from '../shared/badge.js';
import { formatShiftTime } from '../../engine/time.js';

function patientRow(pid, ps, t, { runner, user, showTags, simMin }) {
  const d = t.demographics;
  const newOrders = Object.values(ps.orders).filter((o) => o.status === 'new').length;
  return h('li', { class: `student-patient${ps.callLight ? ' has-light' : ''}` },
    h('div', { class: 'sp-main' },
      h('span', { class: 'room' }, `Rm ${d.room}`),
      h('strong', {}, d.name),
      h('span', { class: 'muted' }, `${d.age}${d.sex} · ${t.admittingDx}`),
      showTags ? triageChip(ps.tag) : null,
      newOrders ? badge(`${newOrders} new order${newOrders > 1 ? 's' : ''}`, 'pending') : null,
    ),
    ps.callLight ? h('div', { class: 'sp-light' },
      h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
      h('span', {}, `Call light · ${elapsed(simMin, ps.callLight.since)}`),
      h('button', { class: 'btn btn-primary btn-small', onclick: () => runner.answerCallLight(pid, user) }, 'Answer'),
      h('div', { class: 'sp-light-msg' }, ps.callLight.message),
    ) : null,
  );
}

export function mountStudentHome(root, { store, runner, templatesById, scenario, slot, user }) {
  const clock = simClock(store, runner);
  const list = h('ul', { class: 'student-patients' });
  const alerts = h('div', {});
  const showTags = scenario.settings.showTagsToStudents;

  function render() {
    const state = runner.state;
    const simMin = runner.simMin();
    const mine = Object.entries(state.patients).filter(([, ps]) => ps.groupId === slot.groupId && ps.present);
    clear(list).append(...(mine.length
      ? mine.map(([pid, ps]) => patientRow(pid, ps, templatesById[pid], { runner, user, showTags, simMin }))
      : [h('li', { class: 'muted' }, 'No patients assigned.')]));

    const ids = new Set(mine.map(([pid]) => pid));
    const recent = state.alerts.filter((a) => a.audience.includes('student') && (!a.patientId || ids.has(a.patientId))).reverse().slice(0, 8);
    clear(alerts).append(recent.length
      ? h('ol', { class: 'feed' }, recent.map((a) => h('li', {},
        h('span', { class: 'feed-time' }, formatShiftTime(state.startClock, a.simMin)),
        a.patientId ? h('span', { class: 'feed-room' }, `Rm ${templatesById[a.patientId].demographics.room}`) : null,
        h('span', {}, a.message))))
      : h('p', { class: 'muted' }, 'No alerts yet.'));
  }

  root.append(
    h('header', { class: 'screen-header' },
      h('h2', {}, `${user.name} · ${slot.groupName}`),
      clock.el,
    ),
    h('section', { class: 'panel' }, h('h3', {}, 'My patients'), list),
    h('section', { class: 'panel' }, h('h3', {}, 'Alerts'), alerts),
    h('p', { class: 'muted' }, 'Prototype: the full chart, handoff, and join form arrive in phase 3.'),
  );
  render();
  const offSet = store.subscribe(render);
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
  return () => { clock.destroy(); offSet(); offTick(); };
}
