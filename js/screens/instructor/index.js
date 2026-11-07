// Instructor tab: Setup (wizard, then Ready) → Overview (while the sim runs) → Debrief (after End).
// The phase follows the sim's clock (ready / running or paused / ended); the phase bar lets the instructor look at
// the debrief so far, or start a new sim after one ended. Authoring (editor, library, review) lives in the Builder tab.

import { h, clear } from '../shared/dom.js';
import { load, save } from '../../storage.js';
import { canLeave } from '../shared/leave-guard.js';
import { mountSetupWizard, READY_KEY } from './setup-wizard.js';
import { mountSetupReady } from './setup-ready.js';
import { mountOverview } from './overview.js';
import { mountDebrief } from '../debrief/index.js';
import { navPush, onNav } from '../shared/nav.js';
import { mountProgramPicker } from './program-picker.js';

const PICK_KEY = 'ui.instructor.phase'; // { joinCode, status, phase }: a phase the instructor picked for this sim state
const PHASES = [['setup', 'Setup'], ['overview', 'Overview'], ['debrief', 'Debrief']];
const autoPhase = (status) => (status === 'ready' ? 'setup' : status === 'ended' ? 'debrief' : 'overview');

export function mountInstructor(root, ctx) {
  const { runner, store } = ctx;
  // First visit: pick the program once (it's remembered). A running sim never waits on this.
  if (ctx.programChosen && !ctx.programChosen() && runner.state.clock.status === 'ready' && (ctx.catalogs.programs?.programs || []).length > 1) return mountProgramPicker(root, ctx);
  const bar = h('nav', { class: 'phase-bar', 'aria-label': 'Sim phase' });
  const body = h('div', {});
  let cleanup = null;
  let shownKey = '';

  const status = () => runner.state.clock.status;
  const picked = () => { const p = load(PICK_KEY); return p && p.joinCode === runner.state.joinCode && p.status === status() ? p.phase : null; };
  const phase = () => picked() || autoPhase(status());
  const allowed = (p) => (p === 'setup' ? ['ready', 'ended'].includes(status()) : p === 'overview' ? ['running', 'paused'].includes(status()) : status() !== 'ready' || Object.keys(runner.state.roster).length > 0);

  function pick(p) {
    if (!allowed(p) || !canLeave()) return;
    if (p === 'setup' && status() === 'ended') {
      if (!window.confirm('Start setting up a new sim? This sim\'s debrief stays available until you create the next one.')) return;
      save(READY_KEY, null);
      runner.reset();
      return; // the reset re-renders (status → ready → setup)
    }
    save(PICK_KEY, { joinCode: runner.state.joinCode, status: status(), phase: p });
    render(true);
    navPush({ tab: 'instructor', view: p });
  }

  function render(force = false) {
    const p = phase();
    const setupKind = p === 'setup' ? (load(READY_KEY) === ctx.scenario.id ? 'ready' : 'wizard') : '';
    const key = `${p}|${setupKind}|${status()}`;
    clear(bar).append(...PHASES.map(([id, label], i) => h('button', {
      class: `phase-btn${id === p ? ' active' : ''}`, type: 'button', disabled: !allowed(id) && id !== p, 'aria-current': id === p ? 'step' : null,
      onclick: () => pick(id),
    }, `${i + 1}. ${id === 'setup' && status() === 'ended' ? 'New sim' : label}`)));
    if (!force && key === shownKey) return;
    shownKey = key;
    if (typeof cleanup === 'function') cleanup();
    clear(body);
    if (p === 'overview') cleanup = mountOverview(body, ctx);
    else if (p === 'debrief') cleanup = mountDebrief(body, ctx);
    else if (setupKind === 'ready') cleanup = mountSetupReady(body, ctx, { onChangeSetup: () => { save(READY_KEY, null); render(true); } });
    else cleanup = mountSetupWizard(body, ctx);
  }

  // Data problems (schema or broken references) show on every instructor phase.
  const problems = ctx.data.problems || [];
  if (problems.length) {
    root.append(h('details', { class: 'banner banner-error', role: 'alert' },
      h('summary', {}, `${problems.length} data problem${problems.length > 1 ? 's' : ''} (what was skipped or left out, and why). Details`),
      h('ul', {}, problems.map((pr) => h('li', {}, h('code', {}, pr.file), h('ul', {}, pr.errors.slice(0, 8).map((e) => h('li', {}, e))))))));
  }
  root.append(bar, body);
  render(true);
  // The clock moves the phase (Start → Overview, End → Debrief); other store changes are the views' own business.
  let lastStatus = status();
  const off = store.subscribe(() => { if (status() !== lastStatus) { lastStatus = status(); render(); } });
  const offNav = onNav((e) => { if (e.tab === 'instructor' && e.view && PHASES.some(([id]) => id === e.view) && e.view !== phase()) pick(e.view); });
  return () => { off(); offNav(); if (typeof cleanup === 'function') cleanup(); };
}
