// Instructor → Home: the landing screen. Big, clear choices in three groups and a Recent list.
//   Run a sim: Resume sim in progress (only if one exists), Start a saved sim, Generate a sim, Custom setup
//   Build: Create a patient, Edit patients, Create a sim, Edit saved sims (the Builder or the library at the right place)
//   Review: Past debriefs, Review queue
//   Recent: sims run or set up, patients edited, debriefs opened (one click each)

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { recentItems } from '../../recent.js';
import { pastDebriefs } from '../../archive.js';

const STATUS = { running: 'running', paused: 'paused', ready: 'ready to start' };

export function mountHome(root, ctx, { go, resume, resumeLabel }) {
  const { runner, data } = ctx;
  const status = runner.state.clock.status;
  const running = status === 'running' || status === 'paused';
  const card = (label, sub, onclick, { primary = false, disabled = false, title = '' } = {}) => h('button', { class: `home-card${primary ? ' home-primary' : ''}`, type: 'button', disabled, title, onclick }, h('strong', {}, label), sub ? h('span', {}, sub) : null);
  const builderNote = running ? 'Closed while a sim runs' : '';
  const recent = recentItems();
  const openRecent = (x) => {
    if (x.kind === 'patient') { if (!running) ctx.openBuilder({ view: 'editor', patientId: x.id }); }
    else if (x.kind === 'debrief') go('past', x.id);
    else go('library');
  };
  root.append(h('div', { class: 'home' },
    h('header', { class: 'screen-header' }, h('h2', {}, 'Home'), helpTip('home.about'), data.program ? h('span', { class: 'muted' }, data.program.label) : null),
    h('section', { class: 'home-group' }, h('h3', {}, 'Run a sim'),
      h('div', { class: 'home-cards' },
        resume ? card(`Resume: ${ctx.scenario.name}`, resumeLabel || `Sim ${STATUS[status] || status}`, resume, { primary: true }) : null,
        card('Start a saved sim', 'Pick a ready sim; start in two clicks', () => go('library'), { primary: !resume }),
        card('Generate a sim', 'Say how many students and how hard', () => go('generate')),
        card('Custom setup', 'Every choice, step by step', () => go('custom')))),
    h('section', { class: 'home-group' }, h('h3', {}, 'Build'),
      h('div', { class: 'home-cards' },
        card('Create a patient', builderNote || 'A new case in the patient editor', () => ctx.openBuilder({ view: 'editor', newPatient: true }), { disabled: running }),
        card('Edit patients', builderNote || 'The patient library and editor', () => ctx.openBuilder({ view: 'library' }), { disabled: running }),
        card('Create a sim', 'Build one and save it for later', () => go('custom')),
        card('Edit saved sims', 'Edit, duplicate, rename or delete', () => go('library')))),
    h('section', { class: 'home-group' }, h('h3', {}, 'Review'),
      h('div', { class: 'home-cards' },
        card('Past debriefs', `${pastDebriefs().length} finished sim${pastDebriefs().length === 1 ? '' : 's'}`, () => go('past')),
        card('Review queue', builderNote || 'AI-drafted content waiting for you', () => ctx.openBuilder({ view: 'review' }), { disabled: running }))),
    recent.length ? h('section', { class: 'home-group' }, h('h3', {}, 'Recent'),
      h('ul', { class: 'home-recent' }, recent.map((x) => h('li', {}, h('button', { class: 'btn-link', type: 'button', disabled: x.kind === 'patient' && running, onclick: () => openRecent(x) },
        h('strong', {}, x.label), ` · ${x.what} · ${new Date(x.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`))))) : null,
    ctx.startDemo ? h('p', { class: 'muted small' }, 'Trying it out? ', h('button', { class: 'btn-link', type: 'button', onclick: () => ctx.startDemo() }, 'Start demo sim')) : null));
  return () => {};
}
