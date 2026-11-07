// Instructor → Overview: the only screen while a sim runs. Clock bar (time, time left, Pause / Resume, Break, Speed,
// Skip, End), an alerts strip (call lights, monitor alarms, rejoin requests), and the Command center group cards.
// A click on a patient, student or group opens the side drawer (overview-drawer.js). Every other Live control panel
// is under "More controls" (collapsed; mounted only when opened).

import { h, clear } from '../shared/dom.js';
import { coalesce } from '../shared/coalesce.js';
import { simClock, elapsed } from '../shared/timer.js';
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

function alertsStrip(runner, drawer) {
  const st = runner.state;
  const t = runner.templates();
  const simMin = runner.simMin();
  const items = [
    ...Object.entries(st.patients).filter(([, ps]) => ps.callLight).map(([pid, ps]) => ({ cls: 'alert-call', text: `🔔 ${instructorPatientLabel(t[pid])} · call light ${elapsed(simMin, ps.callLight.since)}`, open: () => drawer.show('patient', pid) })),
    ...Object.entries(st.patients).filter(([, ps]) => ps.alarm?.active?.length).map(([pid, ps]) => ({ cls: 'alert-alarm', text: `⚠ ${instructorPatientLabel(t[pid])} · alarm: ${ps.alarm.active.join(', ')}`, open: () => drawer.show('patient', pid) })),
    ...Object.entries(st.patients).filter(([, ps]) => ps.code && !ps.code.outcome).map(([pid]) => ({ cls: 'alert-alarm', text: `✚ ${instructorPatientLabel(t[pid])} · CODING`, open: () => drawer.show('patient', pid) })),
    ...(st.rejoinRequests || []).filter((q) => q.status === 'pending').map((q) => ({ cls: 'alert-rejoin', text: `↻ ${q.name} is rejoining from another device: approve?`, open: () => drawer.show('student', q.userId) })),
  ];
  return items.length
    ? h('ul', { class: 'alerts-strip', 'aria-label': 'Alerts' }, items.map((x) => h('li', {}, h('button', { class: `alert-item ${x.cls}`, type: 'button', onclick: x.open }, x.text))))
    : h('p', { class: 'alerts-strip muted small' }, 'No call lights, alarms or rejoin requests.');
}

export function mountOverview(root, ctx) {
  const { store, runner, scenario, instructorUser: user, catalogs } = ctx;
  const clock = simClock(store, runner);
  const controls = h('div', {});
  const alerts = h('div', { 'aria-live': 'polite' });
  const cards = h('div', {});
  const drawer = createDrawer({ store, runner, scenario, catalogs, user });
  const cc = mountCommandCenter(cards, { store, runner, scenario, embedded: true,
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
    clear(alerts).append(alertsStrip(runner, drawer));
  }
  root.append(h('div', { class: 'overview' },
    h('header', { class: 'screen-header overview-bar' }, h('h2', {}, scenario.name), clock.el, helpTip('overview.status'),
      // Menu: Home and the debrief so far, kept out of the way of a running sim (Home asks first).
      h('details', { class: 'overview-menu' }, h('summary', { class: 'btn btn-small' }, 'Menu'),
        h('div', { class: 'overview-menu-list' },
          ctx.goHome ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => ctx.goHome() }, '⌂ Home (the sim keeps running)') : null,
          ctx.goDebrief ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => ctx.goDebrief() }, 'Debrief so far') : null))),
    controls, alerts, cards, more), drawer.el);
  render();
  syncMore();
  const later = coalesce(render, 250);
  const off = store.subscribe(later.run);
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
  const offKeys = installShortcuts(runner, user);
  return () => { off(); offTick(); later.cancel(); clock.destroy(); cc?.(); drawer.destroy(); offKeys(); if (moreCleanup) moreCleanup(); };
}
