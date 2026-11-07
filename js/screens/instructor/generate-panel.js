// Setup → Generate a sim: students (2–10), patients per student (1–6), patient tags, a difficulty level or a custom
// triage mix, and a preset → engine/generate.js assembles groups and cases, the readiness check runs, and a
// one-screen summary shows before Start. "Save to library" keeps it for next time.

import { h, clear } from '../shared/dom.js';
import { helpField, helpTip } from '../shared/help.js';
import { toast } from '../shared/toast.js';
import { tagChips } from './patient-tags-ui.js';
import { generateSim } from '../../engine/generate.js';
import { simReadiness } from '../../engine/readiness.js';
import { presetsFor } from '../../engine/program.js';
import { codeName } from '../../engine/cases.js';
import { saveLocal } from '../../data-loader.js';
import { save } from '../../storage.js';
import { readinessBlock } from './sim-library.js';
import { READY_KEY } from './setup-wizard.js';

const field = (label, el) => helpField('generate', label, el);

export function mountGeneratePanel(root, ctx) {
  const { data, switchScenario } = ctx;
  const cfg = data.catalogs.generate || { limits: {}, defaults: {}, difficulties: [] };
  const num = (label, [lo, hi], v) => h('input', { class: 'input input-small', type: 'number', min: lo, max: hi, value: v, 'aria-label': label });
  const students = num('Students', cfg.limits.students || [2, 10], cfg.defaults.students ?? 4);
  const per = num('Patients per student', cfg.limits.patientsPerStudent || [1, 6], cfg.defaults.patientsPerStudent ?? 3);
  const difficulty = h('select', { 'aria-label': 'Difficulty' }, cfg.difficulties.map((d) => h('option', { value: d.id, selected: d.id === cfg.defaults.difficulty }, d.label)), h('option', { value: 'custom' }, 'Custom triage mix'));
  const mix = Object.fromEntries(['red', 'yellow', 'green'].map((c) => [c, num(`${c} weight`, [0, 6], 1)]));
  const mixRow = h('div', { class: 'pick-row', hidden: true }, 'Per student, red ', mix.red, ' : yellow ', mix.yellow, ' : green ', mix.green);
  const diffDesc = h('p', { class: 'muted small' });
  const presets = presetsFor(data.catalogs, data.program);
  const preset = h('select', { 'aria-label': 'Preset' }, presets.map((p) => h('option', { value: p.id }, p.label)));
  let tags = {};
  const chips = data.catalogs.patientTags ? tagChips(data.catalogs.patientTags, {}, { data, label: 'Only cases with these patient tags (optional)', onChange: (v) => { tags = v; } }) : null;
  const syncDiff = () => { mixRow.hidden = difficulty.value !== 'custom'; diffDesc.textContent = cfg.difficulties.find((d) => d.id === difficulty.value)?.description || 'Weights for red, yellow and green patients per student.'; };
  difficulty.addEventListener('change', syncDiff);
  syncDiff();
  const summary = h('div', { 'aria-live': 'polite' });
  let current = null;

  function generate() {
    const opts = { students: students.value, perStudent: per.value, tags, presetId: preset.value, program: data.program,
      ...(difficulty.value === 'custom' ? { mix: Object.fromEntries(Object.entries(mix).map(([c, el]) => [c, Number(el.value) || 0])) } : { difficulty: difficulty.value }) };
    const { scenario, warnings } = generateSim(opts, data.patients, data.catalogs);
    current = scenario;
    if (!scenario) { clear(summary).append(h('div', { class: 'banner banner-error', role: 'alert' }, warnings.join(' '))); return; }
    const r = simReadiness(scenario, data.patients, { catalogs: data.catalogs, program: data.program });
    const byId = Object.fromEntries(data.patients.map((t) => [t.id, t]));
    clear(summary).append(h('section', { class: 'panel gen-summary' },
      h('div', { class: 'panel-head' }, h('h3', {}, scenario.name), readinessBlock(r)),
      warnings.length ? h('ul', { class: 'case-warnings' }, warnings.map((w) => h('li', { class: 'warn' }, `⚠ ${w}`))) : null,
      h('p', { class: 'muted small' }, `${presets.find((p) => p.id === scenario.preset)?.label || ''} · ${scenario.notes}`),
      h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Group'), h('th', {}, 'Cases (each group gets its own patient from a case)'))),
        h('tbody', {}, scenario.groups.map((g) => h('tr', {}, h('td', {}, g.name), h('td', {}, g.patients.map((id) => `${codeName(byId[id])} ${byId[id].case?.title ? `· ${byId[id].case.title}` : ''}`).join('; ')))))),
      h('div', { class: 'controls' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => run(false) }, 'Start'),
        h('button', { class: 'btn', type: 'button', onclick: () => run(true) }, 'Save to library and start'),
        h('button', { class: 'btn', type: 'button', onclick: () => keep() }, 'Save to library'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: generate }, 'Generate again'))));
  }
  const store = (inLibrary) => saveLocal('scenario', { ...current, inLibrary }, data.schemas);
  async function run(inLibrary) {
    const errors = store(inLibrary);
    if (errors.length) { window.alert(`Could not save:\n${errors.join('\n')}`); return; }
    save(READY_KEY, current.id);
    await switchScenario(current.id);
  }
  async function keep() {
    const errors = store(true);
    if (errors.length) { window.alert(`Could not save:\n${errors.join('\n')}`); return; }
    toast(`Saved "${current.name}" to the sim library`);
    await ctx.reloadData();
  }

  root.append(h('section', { class: 'panel' },
    h('p', { class: 'muted' }, 'Say how big and how hard; the app picks cases for each student, checks them, and shows you the result before anything starts. ', helpTip('generate.how')),
    h('div', { class: 'editor-grid' }, field('Students', students), field('Patients per student', per), field('Difficulty', difficulty), field('Preset', preset)),
    diffDesc, mixRow,
    chips ? h('details', {}, h('summary', {}, 'Only cases with certain patient tags (optional)'), chips.el) : null,
    h('div', { class: 'controls' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: generate }, 'Generate'))),
    summary);
  return () => {};
}
