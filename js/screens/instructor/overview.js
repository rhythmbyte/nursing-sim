// Instructor → Overview: the only screen while a sim runs. Clock bar (time, time left, Pause / Resume, Break, Speed,
// Skip, End), the attention queue (one prioritized list of what to act on now: codes, alarms, rejoin requests,
// worsening patients, call lights, late work, red flags, away students; engine/attention.js), and the group cards,
// exception-first: only groups and patients needing attention, the rest as "N patients stable" ("Show all" shows
// everything; "Compact" folds on-track groups to one line). A click opens the side drawer (overview-drawer.js).
// Every other Live control panel is under "More controls" (collapsed; mounted only when opened).

import { h, clear } from '../shared/dom.js';
import { coalesce } from '../shared/coalesce.js';
import { simClock } from '../shared/timer.js';
import { attentionQueue, attentionPatients, onAutopilot } from '../../engine/attention.js';
import { evaluateRules } from '../../engine/rules/index.js';
import { helpTip } from '../shared/help.js';
import { instructorPatientLabel } from '../shared/labels.js';
import { SPEEDS } from '../../engine/clock.js';
import { mountCommandCenter } from './command-center.js';
import { mountLiveControl, skipButton } from './live-control.js';
import { createDrawer } from './overview-drawer.js';
import { installShortcuts } from './shortcuts.js';
import { load, save } from '../../storage.js';

function clockBar(runner, user) {
  const s = runner.state.clock.status;
  const live = s === 'running' || s === 'paused';
  const b = (label, onclick, enabled = true, cls = '') => h('button', { class: `btn ${cls}`, type: 'button', disabled: !enabled, onclick }, label);
  return h('div', { class: 'controls overview-controls' },
    s === 'running' ? b('Pause', () => runner.clock('pause', user)) : b('Resume', () => runner.clock('resume', user), s === 'paused', 'btn-primary'),
    ...(runner.state.break ? [b('Extend break +5', () => runner.extendBreak(5, user))]
      : [5, 10, 15].map((m) => b(`Break ${m}`, () => runner.startBreak(m, user), live, 'btn-small'))),
    h('label', { class: 'inline' }, 'Speed ', h('select', { 'aria-label': 'Sim speed', onchange: (e) => runner.clock('speed', user, Number(e.target.value)) },
      SPEEDS.map((x) => h('option', { value: x, selected: x === runner.state.clock.speed }, `${x}x`)))),
    skipButton(runner, user),
    b('End sim', () => { if (window.confirm('End the sim for everyone? Students get their reflection and you go to the debrief.')) runner.clock('end', user); }, live, 'btn-danger'));
}

const KIND_ICON = { code: '✚', alarm: '⚠', rejoin: '↻', worsening: '↘', callLight: '🔔', veryLate: '‼', redFlag: '⚑', away: '⌁', penalty: '▼', late: '◷' };

/** The attention queue: top items (more on request), each one click to the drawer. */
function queueList(queue, runner, drawer, { showTop, expanded, toggle }) {
  const t = runner.templates();
  if (!queue.length) return h('p', { class: 'attention-empty muted small' }, 'Nothing needs you right now.');
  const items = expanded ? queue : queue.slice(0, showTop);
  return h('div', { class: 'attention' },
    h('h3', { class: 'attention-title' }, `Needs attention (${queue.length})`),
    h('ol', { class: 'attention-list' }, items.map((q) => h('li', {}, h('button', { class: `attention-item attention-${q.kind}`, type: 'button',
      onclick: () => (q.patientId ? drawer.show('patient', q.patientId) : drawer.show('student', q.userId)) },
      h('span', { class: 'attention-icon', 'aria-hidden': 'true' }, KIND_ICON[q.kind] || '•'),
      h('strong', {}, q.patientId ? instructorPatientLabel(t[q.patientId]) : q.label.split(' ')[0]), ' ', h('span', {}, q.patientId ? q.label : q.label.split(' ').slice(1).join(' ')))))),
    queue.length > showTop ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: toggle }, expanded ? 'Show fewer' : `Show ${queue.length - showTop} more`) : null);
}

