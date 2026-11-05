// Tab shell: Instructor | Student 1..n | Charge | Debrief.
// Each tab is { id, label, mount(root) → cleanup? }. A tab's cleanup (e.g. store unsubscribes)
// runs before the next tab mounts. The active tab is remembered via storage.
// Returns a teardown function.

import { h, clear } from './shared/dom.js';
import { load, save } from '../storage.js';

const TAB_KEY = 'ui.tab';

export function mountShell(root, tabs, { headerExtra = null } = {}) {
  let active = load(TAB_KEY);
  if (!tabs.some((t) => t.id === active)) active = tabs[0].id;
  let cleanup = null;

  const bar = h('nav', { class: 'tab-bar', role: 'tablist', 'aria-label': 'Role views' });
  const panel = h('main', { class: 'tab-panel', role: 'tabpanel' });

  function runCleanup() {
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
  }

  function render() {
    clear(bar).append(...tabs.map((t) => h('button', {
      class: `tab${t.id === active ? ' active' : ''}`,
      role: 'tab',
      id: `tab-${t.id}`,
      'aria-selected': t.id === active ? 'true' : 'false',
      onclick: () => activate(t.id),
    }, t.label)));
    panel.setAttribute('aria-labelledby', `tab-${active}`);
    runCleanup();
    cleanup = tabs.find((t) => t.id === active).mount(clear(panel));
  }

  function activate(id) {
    active = id;
    save(TAB_KEY, id);
    render();
  }

  clear(root).append(
    h('header', { class: 'app-header' },
      h('h1', {}, 'Nursing Sim'),
      h('span', { class: 'muted' }, 'Prototype · every role in one page'),
      headerExtra ? h('div', { class: 'header-extra' }, headerExtra) : null,
    ),
    bar,
    panel,
  );
  render();
  return runCleanup;
}
