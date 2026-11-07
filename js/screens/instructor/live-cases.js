// Live control → Cases (instructor only): which case each patient came from and its generated details
// ("Cardiac 1 — Robert Miller, 68M, atorvastatin, lisinopril"). Before the sim starts the instructor can Reroll a
// patient (new name, values and drugs) or Lock a variant so new sims reuse it. Students never see case titles.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { caseLabel } from '../../engine/cases.js';
import { saveLocal } from '../../data-loader.js';
import { reroll, clearReroll } from '../../case-seeds.js';
import { load } from '../../storage.js';

export function casesPanel(runner, templatesById, ctx) {
  const rows = Object.keys(runner.state.patients).map((pid) => templatesById[pid]).filter((t) => t?.instance);
  if (!rows.length) return h('p', { class: 'muted' }, 'No case templates in this sim (every patient is a fixed patient file).');
  const ready = runner.state.clock.status === 'ready';
  const rerolled = load('ui.cases')?.variants || {};
  const source = (t) => ctx.data.patients.find((p) => p.id === t.instance.caseId);
  const saveCase = (c) => {
    const errors = saveLocal('patient', c, ctx.data.schemas);
    if (errors.length) { window.alert(`Could not save the case:\n${errors.join('\n')}`); return; }
    ctx.reloadData();
  };
  const lockBtn = (t) => {
    const c = source(t);
    if (!c || t.id !== c.id) return h('span', { class: 'muted small', title: 'Locked variants are used for the first patient made from this case' }, 'second use');
    const lockedHere = (c.case.locked || []).some((l) => l.seed === t.instance.seed && Boolean(l.nominal) === Boolean(t.instance.nominal));
    if (lockedHere) {
      return h('button', { class: 'btn btn-small', title: 'New sims go back to a new variant for this case', onclick: () => saveCase({ ...c, case: { ...c.case, locked: c.case.locked.filter((l) => l.seed !== t.instance.seed) } }) }, '🔒 Locked · Unlock');
    }
    return h('button', { class: 'btn btn-small', title: 'Reuse exactly this patient (name, values, drugs) for this case in new sims',
      onclick: () => saveCase({ ...c, case: { ...c.case, locked: [{ seed: t.instance.seed, ...(t.instance.nominal ? { nominal: true } : {}), label: caseLabel(t) }] } }) }, 'Lock variant');
  };
  return h('div', {},
    h('p', { class: 'muted small' }, 'Instructor only: students see the patient, never the case title. ', helpTip('live.cases')),
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Room', 'Case and this variant', 'Actions'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((t) => h('tr', {},
        h('td', {}, t.demographics.room),
        h('td', {}, h('strong', {}, `${t.instance.code ? `(${t.instance.code}) ` : ''}${t.instance.caseTitle}`), ` — ${caseLabel(t).split(' — ').slice(1).join(' — ')}`, rerolled[t.id] ? h('span', { class: 'muted small' }, ' (rerolled)') : null),
        h('td', { class: 'row-actions' },
          h('button', { class: 'btn btn-small', disabled: !ready, title: ready ? 'New name, values and drugs for this patient' : 'Only before the sim starts', onclick: () => { reroll(t.id); ctx.reloadData(); } }, 'Reroll'),
          rerolled[t.id] ? h('button', { class: 'btn btn-small btn-ghost', disabled: !ready, onclick: () => { clearReroll(t.id); ctx.reloadData(); } }, 'Undo reroll') : null,
          lockBtn(t),
        ))))),
  );
}
