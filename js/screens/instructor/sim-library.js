// Setup → Sim library: saved, complete sims for this program (groups, patients, settings, preset), each with a
// Ready / Needs work badge from the readiness check (engine/readiness.js) and its reasons. Start → the Ready screen
// (join code) → Start sim: two clicks. "Edit a copy" opens it in the wizard; "Remove" hides a browser-made sim.

import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { helpTip } from '../shared/help.js';
import { simReadiness } from '../../engine/readiness.js';
import { scenarioOffered } from '../../engine/program.js';
import { codeName } from '../../engine/cases.js';
import { saveLocal } from '../../data-loader.js';
import { save } from '../../storage.js';
import { READY_KEY } from './setup-wizard.js';

export const WIZARD_FROM_KEY = 'ui.wizard.from'; // a saved sim the wizard should start from (Edit a copy)

/** Ready / Needs work badge and the reasons (shared with Generate's summary). */
export function readinessBlock(r) {
  return h('div', { class: 'readiness' },
    r.status === 'ready' ? badge('✓ Ready', 'ok', 'Every case passed the readiness check') : badge('Needs work', 'review', 'See the reasons below'),
    r.blocking.length ? h('ul', { class: 'readiness-list' }, r.blocking.map((b) => h('li', {}, b.message))) : null,
    r.notes.length ? h('details', { class: 'readiness-notes' }, h('summary', {}, `${r.notes.length} note${r.notes.length === 1 ? '' : 's'}`), h('ul', {}, r.notes.map((n) => h('li', { class: 'muted small' }, n.message)))) : null);
}

export function mountSimLibrary(root, ctx, { onEdit }) {
  const { data, switchScenario } = ctx;
  const sims = data.scenarios.filter((s) => scenarioOffered(s, data.program) && s.inLibrary !== false);
  const presetLabel = (id) => data.catalogs.presets?.presets.find((p) => p.id === id)?.label;
  const byId = Object.fromEntries(data.patients.map((t) => [t.id, t]));
  const list = h('div', { class: 'sim-list' });
  const start = async (sc) => { save(READY_KEY, sc.id); await switchScenario(sc.id); };
  for (const sc of sims) {
    const ids = sc.groups.flatMap((g) => [...(g.patients || []), ...(g.admissions || [])]);
    const students = sc.groups.reduce((n, g) => n + (g.studentCount || 0), 0);
    const status = h('div', { class: 'readiness' }, h('span', { class: 'muted small' }, 'Checking…'));
    list.append(h('section', { class: 'panel sim-card' },
      h('div', { class: 'panel-head' }, h('h3', {}, sc.name), status),
      h('p', { class: 'muted small' }, `${sc.groups.length} group${sc.groups.length === 1 ? '' : 's'} · ${students} student${students === 1 ? '' : 's'} · ${ids.length} patient${ids.length === 1 ? '' : 's'}${sc.preset ? ` · ${presetLabel(sc.preset) || sc.preset}` : ''}${data.local.scenarios?.has(sc.id) ? ' · made in this browser' : ''}`),
      h('p', { class: 'small sim-cases' }, [...new Set(ids)].map((id) => (byId[id] ? codeName(byId[id]) : id)).join(' · ')),
      h('div', { class: 'controls' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => start(sc) }, 'Start'),
        h('button', { class: 'btn', type: 'button', onclick: () => { save(WIZARD_FROM_KEY, sc.id); onEdit(); } }, 'Edit a copy'),
        data.local.scenarios?.has(sc.id) ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { if (window.confirm(`Remove "${sc.name}" from the library?`)) { saveLocal('scenario', { ...sc, inLibrary: false }, data.schemas); await ctx.reloadData(); } } }, 'Remove') : null)));
    // The check runs dry runs, so each card fills in after the page shows.
    setTimeout(() => clear(status).append(readinessBlock(simReadiness(sc, data.patients, { catalogs: data.catalogs, program: data.program }))), 0);
  }
  root.append(h('div', {},
    h('p', { class: 'muted' }, 'Saved sims for your program. Start shows the join code; Start sim on the next screen begins. ', helpTip('setup.library')),
    sims.length ? list : h('p', { class: 'muted' }, 'No saved sims yet. Generate one or build one step by step.')));
  return () => {};
}
