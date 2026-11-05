// Tab shell: Instructor | Student 1..n | Charge | Debrief.
// Each tab is { id, label, mount(root) }. The active tab is remembered via storage.

import { h, clear } from './shared/dom.js';
import { load, save } from '../storage.js';

const TAB_KEY = 'ui.tab';

export function mountShell(root, tabs) {
  let active = load(TAB_KEY);
  if (!tabs.some((t) => t.id === active)) active = tabs[0].id;

  const bar = h('nav', { class: 'tab-bar', role: 'tablist', 'aria-label': 'Role views' });
  const panel = h('main', { class: 'tab-panel', role: 'tabpanel' });

  function render() {
    clear(bar).append(...tabs.map((t) => h('button', {
      class: `tab${t.id === active ? ' active' : ''}`,
      role: 'tab',
      id: `tab-${t.id}`,
      'aria-selected': t.id === active ? 'true' : 'false',
      onclick: () => activate(t.id),
    }, t.label)));
    panel.setAttribute('aria-labelledby', `tab-${active}`);
    tabs.find((t) => t.id === active).mount(clear(panel));
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
    ),
    bar,
    panel,
  );
  render();
}
