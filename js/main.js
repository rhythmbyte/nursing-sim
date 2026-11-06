// Boots the app: load + validate data, pick a scenario, create the store and runner, mount the tab shell.
// The tick timer lives here (UI layer) so the engine stays timer-free.

import { loadAll } from './data-loader.js';
import { createStore } from './state.js';
import { load, save, remove } from './storage.js';
import { createRunner } from './engine/runner.js';
import { studentSlots } from './engine/assignment.js';
import { mountShell } from './screens/shell.js';
import { mountInstructor } from './screens/instructor/index.js';
import { mountStudentHome } from './screens/student/home.js';
import { placeholder } from './screens/shared/placeholder.js';
import { mountDebrief } from './screens/debrief/index.js';
import { h } from './screens/shared/dom.js';

const TICK_MS = 250;
const SCENARIO_KEY = 'ui.scenario';
const SESSION_KEY = 'session';
const HEARTBEAT_KEY = 'heartbeat';
const HEARTBEAT_MS = 5000;

// Prototype identities. Full build: these come from the logged-in user (SPEC §13).
const INSTRUCTOR = { userId: 'instructor', role: 'instructor', name: 'Instructor' };
const studentUser = (n) => ({ userId: `student-${n}`, role: 'student', name: `Student ${n}` });

function buildTabs(ctx) {
  const tabs = [{ id: 'instructor', label: 'Instructor', mount: (root) => mountInstructor(root, ctx) }];

  for (const slot of studentSlots(ctx.scenario)) {
    tabs.push({
      id: `student-${slot.slot}`,
      label: `Student ${slot.slot}`,
      mount: (root) => mountStudentHome(root, { ...ctx, slot, user: studentUser(slot.slot) }),
    });
  }

  if (ctx.scenario.settings.chargeNurse !== 'off') {
    tabs.push({
      id: 'charge',
      label: 'Charge',
      mount: (root) => { root.append(placeholder('Charge nurse', 7, 'Unit overview and the admissions board.')); },
    });
  }

  tabs.push({
    id: 'debrief',
    label: 'Debrief',
    mount: (root) => mountDebrief(root, ctx),
  });
  return tabs;
}

function scenarioPicker(scenarios, currentId, onChange) {
  return h('label', { class: 'inline' }, 'Scenario ',
    h('select', { 'aria-label': 'Scenario', onchange: (e) => onChange(e.target.value, e.target) },
      scenarios.map((s) => h('option', { value: s.id, selected: s.id === currentId }, s.name))));
}

/** Mounts the whole app for one scenario. Returns a teardown function. */
function startApp(root, data, scenarioId, restart) {
  const scenario = data.scenarios.find((s) => s.id === scenarioId) || data.scenarios[0];
  const templatesById = Object.fromEntries(data.patients.map((p) => [p.id, p]));
  const store = createStore({ data });
  const runner = createRunner({
    store, scenario, templatesById, catalogs: data.catalogs,
    saved: load(SESSION_KEY),
    persist: (s) => save(SESSION_KEY, s),
  });

  const ctx = { store, runner, data, scenario, templatesById, catalogs: data.catalogs, instructorUser: INSTRUCTOR };
  const picker = scenarioPicker(data.scenarios, scenario.id, (id, select) => {
    const started = runner.state.clock.status !== 'ready';
    if (started && !window.confirm('Switching scenario ends and clears the current sim. Continue?')) {
      select.value = scenario.id;
      return;
    }
    save(SCENARIO_KEY, id);
    remove(SESSION_KEY);
    restart(id);
  });

  // Pause-on-close (scenario setting, default on). On boot, a sim still "running" means the page
  // closed without warning (crash/freeze): pause it as of the last heartbeat.
  runner.pauseForClose(load(HEARTBEAT_KEY));
  const onPageHide = () => runner.pauseForClose(Date.now());
  window.addEventListener('pagehide', onPageHide);
  const heartbeat = setInterval(() => save(HEARTBEAT_KEY, Date.now()), HEARTBEAT_MS);
  save(HEARTBEAT_KEY, Date.now());

  const teardownShell = mountShell(root, buildTabs(ctx), { headerExtra: picker });
  const timer = setInterval(() => runner.tick(), TICK_MS);
  runner.tick();
  return () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    window.removeEventListener('pagehide', onPageHide);
    teardownShell();
  };
}

async function boot() {
  const root = document.getElementById('app');
  try {
    const data = await loadAll();
    if (data.problems.length) console.warn('Data validation problems:', data.problems);
    if (!data.scenarios.length) throw new Error('No valid scenarios loaded.');
    let teardown = null;
    const restart = (id) => {
      if (teardown) teardown();
      teardown = startApp(root, data, id, restart);
    };
    restart(load(SCENARIO_KEY));
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('div', { class: 'banner banner-error', role: 'alert' },
      h('strong', {}, 'Could not load sim data. '),
      String(err.message || err),
      h('p', { class: 'muted' }, 'If you opened index.html from disk, serve the folder instead (e.g. python3 -m http.server).'),
    ));
  }
}

boot();
