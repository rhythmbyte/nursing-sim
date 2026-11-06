// Assessments: pick a tool (assessment-tools.json, the ones this sim offers), complete it item by item; the score and
// interpretation update as you go and save with sim time. "Check patient" shows the scripted finding for an item when
// the sim reveals assessment findings (settings.revealAssessmentFindings); otherwise assess the manikin/instructor.
// NEWS2 is calculated from the current vitals (view only, can be recorded). Scoring: engine/assessment-score.js.

import { formDraft, loadDraft, saveDraft, clearDraft } from '../shared/drafts.js';
import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { helpTip } from '../shared/help.js';
import { toneChip } from '../shared/tone-chip.js';
import { at, patientLog } from './util.js';
import { scoreTool, answerLabel, toolById } from '../../engine/assessment-score.js';

const CAT = { neuro: 'Neuro', falls: 'Falls', skin: 'Skin', pain: 'Pain', sedation: 'Sedation', withdrawal: 'Withdrawal', systems: 'Systems', 'early-warning': 'Early warning' };
const TONE = { green: { symbol: '✓', tone: 'green' }, yellow: { symbol: '◷', tone: 'yellow' }, red: { symbol: '‼', tone: 'red' }, neutral: { symbol: '•', tone: 'neutral' } };
const chip = (band) => (band ? toneChip({ ...TONE[band.tone || 'neutral'], label: band.label }) : null);