export function mountOverview(root, ctx) {
  const { store, runner, scenario, instructorUser: user, catalogs } = ctx;
  const clock = simClock(store, runner);
  const controls = h('div', {});
  const alerts = h('div', { 'aria-live': 'polite' });
  const cards = h('div', {});
  const drawer = createDrawer({ store, runner, scenario, catalogs, user });
  // Exception-first view (remembered): Show all / Compact.
  let showAll = Boolean(load('ui.overview.showAll'));
  let compact = Boolean(load('ui.overview.compact'));
  let expanded = false;
  const showTop = catalogs.ui?.attention?.showTop ?? 8;
  const toggles = h('div', { class: 'controls overview-view' });
  // Once per render: the group cards' data feeds the attention queue (shape) and the cards' filter.
  const shape = (groups) => {
    const ctxR = runner.rulesCtx();
    const queue = attentionQueue(runner.state, ctxR, groups, evaluateRules(runner.state, ctxR));
    clear(alerts).append(queueList(queue, runner, drawer, { showTop, expanded, toggle: () => { expanded = !expanded; cc.refresh(); } }));
    return { showAll, compact, attention: attentionPatients(queue), autopilot: (pid) => onAutopilot(runner.state, pid) };
  };
  const renderToggles = () => clear(toggles).append(
    h('label', { class: 'inline small' }, h('input', { type: 'checkbox', checked: showAll, onchange: (e) => { showAll = e.target.checked; save('ui.overview.showAll', showAll); cc.refresh(); } }), ' Show all patients'),
    h('label', { class: 'inline small' }, h('input', { type: 'checkbox', checked: compact, onchange: (e) => { compact = e.target.checked; save('ui.overview.compact', compact); cc.refresh(); } }), ' Compact (on-track groups on one line)'),
    helpTip('overview.exceptions'));
  renderToggles();
  const cc = mountCommandCenter(cards, { store, runner, scenario, embedded: true, shape,
    onGroup: (id) => drawer.show('group', id), onPatient: (id) => drawer.show('patient', id), onStudent: (id) => drawer.show('student', id) });
  // More controls: the full Live control (every panel), mounted only while open.
  const moreBody = h('div', {});
  let moreCleanup = null;
  const more = h('details', { class: 'panel more-controls', open: Boolean(load('ui.overview.more')) },
    h('summary', {}, h('strong', {}, 'More controls'), ' · every Live control panel: join code and students, flags, patients, scripts, staff, labs, event timeline, Reset sim ', helpTip('overview.more')), moreBody);
  const syncMore = () => {
    save('ui.overview.more', more.open);
    if (more.open && !moreCleanup) moreCleanup = mountLiveControl(moreBody, { ...ctx, noShortcuts: true });
    if (!more.open && moreCleanup) { moreCleanup(); moreCleanup = null; clear(moreBody); }
  };
  more.addEventListener('toggle', syncMore);

  let lastKey = '';
  function render() {
    const key = `${runner.state.clock.status}|${runner.state.clock.speed}|${Boolean(runner.state.break)}|${runner.nextEventMin()}`;
    if (key !== lastKey) { lastKey = key; clear(controls).append(clockBar(runner, user)); }
  }
  root.append(h('div', { class: 'overview' },
    h('header', { class: 'screen-header overview-bar' }, h('h2', {}, scenario.name), clock.el, helpTip('overview.status'),
      // Menu: Home and the debrief so far, kept out of the way of a running sim (Home asks first).
      h('details', { class: 'overview-menu' }, h('summary', { class: 'btn btn-small' }, 'Menu'),
        h('div', { class: 'overview-menu-list' },
          ctx.goHome ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => ctx.goHome() }, '⌂ Home (the sim keeps running)') : null,
          ctx.goDebrief ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => ctx.goDebrief() }, 'Debrief so far') : null))),
    controls, alerts, toggles, cards, more), drawer.el);
  render();
  syncMore();
  const later = coalesce(render, 250);
  const off = store.subscribe(later.run);
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
  const offKeys = installShortcuts(runner, user);
  return () => { off(); offTick(); later.cancel(); clock.destroy(); cc?.(); drawer.destroy(); offKeys(); if (moreCleanup) moreCleanup(); };
}
