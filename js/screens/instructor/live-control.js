// Instructor → Live control (phase 2 slice): clock controls, call lights, alert feed, event timeline.
// Full live control (per-student view, ad-hoc orders, lab release, code controls) is phase 6.

import { h, clear } from '../shared/dom.js';
import { simClock, elapsed } from '../shared/timer.js';
import { triageChip } from '../shared/triage-chip.js';
import { formatShiftTime } from '../../engine/time.js';
import { SPEEDS } from '../../engine/clock.js';
import { eventsPanel } from './live-events.js';

function clockControls(runner, user) {
  const s = runner.state.clock.status;
  const btn = (label, action, enabled, cls = '') => h('button', {
    class: `btn ${cls}`, disabled: !enabled, onclick: () => runner.clock(action, user),
  }, label);
  const speed = h('select', {
    'aria-label': 'Sim speed',
    onchange: (e) => runner.clock('speed', user, Number(e.target.value)),
  }, SPEEDS.map((x) => h('option', { value: x, selected: x === runner.state.clock.speed }, `${x}x`)));

  return h('div', { class: 'controls' },
    btn('Start', 'start', s === 'ready', 'btn-primary'),
    btn('Pause', 'pause', s === 'running'),
    btn('Resume', 'resume', s === 'paused', 'btn-primary'),
    btn('End', 'end', s === 'running' || s === 'paused', 'btn-danger'),
    h('label', { class: 'inline' }, 'Speed ', speed),
    h('button', {
      class: 'btn btn-ghost',
      onclick: () => {
        if (window.confirm('Reset the sim? This clears the clock, fired events, and the log.')) runner.reset();
      },
    }, 'Reset sim'),
  );
}

function callLights(runner, templatesById) {
  const simMin = runner.simMin();
  const lit = Object.entries(runner.state.patients).filter(([, ps]) => ps.callLight);
  if (!lit.length) return h('p', { class: 'muted' }, 'No call lights on.');
  return h('ul', { class: 'call-lights' }, lit.map(([pid, ps]) => {
    const t = templatesById[pid];
    return h('li', { class: 'call-light-item' },
      h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
      h('strong', {}, `Rm ${t.demographics.room} ${t.demographics.name}`),
      ` · lit ${elapsed(simMin, ps.callLight.since)}`,
      ps.callLight.rings > 1 ? ` · rang ${ps.callLight.rings}x` : '',
      h('div', { class: 'muted' }, ps.callLight.message),
    );
  }));
}

function alertFeed(state, templatesById) {
  const recent = [...state.alerts].reverse().slice(0, 15);
  if (!recent.length) return h('p', { class: 'muted' }, 'Nothing has happened yet.');
  return h('ol', { class: 'feed' }, recent.map((a) => h('li', {},
    h('span', { class: 'feed-time' }, formatShiftTime(state.startClock, a.simMin)),
    a.patientId ? h('span', { class: 'feed-room' }, `Rm ${templatesById[a.patientId]?.demographics.room ?? '?'}`) : null,
    h('span', {}, a.message),
  )));
}

// Every patient in the sim with its LIVE tag; admissions show as "incoming" until they arrive.
function unitChips(state, templatesById) {
  return Object.entries(state.patients).map(([pid, ps]) => {
    const d = templatesById[pid].demographics;
    return h('span', { class: `unit-chip${ps.present ? '' : ' is-incoming'}` },
      triageChip(ps.tag), ` ${d.room} ${d.name}`, ps.present ? '' : ' (incoming)');
  });
}

export function mountLiveControl(root, { store, runner, templatesById, scenario, instructorUser }) {
  const clock = simClock(store, runner);
  const controls = h('div', {});
  const lights = h('div', {});
  const feed = h('div', {});
  const events = h('div', {});
  const unitList = h('div', { class: 'unit-strip' });

  function render() {
    clear(controls).append(clockControls(runner, instructorUser));
    clear(unitList).append(...unitChips(runner.state, templatesById));
    clear(lights).append(callLights(runner, templatesById));
    clear(feed).append(alertFeed(runner.state, templatesById));
    clear(events).append(eventsPanel(runner, templatesById, instructorUser));
  }


  root.append(
    h('header', { class: 'screen-header' }, h('h2', {}, `Live control · ${scenario.name}`), clock.el),
    controls,
    unitList,
    h('div', { class: 'live-grid' },
      h('section', { class: 'panel' }, h('h3', {}, 'Call lights'), lights),
      h('section', { class: 'panel' }, h('h3', {}, 'Recent activity'), feed),
    ),
    h('section', { class: 'panel' }, h('h3', {}, 'Event timeline'), events),
  );
  render();

  const offSet = store.subscribe(render);
  // Call-light "lit for" times change every sim minute; refresh just that panel on ticks.
  let lastMin = -1;
  const offTick = store.on('tick', (simMin) => {
    if (Math.floor(simMin) !== lastMin) {
      lastMin = Math.floor(simMin);
      clear(lights).append(callLights(runner, templatesById));
    }
  });
  return () => { clock.destroy(); offSet(); offTick(); };
}
