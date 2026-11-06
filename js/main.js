// Boots the app: load + validate data, pick a scenario, create the store and runner, mount the tab shell.
// The tick timer lives here (UI layer) so the engine stays timer-free.

import { loadAll } from './data-loader.js';
import { createStore } from './state.js';
import { load, save, remove, clearAll, loadSession, saveSession, onSaveFailure } from './storage.js';
import { openModal } from './screens/shared/modal.js';
import { createRunner } from './engine/runner.js';
import { studentSlots } from './engine/assignment.js';
import { withDefaults } from './engine/settings.js';
import { mountShell } from './screens/shell.js';
import { mountInstructor } from './screens/instructor/index.js';
import { mountStudentTab } from './screens/student/join.js';
import { mountDebrief } from './screens/debrief/index.js';
import { mountCharge } from './screens/charge/index.js';
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

  // Prototype: one tab per student slot; each tab joins with the code like a real device would.
  for (const slot of studentSlots(ctx.scenario)) {
    tabs.push({
      id: slot.userId,
      label: `Student ${slot.slot}`,
      mount: (root) => mountStudentTab(root, { ...ctx, user: studentUser(slot.slot) }),
    });
  }

  if (ctx.scenario.settings.chargeNurse !== 'off') {
    tabs.push({
      id: 'charge',
      label: 'Charge',
      mount: (root) => mountCharge(root, ctx),
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
function startApp(root, data, scenarioId, restart, reloadData, { pageLoad = false } = {}) {
  // Settings merged with data/catalogs/scenario-defaults.json once, so engine and screens agree.
  const scenario = withDefaults(data.scenarios.find((s) => s.id === scenarioId) || data.scenarios[0], data.catalogs);
  const templatesById = Object.fromEntries(data.patients.map((p) => [p.id, p]));
  const store = createStore({ data });
  const runner = createRunner({
    store, scenario, templatesById, catalogs: data.catalogs,
    saved: load(SESSION_KEY),
    persist: (s) => save(SESSION_KEY, s),
  });

  // switchScenario: used by the scenario picker and by Sim setup after creating a sim.
  const switchScenario = async (id) => {
    save(SCENARIO_KEY, id);
    remove(SESSION_KEY);
    await reloadData(id);
  };
  // Start demo sim: starter scenario, fresh session, a joined test student, clock running (ui.json demo).
  const startDemo = async () => {
    const demo = data.catalogs.ui?.demo;
    if (!demo) return;
    if (runner.state.clock.status !== 'ready' && !window.confirm('Start a fresh demo sim? This clears the current sim.')) return;
    saveSession('pendingDemo', true);
    await switchScenario(data.scenarios.some((s) => s.id === demo.scenarioId) ? demo.scenarioId : data.scenarios[0].id);
  };
  const ctx = { store, runner, data, scenario, templatesById, catalogs: data.catalogs, instructorUser: INSTRUCTOR, reloadData: () => reloadData(scenario.id), switchScenario, startDemo };
  const picker = scenarioPicker(data.scenarios, scenario.id, (id, select) => {
    const started = runner.state.clock.status !== 'ready';
    if (started && !window.confirm('Switching scenario ends and clears the current sim. Continue?')) {
      select.value = scenario.id;
      return;
    }
    switchScenario(id);
  });

  // Pause-on-close (scenario setting, default on). On boot, a sim still "running" means the page
  // closed without warning (crash/freeze): pause it as of the last heartbeat.
  // Only at a real page load: an in-page remount (after an edit, approval or new sim) must not pause or rewind.
  if (pageLoad) runner.pauseForClose(load(HEARTBEAT_KEY));
  if (loadSession('pendingDemo', false)) {
    saveSession('pendingDemo', false);
    const demo = data.catalogs.ui.demo;
    const err = runner.join(demo.studentUserId, demo.studentName, runner.state.joinCode);
    if (err) console.warn('Demo student could not join:', err);
    runner.clock('start', INSTRUCTOR);
  }
  const onPageHide = () => runner.pauseForClose(Date.now());
  window.addEventListener('pagehide', onPageHide);
  const heartbeat = setInterval(() => save(HEARTBEAT_KEY, Date.now()), HEARTBEAT_MS);
  save(HEARTBEAT_KEY, Date.now());

  // Reset demo: clears this browser's sim, edits, approvals and created sims, then reloads the page.
  const resetDemo = h('button', {
    class: 'btn btn-ghost btn-small',
    onclick: () => {
      if (!window.confirm('Reset the demo? This clears the running sim and every edit, approval and sim created in this browser.')) return;
      // Stop everything that writes to storage first, so nothing re-saves between clear and reload.
      clearInterval(timer);
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', onPageHide);
      clearAll();
      window.location.reload();
    },
  }, 'Reset demo');
  const teardownShell = mountShell(root, buildTabs(ctx), { headerExtra: h('div', { class: 'controls' }, picker, resetDemo) });
  const timer = setInterval(() => runner.tick(), TICK_MS);
  runner.tick();
  return () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    window.removeEventListener('pagehide', onPageHide);
    teardownShell();
  };
}

// PROTOTYPE ONLY (remove in the full build, SPEC §13): welcome popup, once per browser session.
// Text comes from data/catalogs/ui.json. Esc or the button closes it.
function showWelcome(welcome) {
  if (!welcome || loadSession('welcomeShown', false)) return;
  saveSession('welcomeShown', true);
  openModal({
    title: welcome.title,
    body: welcome.subtitle ? h('p', { class: 'welcome-sub' }, welcome.subtitle) : h('span', {}),
    actions: [{ label: welcome.button, kind: 'primary' }],
  });
}

// Visible warning when the browser can't save (storage full or blocked). Stays until dismissed;
// repeated failures update it instead of stacking.
function watchSaveFailures() {
  let banner = null;
  onSaveFailure(({ key, error }) => {
    const full = /quota/i.test(`${error?.name} ${error?.message}`);
    const text = full
      ? 'This browser\'s storage is full, so the sim is NOT being saved. Export what you need, then use Reset demo to free space.'
      : `This browser isn't letting the sim save (${error?.message || 'storage blocked'}). A reload will lose the current sim.`;
    if (!banner || !banner.isConnected) {
      banner = h('div', { class: 'banner banner-error save-warning', role: 'alert' },
        h('strong', {}, 'Not saved. '), h('span', { class: 'msg' }, text), ' ',
        h('button', { class: 'btn btn-small', onclick: () => banner.remove() }, 'Dismiss'));
      document.body.prepend(banner);
    } else banner.querySelector('.msg').textContent = text;
    banner.dataset.key = key;
  });
}

async function boot() {
  watchSaveFailures();
  const root = document.getElementById('app');
  try {
    let data = await loadAll();
    if (data.problems.length) console.warn('Data validation problems:', data.problems);
    if (!data.scenarios.length) throw new Error('No valid scenarios loaded.');
    let teardown = null;
    // Re-read files + this browser's edits (after editor saves, approvals, new sims), then remount.
    const reloadData = async (id) => {
      // Stop the current app (tick timer, heartbeat) first, so it can't re-save the old session while loading.
      if (teardown) { teardown(); teardown = null; }
      data = await loadAll();
      restart(id);
    };
    const restart = (id, opts) => {
      if (teardown) teardown();
      teardown = startApp(root, data, id, restart, reloadData, opts);
    };
    restart(load(SCENARIO_KEY), { pageLoad: true });
    showWelcome(data.catalogs.ui?.welcome);
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
