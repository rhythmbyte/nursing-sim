// Student tab: "Join sim" (code + name) until the student is on the roster, then their home.
// Prototype: each tab stands in for one student's device.

import { h, clear } from '../shared/dom.js';
import { mountStudentHome } from './home.js';

export function mountStudentTab(root, ctx) {
  const { store, runner, user } = ctx;
  let cleanup = null;
  let joined = null;

  function render() {
    const entry = runner.state.roster[user.userId];
    if (entry && joined) return;
    if (cleanup) cleanup();
    cleanup = null;
    if (entry) {
      joined = entry;
      cleanup = mountStudentHome(clear(root), { ...ctx, user: { ...user, name: entry.name }, groupId: entry.groupId });
      return;
    }
    joined = null;
    const code = h('input', { class: 'input', name: 'code', autocomplete: 'off', placeholder: 'e.g. K7Q2ZP', 'aria-label': 'Join code' });
    const name = h('input', { class: 'input', name: 'name', autocomplete: 'name', 'aria-label': 'Your name' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    clear(root).append(h('section', { class: 'panel join-panel' },
      h('h2', {}, 'Join sim'),
      h('p', { class: 'muted' }, 'Enter the code your instructor shows and your name.'),
      h('form', {
        class: 'iv-form',
        onsubmit: (e) => {
          e.preventDefault();
          const error = runner.join(user.userId, name.value, code.value);
          err.textContent = error || '';
        },
      },
        h('label', { class: 'field' }, h('span', {}, 'Join code'), code),
        h('label', { class: 'field' }, h('span', {}, 'Your name'), name),
        err,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Join'),
      ),
    ));
  }

  render();
  const off = store.subscribe(render);
  return () => { off(); if (cleanup) cleanup(); };
}
