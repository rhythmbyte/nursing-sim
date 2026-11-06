// Instructor → Command center: one card per group, worst first, so you can see who's struggling at a glance.
// Data: engine/command-center.js (built on engine/timeliness.js and the flag rules). Updates live.
// Click a group → Live control filtered to it; click a patient → Live control filtered to that patient.

import { h, clear } from '../shared/dom.js';
import { coalesce } from '../shared/coalesce.js';
import { simClock } from '../shared/timer.js';
import { triageChip } from '../shared/triage-chip.js';
import { toneChip } from '../shared/tone-chip.js';
import { patientLabel } from '../shared/labels.js';
import { helpTip } from '../shared/help.js';
import { commandCenter, statusWorsened } from '../../engine/command-center.js';
import { timelinessConfig } from '../../engine/timeliness.js';

const TREND = { worse: ['↘', 'Vitals worsening'], better: ['↗', 'Vitals improving'], steady: ['→', 'Vitals steady'] };
const KIND = { order: '', med: 'Med: ', assessment: 'Reassess: ', callLight: '', alarm: '' };
const FLASH_MS = 4000; // how long a card flashes after its status gets worse (CSS .cc-flash matches)

export function mountCommandCenter(root, { store, runner, scenario, openLive }) {
  const clock = simClock(store, runner);
  const grid = h('div', { class: 'cc-grid' });
  const lastStatus = {}; // groupId → status at the previous render
  const flashFrom = {}; // groupId → wall ms when its status last got worse
  let flashTimer = null;

  function render() {
    const state = runner.state;
    const t = runner.templates();
    const cfg = timelinessConfig(state, runner.rulesCtx().catalogs);
    const tags = cfg.tags || {};
    const statusLabels = cfg.groupStatus?.labels || {};
    const groups = commandCenter(state, runner.rulesCtx(), scenario);
    clear(grid).append(...groups.map((g) => {
      const c = g.counts;
      if (statusWorsened(lastStatus[g.groupId], g.status)) flashFrom[g.groupId] = Date.now();
      lastStatus[g.groupId] = g.status;
      const since = Date.now() - (flashFrom[g.groupId] ?? -Infinity);
      const flashing = since < FLASH_MS;
      const count = (n, label, warn) => h('div', { class: `cc-count${warn && n ? ` cc-warn-${warn}` : ''}` }, h('strong', {}, String(n)), h('span', {}, label));
      // A re-render mid-flash rebuilds the card, so a negative delay resumes the animation where it was.
      return h('section', { class: `cc-card cc-${g.status}${flashing ? ' cc-flash' : ''}`, style: flashing ? `animation-delay: -${since}ms` : null },
        h('button', { class: 'cc-head', onclick: () => openLive({ groupId: g.groupId }), title: 'Open this group in Live control' },
          h('h3', {}, g.name), toneChip(statusLabels[g.status])),
        h('div', { class: 'cc-students' }, g.students.length
          ? g.students.map((st) => h('span', {}, `${st.name}: ${st.inPatient ? `in ${patientLabel(t[st.inPatient])}` : 'on home screen'}`,
            st.busy ? h('span', { class: 'cc-busy' }, ` · ⏳ ${st.busy.label} (${Math.ceil(st.busy.leftMin)} min left)`) : null,
            st.back ? h('span', { class: 'muted' }, ` · ↻ reconnected${st.back.awayMin != null ? ` after ${st.back.awayMin} min` : ''}`) : null))
          : h('span', { class: 'muted' }, 'Nobody joined yet')),
        g.staffing?.roles.length ? h('div', { class: `cc-staff${g.staffing.allBusy.length || g.staffing.queued ? ' cc-staff-full' : ''}`, title: 'Delegation helpers in this group' },
          h('span', { class: 'muted small' }, 'Staff: '),
          g.staffing.roles.map((r, i) => [i ? ' · ' : '', `${r.role}s ${r.busy}/${r.total} busy${r.onBreak ? `, ${r.onBreak} on break` : ''}`]),
          g.staffing.queued ? h('strong', {}, ` · ${g.staffing.queued} waiting for a helper`) : null) : null,
        h('div', { class: 'cc-counts' },
          count(c.openOrders, 'open orders'), count(c.late, 'late', 'yellow'), count(c.veryLate, 'very late', 'red'), count(c.medsOverdue, 'meds overdue', 'yellow'), count(c.assessmentsOverdue, 'reassessments overdue', 'yellow'),
          count(c.callLights, c.callLights ? `call lights (longest ${Math.round(c.longestCallLightMin)} min)` : 'call lights', c.longestCallLightMin > (cfg.callLights?.lateMin ?? 5) ? 'red' : 'yellow'),
          count(c.alarms, 'monitor alarms', 'red'), count(c.redFlags, 'red flags', 'red'), count(c.amberFlags, 'amber flags', 'yellow')),
        h('ul', { class: 'cc-patients' }, g.patients.map((p) => {
          const [arrow, trendText] = TREND[p.trend];
          return h('li', {}, h('button', { class: 'cc-patient', onclick: () => openLive({ patientId: p.patientId }), title: 'Open this patient in Live control' },
            h('span', { class: 'cc-room' }, patientLabel(t[p.patientId])),
            triageChip(p.tag),
            h('span', { class: `cc-trend cc-trend-${p.trend}`, title: trendText, 'aria-label': trendText }, arrow),
            p.alarm ? h('span', { class: 'cc-alarm', title: 'Monitor alarm' }, '⚠ alarm') : null,
            p.script ? h('span', { class: 'cc-script', title: 'Reactive script state' }, `${p.script.paused ? '⏸' : '◆'} ${p.script.label.length > 30 ? `${p.script.label.slice(0, 29)}…` : p.script.label}`) : null,
            p.script?.penalty ? h('span', { class: 'cc-penalty', title: 'Recovery penalty' }, `▼ penalty ${p.script.penalty}%`) : null,
            p.worst ? h('span', { class: 'cc-worst' }, toneChip(tags[p.worst.tag]), ` ${KIND[p.worst.kind]}${p.worst.label.length > 60 ? `${p.worst.label.slice(0, 58)}…` : p.worst.label}, ${Math.round(p.worst.minutes)} min`) : h('span', { class: 'muted' }, 'Nothing open')));
        })),
      );
    }));
    // Re-render once the newest flash ends so the class is removed.
    const left = Math.max(0, ...Object.values(flashFrom).map((t) => FLASH_MS - (Date.now() - t)));
    clearTimeout(flashTimer);
    flashTimer = left > 0 ? setTimeout(render, left + 50) : null;
  }

  root.append(
    h('header', { class: 'screen-header' }, h('h2', {}, 'Command center'), helpTip('command.status'), clock.el),
    h('p', { class: 'muted small' }, 'Worst first. Click a group or a patient to open it in Live control.'),
    grid,
  );
  render();
  const later = coalesce(render, 250); // at most ~4 renders a second however busy the sim is
  const off = store.subscribe(later.run);
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
  return () => { off(); offTick(); later.cancel(); clock.destroy(); clearTimeout(flashTimer); };
}
