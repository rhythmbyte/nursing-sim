// Instructor tab, first visit: "Which program do you teach?" (RN, LPN…). Picked once and remembered; the header's
// Program selector changes it later. The program sets what new sims default to and what the screens offer.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';

export function mountProgramPicker(root, { catalogs, chooseProgram, setProgram, startDemo }) {
  const programs = catalogs.programs?.programs || [];
  root.append(h('section', { class: 'program-picker' },
    h('h2', {}, 'Which program do you teach? ', helpTip('program.choose')),
    h('p', { class: 'muted' }, 'This sets the defaults for your sims and keeps the screens to what your program uses. You can change it any time from Program at the top.'),
    h('div', { class: 'program-cards' }, programs.map((p) => h('button', { class: 'panel program-card', type: 'button', onclick: () => chooseProgram(p.id) },
      h('h3', {}, p.label), h('p', {}, p.description || ''), p.review === 'proposed' ? h('span', { class: 'muted small' }, 'Draft settings (awaiting instructor review)') : null))),
    startDemo ? h('p', {}, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { setProgram(catalogs.programs.default); startDemo(); } }, `Just looking? Start the demo sim (${programs.find((p) => p.id === catalogs.programs.default)?.label || 'default program'})`)) : null));
  return () => {};
}
