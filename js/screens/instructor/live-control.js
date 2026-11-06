// Instructor → Live control: clock controls (+ keyboard shortcuts), Start demo sim, unit strip, call lights,
// activity, students (join code), flags, patients (adjust vitals, push order, call light, code), labs, events.

import { patientLabel } from '../shared/labels.js';
import { coalesce } from '../shared/coalesce.js';
import { openModal } from '../shared/modal.js';
import { sharedComputerButton, instructorKeys } from '../shared/shared-computer.js';
import { helpTip } from '../shared/help.js';
import { h, clear } from '../shared/dom.js';
import { simClock, elapsed } from '../shared/timer.js';
import { triageChip } from '../shared/triage-chip.js';
import { formatShiftTime } from '../../engine/time.js';
import { SPEEDS } from '../../engine/clock.js';
import { eventsPanel } from './live-events.js';
import { labsPanel } from './live-labs.js';
import { flagsPanel } from './live-flags.js';
import { rosterPanel } from './live-roster.js';
import { patientsPanel } from './live-patients.js';
import { casesPanel } from './live-cases.js';
import { scriptPanel, updateCountdowns, rebuildKeepingUi } from './live-script.js';
import { staffBoard } from '../charge/staff-board.js';
import { installShortcuts } from './shortcuts.js';
import { load, save } from '../../storage.js';

function clockControls(runner, user, startDemo) {
  const s = runner.state.clock.status;
  const btn = (label, action, enabled, cls = '') => h('button', {
    class: `btn ${cls}`, disabled: !enabled, onclick: () => runner.clock(action, user),
  }, label);
  const speed = h('select', {
    'aria-label': 'Sim speed',
    onchange: (e) => runner.clock('speed', user, Number(e.target.value)),
  }, SPEEDS.map((x) => h('option', { value: x, selected: x === runner.state.clock.speed }, `${x}x`)));

  return h('div', { class: 'controls' },
    startDemo ? h('button', { class: 'btn', title: 'Starter scenario, a joined test student, clock running', onclick: () => startDemo() }, 'Start demo sim') : null,
    btn('Start', 'start', s === 'ready', 'btn-primary'),
    btn('Pause', 'pause', s === 'running'),
    btn('Resume', 'resume', s === 'paused', 'btn-primary'),
    ...(runner.state.break ? [h('button', { class: 'btn', title: 'Move the return time 5 min later', onclick: () => runner.extendBreak(5, user) }, 'Extend break +5')]
      : [5, 10, 15].map((m) => h('button', { class: 'btn btn-small', disabled: !(s === 'running' || s === 'paused'), title: `Break for ${m} minutes`, onclick: () => runner.startBreak(m, user) }, `Break ${m}`))),
    h('button', { class: 'btn', disabled: !(s === 'running' || s === 'paused') || Boolean(runner.state.break), title: 'Pause for a break; every screen shows when you\'re back',
      onclick: () => {
        const mins = h('select', { 'aria-label': 'Break length' }, [5, 10, 15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: m === 15 }, `${m} min`)));
        openModal({ title: 'Break', body: h('label', { class: 'field' }, h('span', {}, 'How long? ', helpTip('live.break')), mins), actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Start break', kind: 'primary', onClick: () => { runner.startBreak(Number(mins.value), user); return true; } }] });
      } }, 'Break…'),
    btn('End', 'end', s === 'running' || s === 'paused', 'btn-danger'),
    h('label', { class: 'inline' }, 'Speed ', speed),
    skipButton(runner, user),
    sharedComputerButton({ who: 'the instructor', pred: instructorKeys, after: () => window.location.reload() }),
    h('button', {
      class: 'btn btn-ghost',
      onclick: () => {
        if (window.confirm('Reset the sim? This clears the clock, fired events, and the log.')) runner.reset();
      },
    }, 'Reset sim'),
  );
}

function skipButton(runner, user) {
  const s = runner.state.clock.status;
  const next = runner.nextEventMin();
  const can = (s === 'running' || s === 'paused') && next != null;
  return h('button', {
    class: 'btn',
    disabled: !can,
    title: 'Jump sim time to the next scheduled event and fire it',
    onclick: () => runner.skipToNext(user),
  }, next != null ? `Skip to next event (${formatShiftTime(runner.state.startClock, next)})` : 'Skip to next event');
}

