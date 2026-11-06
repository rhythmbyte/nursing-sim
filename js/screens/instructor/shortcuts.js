// Instructor keyboard shortcuts on Live control: Space = pause/resume, N = skip to next event, ? = list.
// Ignored while typing in a field, while a dialog is open, or with Ctrl/Alt/Meta held.

import { h } from '../shared/dom.js';
import { openModal } from '../shared/modal.js';

export const SHORTCUTS = [['Space', 'Pause / resume the sim'], ['N', 'Skip to the next event'], ['?', 'Show these shortcuts']];

/** Pure: which action a keydown means ('toggle' | 'skip' | 'help' | null). */
export function shortcutAction({ key, ctrlKey, altKey, metaKey, target }, { dialogOpen = false } = {}) {
  if (ctrlKey || altKey || metaKey || dialogOpen) return null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return null;
  if (key === ' ' || key === 'Spacebar') return 'toggle';
  if (key === 'n' || key === 'N') return 'skip';
  if (key === '?') return 'help';
  return null;
}

/** Installs the shortcuts; returns a cleanup function. */
export function installShortcuts(runner, user) {
  const onKey = (e) => {
    const action = shortcutAction(e, { dialogOpen: Boolean(document.querySelector('dialog[open]')) });
    if (!action) return;
    e.preventDefault();
    const s = runner.state.clock.status;
    if (action === 'toggle') { if (s === 'running') runner.clock('pause', user); else if (s === 'paused') runner.clock('resume', user); }
    if (action === 'skip') runner.skipToNext(user);
    if (action === 'help') openModal({ title: 'Keyboard shortcuts', body: h('dl', { class: 'sbar' }, SHORTCUTS.map(([k, d]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, d)])), actions: [{ label: 'Close', kind: 'primary' }] });
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
