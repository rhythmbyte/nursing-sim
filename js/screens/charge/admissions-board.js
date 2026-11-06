// Charge → Admissions board: incoming patients with report; assign to a group now, or hold.
// Decisions and wait times are logged by the engine (engine/admissions.js).

import { h } from '../shared/dom.js';
import { promptText } from '../shared/modal.js';
import { triageChip } from '../shared/triage-chip.js';
import { elapsed } from '../shared/timer.js';
import { formatShiftTime } from '../../engine/time.js';
import { waitingAdmissions } from '../../engine/admissions.js';
import { studentView } from '../../engine/student-view.js';

const SBAR = [['situation', 'S'], ['background', 'B'], ['assessment', 'A'], ['recommendation', 'R']];

export function admissionsBoard(runner, templatesById, scenario, user) {
  const state = runner.state;
  const simMin = runner.simMin();
  const at = (m) => formatShiftTime(state.startClock, m);
  const waiting = waitingAdmissions(state);
  const decided = Object.entries(state.patients).filter(([, ps]) => ps.admission?.status === 'assigned');
  const load = (gid) => Object.values(state.patients).filter((ps) => ps.present && ps.groupId === gid).length;

  return h('div', {},
    waiting.length ? waiting.map((a) => {
      const v = studentView(templatesById[a.patientId], { showTags: true }); // report only, no answer key
      const group = h('select', { 'aria-label': 'Assign to group' }, scenario.groups.map((g) => h('option', { value: g.id, selected: g.id === a.suggestedGroupId },
        `${g.name} (${load(g.id)} patients)`)));
      return h('section', { class: 'panel admission-card' },
        h('div', { class: 'panel-head' },
          h('h3', {}, `${v.demographics.name}, ${v.demographics.age}${v.demographics.sex} · Rm ${v.demographics.room} `, triageChip(v.tag)),
          h('span', { class: 'muted' }, `${a.status === 'held' ? `Held${a.reason ? ` (${a.reason})` : ''}` : 'Waiting'} · arrived ${at(a.arrivedAtMin)} · ${elapsed(simMin, a.arrivedAtMin)}`)),
        h('p', {}, a.message),
        h('p', {}, h('strong', {}, 'Dx: '), v.admittingDx, ' · ', h('strong', {}, 'Code status: '), v.codeStatus),
        v.handoff ? h('dl', { class: 'sbar' }, SBAR.map(([k, l]) => [h('dt', {}, l), h('dd', {}, v.handoff[k] || '—')])) : null,
        h('div', { class: 'controls' },
          h('label', { class: 'inline' }, 'Assign to ', group),
          h('button', { class: 'btn btn-primary', onclick: () => runner.assignAdmission(a.patientId, group.value, user) }, 'Assign now'),
          a.status === 'pending' ? h('button', { class: 'btn', onclick: async () => {
            const reason = await promptText(`Hold ${v.demographics.name}`, 'Reason (optional)', { required: false, okLabel: 'Hold' });
            if (reason != null) runner.holdAdmission(a.patientId, reason, user);
          } }, 'Hold') : null),
      );
    }) : h('p', { class: 'muted' }, 'No admissions waiting.'),
    decided.length ? h('section', { class: 'panel' }, h('h3', {}, 'Decided'),
      h('ul', { class: 'feed' }, decided.map(([pid, ps]) => h('li', {},
        h('span', { class: 'feed-time' }, at(ps.admission.decidedAtMin)),
        `${templatesById[pid].demographics.name} → ${scenario.groups.find((g) => g.id === ps.admission.groupId)?.name} (waited ${Math.round(ps.admission.decidedAtMin - ps.admission.arrivedAtMin)} min)`)))) : null,
  );
}
