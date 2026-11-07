// Setup (before a sim): three ways to start. Sim library (saved sims with a Ready badge; the default), Generate a sim
// (size and difficulty → a checked sim), or Build step by step (the wizard). The choice is remembered.

import { h, clear } from '../shared/dom.js';
import { load, save } from '../../storage.js';
import { mountSimLibrary } from './sim-library.js';
import { mountGeneratePanel } from './generate-panel.js';
import { mountSetupWizard } from './setup-wizard.js';

const MODE_KEY = 'ui.setup.mode';
const MODES = [['library', 'Sim library'], ['generate', 'Generate a sim'], ['build', 'Build step by step']];

export function mountSetupHome(root, ctx) {
  let mode = MODES.some(([id]) => id === load(MODE_KEY)) ? load(MODE_KEY) : 'library';
  let cleanup = null;
  const bar = h('div', { class: 'mode-bar', role: 'tablist', 'aria-label': 'How to start' });
  const body = h('div', {});
  function render() {
    clear(bar).append(...MODES.map(([id, label]) => h('button', { class: `mode-btn${id === mode ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(id === mode), onclick: () => { if (id !== mode) { mode = id; save(MODE_KEY, id); render(); } } }, label)));
    if (typeof cleanup === 'function') cleanup();
    clear(body);
    cleanup = mode === 'library' ? mountSimLibrary(body, ctx, { onEdit: () => { mode = 'build'; save(MODE_KEY, mode); render(); } })
      : mode === 'generate' ? mountGeneratePanel(body, ctx)
        : mountSetupWizard(body, ctx);
  }
  root.append(h('header', { class: 'screen-header' }, h('h2', {}, 'Start a sim'),
    ctx.startDemo ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => ctx.startDemo() }, 'Start demo sim') : null), bar, body);
  render();
  return () => { if (typeof cleanup === 'function') cleanup(); };
}
