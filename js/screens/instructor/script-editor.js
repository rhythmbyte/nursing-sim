// Patient editor → Reactive script section: starting state, state diagram, states and reactions lists
// (edit / duplicate / delete), reaction templates (add from catalog, save selected as a template) and
// "Test this patient". Works on the editor's working copy through sync() + update(next). Display only.

import { h } from '../shared/dom.js';
import { helpTip, helpField } from '../shared/help.js';
import { toast } from '../shared/toast.js';
import { promptText } from '../shared/modal.js';
import { downloadText } from '../shared/download.js';
import { badge } from '../shared/badge.js';
import { saveLocalCatalog } from '../../data-loader.js';
import { names, reactionText } from '../../engine/reactions/describe.js';
import { withScript, deleteState, duplicateState, duplicateReaction, deleteReaction, applyTemplate, templateFrom, uniqueId } from './script-model.js';
import { openStateForm } from './script-state-form.js';
import { openReactionForm } from './script-reaction-form.js';
import { stateDiagram } from './script-diagram.js';
import { openScriptTest } from './script-test.js';
import { select } from './script-parts.js';

const field = (label, el, hint) => helpField('script', label, el, hint);
const review = (x) => (x.review && x.review !== 'approved' ? badge('Needs review', 'review') : null);

/** ctx = { work, sync, update, catalogs, scenario, schemas, reloadData } — `work` is read when called. */
export function scriptSection(ctx) {
  const { catalogs, scenario } = ctx;
  const t = ctx.work();
  const sc = t.script;
  const guard = (fn) => { try { ctx.sync(); ctx.update(fn(ctx.work())); } catch (e) { toast(e.message, 5000); } };
  const editState = (id) => { ctx.sync(); openStateForm({ template: ctx.work(), stateId: id, catalogs, onSave: (next) => ctx.update(next) }); };
  const editReaction = (id) => { ctx.sync(); openReactionForm({ template: ctx.work(), reactionId: id, catalogs, onSave: (next) => ctx.update(next) }); };
  const templates = catalogs.reactionTemplates?.templates || [];
  const tplSel = select('Reaction template', templates.map((x) => [x.id, x.label]), '', { blank: '(pick a template)' });
  const addTemplate = () => {
    const tpl = templates.find((x) => x.id === tplSel.value);
    if (!tpl) { toast('Pick a template first'); return; }
    guard((w) => applyTemplate(w, tpl).template);
    toast(`Added "${tpl.label}": ${tpl.reactions.length} reaction(s), ${tpl.states.length} state(s)`);
  };
  const head = h('div', { class: 'panel-head' }, h('h3', {}, 'Reactive script ', helpTip('script.section')),
    sc ? h('div', { class: 'controls' },
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => editState(null) }, 'Add state'),
      h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => editReaction(null) }, 'Add reaction'),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => { ctx.sync(); openScriptTest({ template: ctx.work(), catalogs, settings: scenario.settings, startClock: scenario.startClock }); } }, 'Test this patient')) : null);
  const templateBar = h('div', { class: 'controls' }, field('Reaction template', tplSel), h('button', { class: 'btn btn-small', type: 'button', onclick: addTemplate }, 'Add from template'));

  if (!sc) {
    return h('section', { class: 'panel' }, head,
      h('p', { class: 'muted' }, 'No script yet: this patient only follows its scheduled scenario changes. A script lets it react to what the student does (or doesn\'t do).'),
      h('div', { class: 'controls' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => guard(withScript) }, 'Start a script')), templateBar);
  }

  const n = names(t, catalogs);
  const picked = new Set();
  const initial = select('Starting state', sc.states.map((s) => [s.id, s.label]), sc.initialState, { onchange: (e) => guard((w) => ({ ...w, script: { ...w.script, initialState: e.target.value } })) });
  async function saveAsTemplate() {
    if (!picked.size) { toast('Tick the reactions to include first'); return; }
    const label = await promptText('Save as reaction template', 'Template name');
    if (!label) return;
    ctx.sync();
    const cat = catalogs.reactionTemplates || { templates: [] };
    const tpl = templateFrom(ctx.work(), [...picked], { label });
    tpl.id = uniqueId(tpl.id, new Set(cat.templates.map((x) => x.id)));
    const next = { ...cat, templates: [...cat.templates, tpl] };
    const errors = saveLocalCatalog('reactionTemplates', next, ctx.schemas);
    if (errors.length) { toast(`Not saved: ${errors[0]}`, 6000); return; }
    toast(`Saved template "${label}" in this browser. Export the templates file to share it.`, 5000);
    await ctx.reloadData();
  }

  return h('section', { class: 'panel' }, head,
    h('div', { class: 'editor-grid' }, field('Starting state', initial)),
    stateDiagram(t, catalogs, { onState: editState, onReaction: editReaction }),
    h('h4', {}, `States (${sc.states.length})`),
    h('table', { class: 'data-table' }, h('tbody', {}, sc.states.map((s) => h('tr', {},
      h('td', {}, h('strong', {}, s.label), ' ', review(s), s.id === sc.initialState ? h('span', { class: 'muted small' }, ' · start') : null,
        h('div', { class: 'muted small' }, [Object.entries(s.vitals?.values || {}).map(([k, v]) => `${k} ${v}`).join(', '), s.vitals?.overMin ? `over ${s.vitals.overMin} min` : '', s.rhythm, s.findings ? 'new findings' : '', s.note ? `note: ${s.note}` : ''].filter(Boolean).join(' · '))),
      h('td', { class: 'row-actions' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => editState(s.id) }, 'Edit'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => guard((w) => duplicateState(w, s.id).template) }, 'Duplicate'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { if (window.confirm(`Delete state "${s.label}"?`)) guard((w) => deleteState(w, s.id)); } }, 'Delete')))))),
    h('h4', {}, `Reactions (${sc.reactions.length})`),
    h('table', { class: 'data-table' }, h('tbody', {}, sc.reactions.map((r) => h('tr', {},
      h('td', {}, h('input', { type: 'checkbox', 'aria-label': `Include ${r.label || r.id} in a template`, onchange: (e) => { if (e.target.checked) picked.add(r.id); else picked.delete(r.id); } })),
      h('td', {}, h('strong', {}, r.label || r.id), ' ', review(r), r.repeat ? h('span', { class: 'muted small' }, ` · repeats (max ${r.maxFires ?? scenario.settings.reactionMaxFires})`) : null,
        h('div', { class: 'muted small' }, reactionText(r, n))),
      h('td', { class: 'row-actions' },
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => editReaction(r.id) }, 'Edit'),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => guard((w) => duplicateReaction(w, r.id).template) }, 'Duplicate'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { if (window.confirm(`Delete reaction "${r.label || r.id}"?`)) guard((w) => deleteReaction(w, r.id)); } }, 'Delete')))))),
    templateBar,
    h('div', { class: 'controls' },
      h('button', { class: 'btn btn-small', type: 'button', onclick: saveAsTemplate }, 'Save ticked reactions as a template'),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => downloadText('reaction-templates.json', `${JSON.stringify(catalogs.reactionTemplates || { templates: [] }, null, 2)}\n`) }, 'Export templates file'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { if (window.confirm('Remove the whole script from this patient? (Its findings changes stay.)')) guard((w) => { const { script, ...rest } = w; return rest; }); } }, 'Remove script')),
  );
}
