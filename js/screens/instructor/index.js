// Instructor tab: Live control | Sim setup | Review queue | Patient editor | Patient library.
// The chosen sub-view (and the patient open in the editor) is remembered.

import { navPush, onNav } from '../shared/nav.js';
import { h, clear } from '../shared/dom.js';
import { load, save } from '../../storage.js';
import { canLeave } from '../shared/leave-guard.js';
import { mountLibrary } from './library.js';
import { mountLiveControl } from './live-control.js';
import { mountReviewQueue } from './review-queue.js';
import { mountPatientEditor } from './patient-editor.js';
import { mountSimSetup } from './sim-setup.js';
import { mountCommandCenter } from './command-center.js';
import { loadSession, saveSession } from '../../storage.js';

const VIEW_KEY = 'ui.instructor.view';

export function mountInstructor(root, ctx) {
  const EDITOR_KEY = 'ui.instructor.editorPatient';
  const editorTarget = { get: () => load(EDITOR_KEY), set: (id) => save(EDITOR_KEY, id) };
  const openEditor = (id) => { editorTarget.set(id); active = 'editor'; save(VIEW_KEY, active); render(); };
  // Command center → Live control with a group or patient filter (shown in Live control with "Show all").
  const openLive = (filter) => { if (!canLeave()) return; save('ui.live.filter', filter); active = 'live'; save(VIEW_KEY, active); save('ui.instructor.chosenFor', ctx.runner.state.joinCode); render(); };
  const vctx = { ...ctx, editorTarget, openEditor, openLive };
  const views = [
    { id: 'command', label: 'Command center', mount: (el) => mountCommandCenter(el, vctx) },
    { id: 'live', label: 'Live control', mount: (el) => mountLiveControl(el, vctx) },
    { id: 'setup', label: 'Sim setup', mount: (el) => mountSimSetup(el, vctx) },
    { id: 'review', label: 'Review queue', mount: (el) => mountReviewQueue(el, vctx) },
    { id: 'editor', label: 'Patient editor', mount: (el) => mountPatientEditor(el, vctx) },
    { id: 'library', label: 'Patient library', mount: (el) => mountLibrary(el, vctx) },
  ];
  let active = views.some((v) => v.id === load(VIEW_KEY)) ? load(VIEW_KEY) : 'live';
  // While a sim is in progress the command center is the default, until the instructor picks a view in THIS sim
  // (remembered per sim in storage, so a reload, crash or rejoin comes back to the same view).
  const chosenHere = () => load('ui.instructor.chosenFor') === ctx.runner.state.joinCode;
  if (['running', 'paused'].includes(ctx.runner.state.clock.status) && !chosenHere()) active = 'command';
  let cleanup = null;
  const nav = h('nav', { class: 'subnav', 'aria-label': 'Instructor views' });
  const body = h('div', {});

  function render() {
    clear(nav).append(...views.map((v) => h('button', {
      class: `subnav-btn${v.id === active ? ' active' : ''}`,
      'aria-pressed': v.id === active ? 'true' : 'false',
      onclick: () => { if (v.id === active || !canLeave()) return; active = v.id; save(VIEW_KEY, v.id); save('ui.instructor.chosenFor', ctx.runner.state.joinCode); if (v.id === 'live') save('ui.live.filter', null); render(); navPush({ tab: 'instructor', view: v.id }); },
    }, v.label)));
    if (typeof cleanup === 'function') cleanup();
    cleanup = views.find((v) => v.id === active).mount(clear(body));
  }

  // Data problems (schema or broken references) show on every instructor view, not just the library.
  const problems = ctx.data.problems || [];
  if (problems.length) {
    root.append(h('details', { class: 'banner banner-error', role: 'alert' },
      h('summary', {}, `${problems.length} data problem${problems.length > 1 ? 's' : ''} (what was skipped or left out, and why). Details`),
      h('ul', {}, problems.map((p) => h('li', {}, h('code', {}, p.file), h('ul', {}, p.errors.slice(0, 8).map((e) => h('li', {}, e))))))));
  }
  root.append(nav, body);
  render();
  const offNav = onNav((e) => { if (e.tab === 'instructor' && e.view && e.view !== active && views.some((v) => v.id === e.view) && canLeave()) { active = e.view; save(VIEW_KEY, active); render(); } });
  return () => { offNav(); if (typeof cleanup === 'function') cleanup(); };
}
