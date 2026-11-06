// Script builder: one patient state (name, target vitals now or as a trend, rhythm, findings, teaching note).
// Saving goes through script-model.js formToState; nothing here knows the data shape beyond the form.

import { h } from '../shared/dom.js';
import { helpField } from '../shared/help.js';
import { openModal } from '../shared/modal.js';
import { stateToForm, formToState } from './script-model.js';
import { select, input, vitalLabel } from './script-parts.js';
import { answersEditor } from './assessment-answers.js';

const field = (label, el, hint) => helpField('script', label, el, hint); // help: data/catalogs/help.json "script.*"

/** onSave(newTemplate, stateId). */
export function openStateForm({ template, stateId = null, catalogs, onSave }) {
  const f = stateToForm(template, stateId);
  const label = input('State name', f.label, { placeholder: 'e.g. Hypoxic (SpO₂ 82%)' });
  const id = input('State id', f.id, { placeholder: 'made from the name' });
  const values = Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, input(`Target ${vitalLabel(k)}`, v)]));
  const overMin = input('Trend over minutes', f.overMin, { type: 'number', min: 0 });
  const rhythm = select('Rhythm', (catalogs.rhythms ? Object.entries(catalogs.rhythms.rhythms) : []).map(([rid, r]) => [rid, r.label]), f.rhythm, { blank: '(no change)' });
  const findings = h('textarea', { class: 'input', rows: 3, 'aria-label': 'Findings' }); findings.value = f.findingsText;
  const note = input('Teaching note', f.note, { placeholder: 'Shown in the debrief when the patient reaches this state' });
  const assess = answersEditor(catalogs, f.assessments, { title: 'State' });
  const review = select('Review status', [['proposed', 'proposed'], ['partial', 'partial'], ['approved', 'approved']], f.review);
  const err = h('p', { class: 'form-error', role: 'alert' });

  openModal({
    title: stateId ? `Edit state: ${f.label}` : 'New state',
    wide: true,
    body: h('div', { class: 'iv-form' },
      h('div', { class: 'editor-grid' }, field('State name', label), field('State id', id, 'Letters, numbers and dashes. Renaming updates every reaction.'), field('Review status', review)),
      h('h4', {}, 'Target vitals (blank = no change)'),
      h('div', { class: 'editor-grid' }, Object.entries(values).map(([k, el]) => field(vitalLabel(k), el)),
        field('Trend over minutes', overMin, '0 = apply at once'), field('Rhythm', rhythm)),
      field('Findings', findings, 'One per line; students see them at their next assessment'),
      field('Teaching note', note),
      h('h4', {}, 'Assessment findings in this state (blank = no change)'), assess.el,
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Save state', kind: 'primary', onClick: () => {
        try {
          const form = { ...f, id: id.value, label: label.value, review: review.value, overMin: overMin.value, rhythm: rhythm.value, findingsText: findings.value, note: note.value, assessments: assess.value(),
            values: Object.fromEntries(Object.entries(values).map(([k, el]) => [k, el.value])) };
          const next = formToState(template, form, stateId);
          onSave(next, next.script.states.find((s) => s.label === form.label.trim())?.id);
          return true;
        } catch (e) { err.textContent = e.message; return false; }
      } },
    ],
  });
}
