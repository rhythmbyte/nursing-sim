// Script builder: one patient state (name, target vitals now or as a trend, rhythm, findings, teaching note).
// Saving goes through script-model.js formToState; nothing here knows the data shape beyond the form.

import { formDraft } from '../shared/drafts.js';
import { h } from '../shared/dom.js';
import { helpField } from '../shared/help.js';
import { openModal } from '../shared/modal.js';
import { stateToForm, formToState } from './script-model.js';
import { select, input } from './script-parts.js';
import { eventList } from './guided-form.js';
import { stateToGes, gesToState } from './guided-model.js';
import { normalFor } from '../../engine/penalties.js';

const field = (label, el, hint) => helpField('script', label, el, hint); // help: data/catalogs/help.json "script.*"

/** onSave(newTemplate, stateId). */
export function openStateForm({ template, stateId = null, catalogs, onSave }) {
  const f = stateToForm(template, stateId);
  const label = input('State name', f.label, { placeholder: 'e.g. Hypoxic (SpO₂ 82%)' });
  const id = input('State id', f.id, { placeholder: 'made from the name' });
  // Vitals, rhythm and assessment answers in this state: the guided event builder (From = the baseline).
  const def = template.script?.states.find((x) => x.id === stateId) || {};
  const fromVitals = () => ({ ...template.vitals.baseline });
  const normal = normalFor(template, catalogs);
  const events = eventList(stateToGes(def, fromVitals(), normal), { context: 'state', template, catalogs, fromVitals, normal });
  const findings = h('textarea', { class: 'input', rows: 3, 'aria-label': 'Findings' }); findings.value = f.findingsText;
  const note = input('Teaching note', f.note, { placeholder: 'Shown in the debrief when the patient reaches this state' });
  const review = select('Review status', [['proposed', 'proposed'], ['partial', 'partial'], ['approved', 'approved']], f.review);
  const err = h('p', { class: 'form-error', role: 'alert' });

  let fd = null; // the form is a draft until saved or cancelled (shared/drafts.js)
  const modal = openModal({
    title: stateId ? `Edit state: ${f.label}` : 'New state',
    wide: true,
    body: h('div', { class: 'iv-form' },
      h('div', { class: 'editor-grid' }, field('State name', label), field('State id', id, 'Letters, numbers and dashes. Renaming updates every reaction.'), field('Review status', review)),
      h('h4', {}, 'When the patient enters this state'), events.el,
      field('Findings', findings, 'One per line; students see them at their next assessment'),
      field('Teaching note', note),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => { fd?.clear(); return true; } },
      { label: 'Save state', kind: 'primary', onClick: () => {
        try {
          const g = gesToState(events.value(), fromVitals());
          const form = { ...f, id: id.value, label: label.value, review: review.value, findingsText: findings.value, note: note.value,
            vitalsDirect: g.vitals || { values: {} }, rhythm: g.rhythm || '', assessments: g.assessments || {} };
          const next = formToState(template, form, stateId);
          onSave(next, next.script.states.find((s) => s.label === form.label.trim())?.id);
          fd?.clear(); return true;
        } catch (e) { err.textContent = e.message; return false; }
      } },
    ],
  });
  fd = formDraft(modal.el.querySelector('.modal-body'), `state.${template.id}.${stateId || 'new'}`);
  if (fd.note) modal.el.querySelector('.modal-body').prepend(fd.note);
}
