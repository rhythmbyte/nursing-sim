// Debrief Tier 1, Summary (default; fits one screen, prints as one page): one card per group with tasks on time,
// late / very late, misprioritized, missed, call light and alarm response averages, an overall status and its
// patients as "(C1) Robert Miller". Every number opens the full breakdown at its section; "Talking points" opens Tier 2.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { toneChip } from '../shared/tone-chip.js';
import { instructorPatientLabel } from '../shared/labels.js';
import { groupSummary, talkingPoints } from '../../engine/talking-points.js';
import { timelinessConfig } from '../../engine/timeliness.js';

const mins = (x) => (x == null ? '—' : `${x} min`);

export function summaryView({ runner, scenario, catalogs }, { open, pointsState, runAgain }) {
  const ctx = runner.rulesCtx();
  const labels = timelinessConfig(runner.state, catalogs).groupStatus?.labels || {};
  const t = runner.templates();
  const cards = scenario.groups.map((g) => {
    const s = groupSummary(runner.state, g, ctx);
    const pts = talkingPoints(runner.state, g, ctx).filter((p) => pointsState[p.id] !== 'hidden');
    const done = pts.filter((p) => pointsState[p.id] === 'done').length;
    const num = (n, label, tone, section) => h('button', { class: `sum-num sum-${tone}${n ? '' : ' sum-zero'}`, type: 'button', title: `Open the full breakdown: ${label}`,
      onclick: () => open({ tier: 'full', groupId: g.id, section }) }, h('strong', {}, String(n)), h('span', {}, label));
    return h('section', { class: `panel sum-card cc-${s.status}` },
      h('div', { class: 'panel-head' }, h('h3', {}, s.name), toneChip(labels[s.status])),
      h('p', { class: 'muted small' }, s.students.length ? s.students.map((x) => x.name).join(', ') : 'Nobody joined'),
      h('div', { class: 'sum-nums' },
        num(s.onTime, 'on time', 'green', 'timeliness'),
        num(s.late, 'late', 'amber', 'timeliness'),
        num(s.veryLate, 'very late', 'red', 'timeliness'),
        num(s.misprioritized, 'misprioritized', 'red', 'priorities'),
        num(s.never, 'missed / never done', 'red', 'timeliness'),
        num(s.red, 'red flags', 'red', 'flags'),
        num(s.amber, 'amber flags', 'amber', 'flags')),
      h('p', { class: 'small' }, h('button', { class: 'btn-link', type: 'button', onclick: () => open({ tier: 'full', groupId: g.id, section: 'responses' }) },
        `Call lights: ${s.callLightAvgMin == null ? 'none answered' : `answered in ${mins(s.callLightAvgMin)} on average`} · Alarms: ${s.alarmAvgMin == null ? 'none silenced' : `silenced in ${mins(s.alarmAvgMin)} on average`}`)),
      h('ul', { class: 'sum-patients' }, s.patientIds.map((pid) => h('li', {}, instructorPatientLabel(t[pid])))),
      h('div', { class: 'controls' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => open({ tier: 'points', groupId: g.id }) }, `Talking points (${pts.length}${done ? `, ${done} discussed` : ''})`),
        h('button', { class: 'btn', type: 'button', onclick: () => open({ tier: 'full', groupId: g.id }) }, 'Full breakdown')));
  });
  return h('div', { class: 'debrief-summary' },
    h('header', { class: 'screen-header' }, h('h2', {}, 'Debrief summary'), helpTip('debrief.summary'),
      h('span', { class: 'muted' }, runner.state.clock.status === 'ended' ? 'Sim ended' : 'So far (the sim is still going)'),
      h('div', { class: 'debrief-actions' },
        runAgain && runner.state.clock.status === 'ended' ? h('button', { class: 'btn btn-primary', type: 'button', title: 'Same scenario and settings, a new join code and new patient variants', onclick: runAgain }, 'Run again') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print summary'))),
    h('div', { class: 'sum-grid' }, cards));
}
