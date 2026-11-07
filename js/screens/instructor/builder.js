// Builder tab: preparing cases before class. Patient editor (with case templates, scripts, reaction templates,
// patient tags), Patient library (catalogs, tags, assessment tools) and Review queue. Hidden while a sim runs.
// The chosen view (and the patient open in the editor) is remembered.

import { navPush, onNav } from '../shared/nav.js';
import { h, clear } from '../shared/dom.js';
import { load, save } from '../../storage.js';
import { canLeave } from '../shared/leave-guard.js';
import { mountLibrary } from './library.js';
import { mountReviewQueue } from './review-queue.js';
import { mountPatientEditor } from './patient-editor.js';

const VIEW_KEY = 'ui.builder.view';
const EDITOR_KEY = 'ui.instructor.editorPatient';

export function mountBuilder(root, ctx) {
  const editorTarget = { get: () => load(EDITOR_KEY), set: (id) => save(EDITOR_KEY, id) };
  const openEditor = (id) => { editorTarget.set(id); active = 'editor'; save(VIEW_KEY, active); render(); };
  const vctx = { ...ctx, editorTarget, openEditor };
  const views = [
    { id: 'editor', label: 'Patient editor', mount: (el) => mountPatientEditor(el, vctx) },
    { id: 'library', label: 'Patient library', mount: (el) => mountLibrary(el, vctx) },
    { id: 'review', label: 'Review queue', mount: (el) => mountReviewQueue(el, vctx) },
  ];
  let active = views.some((v) => v.id === load(VIEW_KEY)) ? load(VIEW_KEY) : 'library';
  let cleanup = null;
  const nav = h('nav', { class: 'subnav', 'aria-label': 'Builder views' });
  const body = h('div', {});
  function render() {
    clear(nav).append(...views.map((v) => h('button', {
      class: `subnav-btn${v.id === active ? ' active' : ''}`, 'aria-pressed': v.id === active ? 'true' : 'false',
      onclick: () => { if (v.id === active || !canLeave()) return; active = v.id; save(VIEW_KEY, v.id); render(); navPush({ tab: 'builder', view: v.id }); },
    }, v.label)));
    if (typeof cleanup === 'function') cleanup();
    cleanup = views.find((v) => v.id === active).mount(clear(body));
  }
  root.append(h('p', { class: 'muted small builder-note' }, 'Builder: prepare cases before class. It closes while a sim is running.'), nav, body);
  render();
  const offNav = onNav((e) => { if (e.tab === 'builder' && e.view && e.view !== active && views.some((v) => v.id === e.view) && canLeave()) { active = e.view; save(VIEW_KEY, active); render(); } });
  return () => { offNav(); if (typeof cleanup === 'function') cleanup(); };
}