function callLights(runner, templatesById) {
  const simMin = runner.simMin();
  const lit = Object.entries(runner.state.patients).filter(([, ps]) => ps.callLight);
  if (!lit.length) return h('p', { class: 'muted' }, 'No call lights on.');
  return h('ul', { class: 'call-lights' }, lit.map(([pid, ps]) => {
    const t = templatesById[pid];
    return h('li', { class: 'call-light-item' },
      h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
      h('strong', {}, patientLabel(t)),
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

export function mountLiveControl(root, ctx) {
  const { store, runner, scenario, instructorUser, catalogs } = ctx;
  const templatesById = runner.templates(); // demographics only here; orders come via the runner
  // Filter from the command center ({ groupId } or { patientId }); "Show all" clears it.
  let filter = load('ui.live.filter');
  const filterBar = h('div', {});
  function renderFilter() {
    const label = filter?.patientId ? patientLabel(templatesById[filter.patientId]) : filter?.groupId ? scenario.groups.find((g) => g.id === filter.groupId)?.name : null;
    clear(filterBar).append(...(label ? [h('div', { class: 'banner banner-review live-filter' }, `Showing ${label} (patients and events). `,
      h('button', { class: 'btn btn-small', onclick: () => { filter = null; save('ui.live.filter', null); renderFilter(); render(); } }, 'Show all'))] : []));
  }
  const clock = simClock(store, runner);
  const controls = h('div', {});
  const lights = h('div', {});
  const feed = h('div', {});
  const events = h('div', {});
  const labs = h('div', {});
  const flags = h('div', {});
  const roster = h('div', {});
  const patients = h('div', {});
  const cases = h('div', {});
  const scripts = h('div', {});
  const staff = h('div', {});
  const unitList = h('div', { class: 'unit-strip' });

  function render() {
    clear(controls).append(clockControls(runner, instructorUser, ctx.startDemo));
    clear(unitList).append(...unitChips(runner.state, templatesById));
    clear(lights).append(callLights(runner, templatesById));
    clear(feed).append(alertFeed(runner.state, templatesById));
    clear(events).append(eventsPanel(runner, templatesById, instructorUser, filter));
    clear(labs).append(labsPanel(runner, templatesById, instructorUser));
    clear(flags).append(flagsPanel(runner, templatesById, instructorUser));
    clear(roster).append(rosterPanel(runner, templatesById, scenario, instructorUser));
    clear(patients).append(patientsPanel(runner, templatesById, catalogs, instructorUser, filter));
    clear(cases).append(casesPanel(runner, templatesById, ctx));
    rebuildKeepingUi(scripts, () => scriptPanel(runner, runner.templates(), instructorUser, filter));
    clear(staff).append(staffBoard(runner, scenario, instructorUser, templatesById, catalogs));
  }


  root.append(
    h('header', { class: 'screen-header' }, h('h2', {}, `Live control · ${scenario.name}`), h('span', { class: 'muted small' }, 'Keys: Space pause/resume · N next event · ? help'), clock.el),
    controls,
    filterBar,
    unitList,
    h('div', { class: 'live-grid' },
      h('section', { class: 'panel' }, h('h3', {}, 'Call lights'), lights),
      h('section', { class: 'panel' }, h('h3', {}, 'Recent activity'), feed),
    ),
    h('div', { class: 'live-grid' },
      h('section', { class: 'panel' }, h('h3', {}, 'Students'), roster),
      h('section', { class: 'panel' }, h('h3', {}, 'Flags (live)'), flags),
    ),
    h('section', { class: 'panel' }, h('h3', {}, 'Patients'), patients),
    h('section', { class: 'panel' }, h('h3', {}, 'Cases (instructor only)'), cases),
    scripts,
    h('section', { class: 'panel' }, h('h3', {}, 'Staff (delegation helpers)'), staff),
    h('section', { class: 'panel' }, h('h3', {}, 'Pending labs'), labs),
    h('section', { class: 'panel' }, h('h3', {}, 'Event timeline'), events),
  );
  renderFilter();
  render();

  const later = coalesce(render, 250); // bursts of updates → one render
  const offSet = store.subscribe(later.run);
  // Call-light "lit for" times change every sim minute; refresh just that panel on ticks.
  let lastMin = -1;
  const offTick = store.on('tick', (simMin) => {
    updateCountdowns(scripts, simMin);
    if (Math.floor(simMin) !== lastMin) {
      lastMin = Math.floor(simMin);
      clear(lights).append(callLights(runner, templatesById));
      clear(flags).append(flagsPanel(runner, templatesById, instructorUser)); // time-based flags change with the clock
      clear(roster).append(rosterPanel(runner, templatesById, scenario, instructorUser)); // "Away" appears when a device goes silent
      rebuildKeepingUi(scripts, () => scriptPanel(runner, runner.templates(), instructorUser, filter)); // countdowns can start or end
    }
  });
  const offKeys = installShortcuts(runner, instructorUser);
  return () => { offKeys(); clock.destroy(); offSet(); offTick(); later.cancel(); };
}
