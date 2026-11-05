// Instructor tab: sub-views Live control | Patient library. The chosen sub-view is remembered.

import { h, clear } from '../shared/dom.js';
import { load, save } from '../../storage.js';
import { mountLibrary } from './library.js';
import { mountLiveControl } from './live-control.js';

const VIEW_KEY = 'ui.instructor.view';

export function mountInstructor(root, ctx) {
  const views = [
    { id: 'live', label: 'Live control', mount: (el) => mountLiveControl(el, ctx) },
    { id: 'library', label: 'Patient library', mount: (el) => mountLibrary(el, ctx) },
  ];
  let active = views.some((v) => v.id === load(VIEW_KEY)) ? load(VIEW_KEY) : views[0].id;
  let cleanup = null;
  const nav = h('nav', { class: 'subnav', 'aria-label': 'Instructor views' });
  const body = h('div', {});

  function render() {
    clear(nav).append(...views.map((v) => h('button', {
      class: `subnav-btn${v.id === active ? ' active' : ''}`,
      'aria-pressed': v.id === active ? 'true' : 'false',
      onclick: () => { active = v.id; save(VIEW_KEY, v.id); render(); },
    }, v.label)));
    if (typeof cleanup === 'function') cleanup();
    cleanup = views.find((v) => v.id === active).mount(clear(body));
  }

  root.append(nav, body);
  render();
  return () => { if (typeof cleanup === 'function') cleanup(); };
}
