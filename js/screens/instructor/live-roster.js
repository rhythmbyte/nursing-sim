// Join code + who has joined, their group, the chart they last opened, and their last action.

import { h } from '../shared/dom.js';
import { formatShiftTime } from '../../engine/time.js';
import { printReportSheets, studentSheets } from '../student/report-sheet.js';
import { studentView } from '../../engine/student-view.js';

export function rosterPanel(runner, templatesById, scenario, user = null) {
  const state = runner.state;
  const at = (m) => formatShiftTime(state.startClock, m);
  const slots = scenario.groups.reduce((n, g) => n + g.studentCount, 0);
  const joined = Object.entries(state.roster);
  const groupName = (gid) => scenario.groups.find((g) => g.id === gid)?.name || gid;
  const last = (uid, action) => [...state.log].reverse().find((l) => l.userId === uid && (!action || l.action === action));

  // Connection: the latest reconnect / rejoin per student (time away), and rejoin requests waiting for approval.
  const conn = (uid) => [...state.log].reverse().find((l) => (l.action === 'reconnected' || l.action === 'student-rejoined' || l.action === 'rejoin-approved') && (l.userId === uid || l.details?.studentId === uid));
  const pending = (state.rejoinRequests || []).filter((q) => q.status === 'pending');
  return h('div', {},
    pending.length ? h('div', { class: 'banner banner-review', role: 'status' }, h('strong', {}, 'Rejoin requests: '),
      pending.map((q) => h('span', { class: 'pick-row' }, `${q.name} is rejoining from another device (${at(q.atMin)}) `,
        user ? h('button', { class: 'btn btn-small btn-primary', onclick: () => runner.decideRejoin(q.id, true, user) }, `Approve ${q.name}`) : null,
        user ? h('button', { class: 'btn btn-small btn-ghost', onclick: () => runner.decideRejoin(q.id, false, user) }, 'Deny') : null))) : null,
    h('div', { class: 'join-code' }, h('span', { class: 'muted' }, 'Join code'), h('strong', { class: 'code' }, state.joinCode || '—'),
      h('span', { class: 'muted' }, `${joined.length} of ${slots} joined · ${scenario.assignment} placement`),
      joined.length ? h('button', { class: 'btn btn-small', onclick: () => {
        const views = Object.fromEntries(Object.keys(state.patients).map((pid) => [pid, studentView(templatesById[pid])]));
        printReportSheets(runner.state, studentSheets(runner.state), views);
      } }, 'Print all report sheets') : null),
    joined.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Student', 'Group', 'In chart', 'Busy with', 'Connection', 'Last action'].map((c) => h('th', {}, c)))),
      h('tbody', {}, joined.map(([uid, r]) => {
        const opened = last(uid, 'patient-opened');
        const act = last(uid);
        return h('tr', {},
          h('td', {}, r.name),
          h('td', {}, groupName(r.groupId)),
          h('td', {}, opened ? `Rm ${templatesById[opened.patientId].demographics.room} (since ${at(opened.simMin)})` : '—'),
          (() => { const b = runner.busy(uid); const pz = runner.paused(uid); return h('td', {}, pz ? h('div', { class: 'muted small' }, `⏸ paused: ${pz.label} (${Math.ceil(pz.leftSec / 60)} min left)`) : null, b ? [`${b.label} · Rm ${templatesById[b.patientId]?.demographics.room ?? '?'} · ${b.leftSec >= 60 ? `${Math.ceil(b.leftSec / 60)} min` : `${b.leftSec} s`} left `,
            user ? h('button', { class: 'btn btn-small', title: 'Finish this task now (counts as done)', onclick: () => runner.endTaskNow(uid, user) }, 'End now') : null] : '—'); })(),
          (() => { const c = conn(uid); return h('td', { class: 'small' }, c ? `↻ ${c.action === 'reconnected' ? 'reconnected' : 'rejoined'}${c.details?.awayMin != null ? ` after ${c.details.awayMin} min` : ''} (${at(c.simMin)})` : '—'); })(),
          h('td', {}, act ? `${at(act.simMin)} · ${act.action.replace(/-/g, ' ')}` : '—'),
        );
      })),
    ) : h('p', { class: 'muted' }, 'Nobody has joined yet. Students enter the code on their tab.'),
  );
}
