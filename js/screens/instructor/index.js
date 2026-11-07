// Instructor tab: Home (the landing screen) and the screens it opens: Sim library, Generate a sim, Custom setup (the
// wizard), Past debriefs; and the sim's own Ready → Overview (while it runs) → Debrief (after End). The clock moves
// between those three; "⌂ Home" is always one click away, except during a running sim, where it's in the Overview's
// Menu (with a confirm). Authoring (editor, library, review queue) lives in the Builder tab.

import { h, clear } from '../shared/dom.js';
import { load, save, remove } from '../../storage.js';
import { canLeave } from '../shared/leave-guard.js';
import { READY_KEY, mountSetupWizard } from './setup-wizard.js';
import { mountSetupReady } from './setup-ready.js';
import { mountOverview } from './overview.js';
import { mountDebrief } from '../debrief/index.js';
import { navPush, onNav } from '../shared/nav.js';
import { mountProgramPicker } from './program-picker.js';
import { mountHome } from './home.js';
import { mountSimLibrary } from './sim-library.js';
import { mountGeneratePanel } from './generate-panel.js';
import { mountPastDebriefs } from './past-debriefs.js';

const SCREEN_KEY = 'ui.instructor.screen'; // { screen, joinCode, status, past? }: what the instructor picked for this sim state
const TITLES = { home: 'Home', library: 'Saved sims', generate: 'Generate a sim', custom: 'Custom setup', past: 'Past debriefs', ready: 'Ready', overview: 'Overview', debrief: 'Debrief' };
const SIM_SCREENS = ['ready', 'overview', 'debrief'];

export function mountInstructor(root, ctx) {
  const { runner, store } = ctx;
  // First visit: pick the program once (it's remembered). A running sim never waits on this.
  if (ctx.programChosen && !ctx.programChosen() && runner.state.clock.status === 'ready' && (ctx.catalogs.programs?.programs || []).length > 1) return mountProgramPicker(root, ctx);
  const bar = h('nav', { class: 'top-nav', 'aria-label': 'Instructor' });
  const body = h('div', {});
  let cleanup = null;
  let shownKey = '';

  const status = () => runner.state.clock.status;
  const live = () => ['running', 'paused'].includes(status());
  const readyHere = () => status() === 'ready' && load(READY_KEY) === ctx.scenario.id;
  const auto = () => (live() ? 'overview' : status() === 'ended' ? 'debrief' : readyHere() ? 'ready' : 'home');
  const picked = () => { const p = load(SCREEN_KEY); return p && p.joinCode === runner.state.joinCode && p.status === status() ? p : null; };
  const screen = () => picked()?.screen || auto();
  const allowed = (s) => (s === 'overview' ? live() : s === 'ready' ? readyHere() : s === 'debrief' ? status() !== 'ready' || Object.keys(runner.state.roster).length > 0 : true);

  function go(s, past = null) {
    if (!allowed(s) || !canLeave()) return;
    save(SCREEN_KEY, { screen: s, joinCode: runner.state.joinCode, status: status(), ...(past ? { past } : {}) });
    render(true);
    navPush({ tab: 'instructor', view: s });
    window.scrollTo(0, 0);
  }
  const goHomeConfirmed = () => { if (window.confirm('Go to Home? The sim keeps running; the Overview is one click away from Home (Resume).')) go('home'); };

  function render(force = false) {
    const s = screen();
    const past = picked()?.past || null;
    const key = `${s}|${status()}|${readyHere()}|${past}`;
    // Top bar: Home (not during a running sim: that's in the Overview's Menu), where you are, and the sim's own screens.
    clear(bar).append(
      live() && s === 'overview' ? null : h('button', { class: `btn btn-small nav-home${s === 'home' ? ' active' : ''}`, type: 'button', onclick: () => (live() ? goHomeConfirmed() : go('home')) }, '⌂ Home'),
      h('span', { class: 'nav-title' }, TITLES[s]),
      ...SIM_SCREENS.filter((x) => allowed(x)).map((x) => h('button', { class: `phase-btn${x === s ? ' active' : ''}`, type: 'button', 'aria-current': x === s ? 'page' : null, onclick: () => go(x) }, TITLES[x])));
    if (!force && key === shownKey) return;
    shownKey = key;
    if (typeof cleanup === 'function') cleanup();
    clear(body);
    if (s === 'overview') cleanup = mountOverview(body, { ...ctx, goHome: goHomeConfirmed, goDebrief: () => go('debrief') });
    else if (s === 'debrief') cleanup = mountDebrief(body, ctx);
    else if (s === 'ready') cleanup = mountSetupReady(body, ctx, { onChangeSetup: () => { save(READY_KEY, null); go('custom'); } });
    else if (s === 'library') cleanup = mountSimLibrary(body, ctx, { onEdit: () => go('custom') });
    else if (s === 'generate') cleanup = mountGeneratePanel(body, ctx);
    else if (s === 'custom') cleanup = mountSetupWizard(body, ctx, { onSaved: () => save(SCREEN_KEY, { screen: 'library', joinCode: runner.state.joinCode, status: status() }) });
    else if (s === 'past') cleanup = mountPastDebriefs(body, ctx, { openId: past, onOpen: (id) => save(SCREEN_KEY, { screen: 'past', joinCode: runner.state.joinCode, status: status(), ...(id ? { past: id } : {}) }) });
    else cleanup = mountHome(body, ctx, { go, resume: live() ? () => go('overview') : readyHere() ? () => go('ready') : null, resumeLabel: live() ? `Sim ${status()} · join code ${runner.state.joinCode}` : readyHere() ? `Ready to start · join code ${runner.state.joinCode}` : '' });
  }

  // Data problems (schema or broken references) show on every instructor screen.
  const problems = ctx.data.problems || [];
  if (problems.length) {
    root.append(h('details', { class: 'banner banner-error', role: 'alert' },
      h('summary', {}, `${problems.length} data problem${problems.length > 1 ? 's' : ''} (what was skipped or left out, and why). Details`),
      h('ul', {}, problems.map((pr) => h('li', {}, h('code', {}, pr.file), h('ul', {}, pr.errors.slice(0, 8).map((e) => h('li', {}, e))))))));
  }
  // The Builder's Home button lands here.
  if (load('ui.instructor.goHome')) { remove('ui.instructor.goHome'); save(SCREEN_KEY, { screen: 'home', joinCode: runner.state.joinCode, status: status() }); }
  root.append(bar, body);
  render(true);
  // The clock moves the sim's screens (Start → Overview, End → Debrief); other store changes are the screens' own.
  let lastStatus = status();
  const off = store.subscribe(() => { if (status() !== lastStatus) { lastStatus = status(); render(); } });
  const offNav = onNav((e) => { if (e.tab === 'instructor' && e.view && TITLES[e.view] && e.view !== screen()) go(e.view); });
  return () => { off(); offNav(); if (typeof cleanup === 'function') cleanup(); };
}