export default {
  id: 'assessments',
  label: 'Assessments',
  mount(root, ctx) {
    const { pid, catalogs, act, runner, scenario } = ctx;
    const tools = runner.assessmentTools();
    const reveal = scenario.settings.revealAssessmentFindings;
    const SEL = `assesssel.${ctx.user.userId}.${pid}`;
    let selected = ctx.takePending?.('assessments')?.toolId || loadDraft(SEL) || null; // a tool in progress is a draft
    let fd = null;
    const picker = h('div', {});
    const form = h('div', {});
    const charted = h('div', {});
    const due = h('div', {});

    function renderPicker() {
      const cats = [...new Set(tools.map((t) => t.category))];
      clear(picker).append(...cats.map((c) => h('div', { class: 'pill-row', role: 'group', 'aria-label': CAT[c] || c },
        h('span', { class: 'muted small' }, `${CAT[c] || c}:`),
        ...tools.filter((t) => t.category === c).map((t) => h('button', { class: `pill${t.id === selected ? ' active' : ''}`, 'aria-pressed': t.id === selected ? 'true' : 'false', onclick: () => { selected = t.id; renderPicker(); renderForm(); } }, t.name)))));
    }

    function renderForm() {
      const tool = selected && toolById(catalogs, selected);
      if (!tool) { clear(form).append(h('p', { class: 'muted' }, tools.length ? 'Pick a tool to start.' : 'No assessment tools are offered in this sim.')); return; }
      if (tool.scoring === 'auto') {
        const r = runner.assessmentNow(pid, tool.id);
        clear(form).append(h('div', { class: 'iv-form' }, h('h4', {}, tool.name, ' ', helpTip('chart.news2')),
          h('p', {}, h('strong', { class: 'assess-score' }, `Score ${r.score}`), ' ', chip(r.band)),
          h('p', { class: 'muted small' }, `Calculated from the current vitals: ${Object.entries(r.parts || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}`),
          h('button', { class: 'btn btn-primary', onclick: () => { act('chartAssessment', { toolId: tool.id, answers: {} }); toast(`Recorded ${tool.name}: ${r.score}`); } }, 'Record NEWS2')));
        return;
      }
      const inputs = {};
      const total = h('p', { class: 'assess-total', 'aria-live': 'polite' });
      const answers = () => Object.fromEntries(Object.entries(inputs).map(([id, el]) => {
        const item = tool.items.find((i) => i.id === id);
        if (item.type === 'text') return [id, el.value.trim()];
        return [id, el.value === '' ? null : Number(el.value)];
      }).filter(([, v]) => v != null && v !== ''));
      const refresh = () => {
        if ((tool.scoring || 'sum') === 'none') { total.textContent = ''; return; }
        const r = scoreTool(tool, answers());
        clear(total).append(h('strong', { class: 'assess-score' }, r.score == null ? 'Score —' : `Score ${r.score}`), ' ', chip(r.band), r.complete ? '' : h('span', { class: 'muted small' }, ` (${r.missing.length} item${r.missing.length > 1 ? 's' : ''} left)`));
      };
      const rows = tool.items.map((item) => {
        const el = item.type === 'choice'
          ? h('select', { 'aria-label': item.label, onchange: refresh }, h('option', { value: '' }, '(choose)'), item.options.map((o) => h('option', { value: o.points }, `${o.label} (${o.points})`)))
          : item.type === 'text' ? h('input', { class: 'input', 'aria-label': item.label })
            : h('input', { class: 'input', type: 'number', min: item.min, max: item.max, 'aria-label': item.label, oninput: refresh });
        inputs[item.id] = el;
        const note = h('span', { class: 'muted small assess-hint' });
        const check = reveal ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
          const r = runner.revealAssessment(pid, tool.id, item.id);
          if (!r.revealed) { note.textContent = 'No scripted finding: assess the manikin or ask the instructor.'; return; }
          note.textContent = `Patient: ${answerLabel(item, r.value)}`;
          el.value = String(r.value); refresh();
        } }, 'Check patient') : null;
        return h('div', { class: 'assess-item' }, h('label', { class: 'field' }, h('span', {}, item.label), el), check, note);
      });
      const by = tool.delegableTo.length ? h('select', { 'aria-label': 'Performed by' }, h('option', { value: '' }, 'Me'), tool.delegableTo.map((x) => h('option', { value: x }, `Delegate to ${x}`))) : null;
      const formEl = h('form', { class: 'iv-form', onsubmit: (e) => {
        e.preventDefault();
        const delegatedTo = by?.value || null;
        const r = act('chartAssessment', { toolId: tool.id, answers: delegatedTo ? {} : answers(), delegatedTo });
        if (!r) return;
        fd?.clear(); clearDraft(SEL);
        toast(delegatedTo ? `Delegated to ${delegatedTo}: ${tool.name}` : r.task ? `Doing ${tool.name} (${Math.round(r.task.lockSec)} s)` : `Charted ${tool.name}`);
        renderForm();
      } },
        h('h4', {}, tool.name, tool.license?.status !== 'public' ? h('span', { class: 'muted small' }, ' (license check needed)') : null),
        reveal ? null : h('p', { class: 'muted small' }, 'Assess the manikin (or ask the instructor) and enter what you find.'),
        ...rows, total,
        by ? h('label', { class: 'field' }, h('span', {}, 'Performed by'), by) : null,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'));
      clear(form).append(formEl);
      fd = formDraft(formEl, `assess.${ctx.user.userId}.${pid}.${tool.id}`);
      formEl.addEventListener('input', () => saveDraft(SEL, tool.id), { once: true });
      formEl.addEventListener('change', () => saveDraft(SEL, tool.id), { once: true });
      if (fd.note) formEl.prepend(fd.note);
      refresh();
    }

    root.append(h('div', { class: 'chart-grid two' },
      h('section', { class: 'panel' }, h('h3', {}, 'Assessment tools ', helpTip('chart.assessments')), picker, form),
      h('section', { class: 'panel' }, h('h3', {}, 'Due'), due, h('h3', {}, 'Charted this shift'), charted)));
    renderPicker();
    renderForm();

    return {
      update(state) {
        const list = patientLog(state, pid, 'assessment').slice(0, 15);
        clear(charted).append(list.length ? h('ul', { class: 'feed' }, list.map((l) => h('li', {},
          h('span', { class: 'feed-time' }, at(state, l.simMin)),
          h('strong', {}, toolById(catalogs, l.details.toolId)?.name || l.details.toolId), ' ',
          l.details.score != null ? `${l.details.score} ` : '', l.details.band ? h('span', { class: 'muted small' }, l.details.band) : null,
          l.details.delegatedTo ? h('span', { class: 'muted small' }, ` · ${l.details.delegatedTo}`) : null)))
          : h('p', { class: 'muted' }, 'Nothing charted yet.'));
        const items = runner.assessmentsDue(pid);
        clear(due).append(items.length ? h('ul', { class: 'feed' }, items.map((i) => h('li', {},
          h('span', { class: 'feed-time' }, at(state, i.startAt)), `${i.label} `, h('span', { class: 'muted small' }, i.doneAt != null ? 'done' : i.startAt > runner.simMin() ? 'due' : 'overdue'))))
          : h('p', { class: 'muted' }, 'No reassessments ordered.'));
      },
    };
  },
};
