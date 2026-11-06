// Live flags (all students) + "Mark left unattended" for the left-unattended rule.

import { h } from '../shared/dom.js';
import { promptText } from '../shared/modal.js';
import { formatShiftTime } from '../../engine/time.js';

export function flagsPanel(runner, templatesById, user) {
  const flags = runner.flags();
  const at = (m) => formatShiftTime(runner.state.startClock, m);
  const room = (pid) => `Rm ${templatesById[pid].demographics.room}`;
  const ctx = runner.rulesCtx();
  const present = Object.entries(runner.state.patients).filter(([, ps]) => ps.present);
  const pick = h('select', { 'aria-label': 'Patient' }, present.map(([pid]) => h('option', { value: pid }, `${room(pid)} ${templatesById[pid].demographics.name}`)));

  async function mark() {
    const pid = pick.value;
    const studentIds = ctx.studentIdsForGroup(runner.state.patients[pid].groupId);
    const note = await promptText(`Left unattended: ${templatesById[pid].demographics.name}`, `Note (applies to ${studentIds.join(', ')})`, { required: false, okLabel: 'Mark' });
    if (note == null) return;
    runner.markLeftUnattended(pid, studentIds, note, user);
  }

  return h('div', {},
    flags.length ? h('ul', { class: 'flag-list' }, [...flags].reverse().slice(0, 20).map((f) => h('li', {},
      h('span', { class: `flag-chip flag-${f.severity}` }, f.severity), h('span', { class: 'feed-time' }, at(f.atMin)),
      h('span', { class: 'feed-room' }, room(f.patientId)), h('span', { class: 'flag-msg' }, f.message, h('span', { class: 'muted small' }, ` · ${f.userIds.join(', ')}`)))))
      : h('p', { class: 'muted' }, 'No flags yet.'),
    h('div', { class: 'controls' }, h('label', { class: 'inline' }, 'Left unattended: ', pick), h('button', { class: 'btn btn-small btn-danger', onclick: mark }, 'Mark')),
  );
}
