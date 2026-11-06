// Instructor: expected assessment answers ("what this tool will find") for a patient's baseline, a script state,
// a scenario change or a reaction. Blank items mean "no change" (or unknown at baseline). Display only; the
// answers are plain data { toolId: { itemId: value } } (assessment-tools.json defines items and points).

import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { scoreTool } from '../../engine/assessment-score.js';

const parse = (item, raw) => (raw === '' || raw == null ? undefined : item.type === 'text' ? String(raw) : Number(raw));

/** Returns { el, value() }. `title` names the context (e.g. "Baseline"). */
export function answersEditor(catalogs, answers = {}, { title = 'Assessment findings', blankMeans = 'no change' } = {}) {
  const tools = (catalogs.assessmentTools?.tools || []).filter((t) => t.scoring !== 'auto');
  const current = structuredClone(answers || {});
  const box = h('div', { class: 'answers-editor' });
  const add = h('select', { 'aria-label': `${title}: add a tool` }, h('option', { value: '' }, '(add a tool)'), tools.map((t) => h('option', { value: t.id }, t.name)));
  add.addEventListener('change', () => { if (add.value && !current[add.value]) { current[add.value] = {}; render(); } add.value = ''; });
  const inputs = {}; // toolId → itemId → element

  function readBack() {
    for (const [toolId, items] of Object.entries(inputs)) {
      const tool = tools.find((t) => t.id === toolId);
      current[toolId] = {};
      for (const [itemId, el] of Object.entries(items)) {
        const v = parse(tool.items.find((i) => i.id === itemId), el.value);
        if (v !== undefined) current[toolId][itemId] = v;
      }
    }
  }

  function render() {
    for (const k of Object.keys(inputs)) delete inputs[k];
    clear(box).append(...Object.keys(current).map((toolId) => {
      const tool = tools.find((t) => t.id === toolId);
      if (!tool) return h('p', { class: 'form-error' }, `Unknown tool ${toolId} (kept as-is)`);
      inputs[toolId] = {};
      const preview = h('span', { class: 'muted small' });
      const refresh = () => { readBack(); const r = scoreTool(tool, current[toolId]); preview.textContent = r.score != null && r.complete ? `Score ${r.score}${r.band ? `: ${r.band.label}` : ''}` : (tool.scoring || 'sum') === 'none' ? '' : `Partial (${r.missing.length} blank = ${blankMeans})`; };
      const items = tool.items.map((item) => {
        const v = current[toolId][item.id];
        const label = `${title}: ${tool.name} ${item.label}`;
        const el = item.type === 'choice'
          ? h('select', { 'aria-label': label, onchange: refresh }, h('option', { value: '' }, `(${blankMeans})`), item.options.map((o) => h('option', { value: o.points, selected: o.points === v }, `${o.label} (${o.points})`)))
          : h('input', { class: 'input', type: item.type === 'text' ? 'text' : 'number', 'aria-label': label, value: v ?? '', min: item.min, max: item.max, oninput: refresh, placeholder: blankMeans });
        inputs[toolId][item.id] = el;
        return h('label', { class: 'field' }, h('span', {}, item.label), el);
      });
      const row = h('details', { class: 'answers-tool', open: true },
        h('summary', {}, tool.name, ' ', tool.license?.status !== 'public' ? badge('License check needed', 'review') : null, ' ', preview),
        h('div', { class: 'editor-grid' }, ...items),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { readBack(); delete current[toolId]; render(); } }, `Remove ${tool.name}`));
      refresh();
      return row;
    }), Object.keys(current).length ? '' : h('p', { class: 'muted small' }, 'No scripted assessment findings: students assess the manikin.'));
  }
  render();
  return {
    el: h('div', {}, box, add),
    value: () => { readBack(); return Object.fromEntries(Object.entries(current).filter(([, items]) => Object.keys(items).length)); },
  };
}
