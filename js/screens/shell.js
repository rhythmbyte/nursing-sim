// Tab shell: Instructor | Builder | Student 1..n | Charge.
// Each tab is { id, label, mount(root) → cleanup?, visible?() }. A tab's cleanup (e.g. store unsubscribes)
// runs before the next tab mounts. The active tab is remembered via storage. A tab whose visible() is false is
// hidden (Builder while a sim runs); refresh() re-checks, moving off a tab that just became hidden.
// Returns a teardown function with .refresh().

import { navPush, onNav, installNav } from './shared/nav.js';
import { h, clear } from './shared/dom.js';
import { load, save } from '../storage.js';
import { canLeave } from './shared/leave-guard.js';

const TAB_KEY = 'ui.tab';

export function mountShell(root, tabs, { headerExtra = null, banner = null } = {}) {
  const shown = () => tabs.filter((t) => !t.visible || t.visible());
  let active = load(TAB_KEY);
  if (!shown().some((t) => t.id === active)) active = shown()[0].id;
  let cleanup = null;

  const bar = h('nav', { class: 'tab-bar', role: 'tablist', 'aria-label': 'Role views' });
  const panel = h('main', { class: 'tab-panel', role: 'tabpanel' });

  function runCleanup() {
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
  }

  function renderBar() {
    clear(bar).append(...shown().map((t) => h('button', {
      class: `tab${t.id === active ? ' active' : ''}`,
      role: 'tab',
      id: `tab-${t.id}`,
      'aria-selected': t.id === active ? 'true' : 'false',
      onclick: () => { if (t.id !== active && canLeave()) { activate(t.id); navPush({ tab: t.id, view: null, patient: null, section: null }); } },
    }, t.label)));
  }
  function render() {
    renderBar();
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
    banner, // e.g. the break banner, on every tab
    bar,
    panel,
  );
  render();
  // Back / Forward between tabs (shared/nav.js); the in-tab parts handle their own entries.
  const offNav = onNav((e) => { if (e.tab && e.tab !== active && tabs.some((t) => t.id === e.tab)) activate(e.tab); });
  installNav({ tab: active });
  const teardown = () => { offNav(); runCleanup(); };
  teardown.refresh = () => { if (!shown().some((t) => t.id === active)) activate(shown()[0].id); else renderBar(); };
  return teardown;
}
