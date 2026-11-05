import { h } from './dom.js';

/** Stand-in for a screen that a later build phase fills in. */
export function placeholder(title, phase, text) {
  return h('section', { class: 'placeholder' },
    h('h2', {}, title),
    h('p', {}, text),
    h('p', { class: 'muted' }, `Coming in build phase ${phase} (see SPEC.md §11).`),
  );
}
