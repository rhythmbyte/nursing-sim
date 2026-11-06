// "Scenario change" builder: one moment in the case, written the way the instructor writes cases. The events of the
// moment (call light or staff message, vitals, rhythm, orders, assessments, lab, state, code, admission) come from the
// guided event builder; "From" auto-fills with what the patient will be at that time (dry run, without this change).
// Saving generates the linked events (shared group) via change-model.js. Reopening edits the same change.

import { formDraft } from '../shared/drafts.js';
import { helpField, helpTip } from '../shared/help.js';
import { h } from '../shared/dom.js';
import { openModal } from '../shared/modal.js';
import { changeToForm, formToChange, clockToMin } from './change-model.js';
import { eventList } from './guided-form.js';
import { changeFormToGes, gesToChangeForm } from './guided-model.js';
import { projectedVitals } from '../../engine/reactions/dry-run.js';
import { normalFor } from '../../engine/penalties.js';

const field = (label, el, hint) => helpField('change', label, el, hint); // help text: data/catalogs/help.json

/** onSave(newTemplate) gets the whole updated template. `settings` = the scenario's merged settings (for "From"). */
export function openChangeBuilder({ template, key, startClock, catalogs, settings, onSave }) {
  const f = changeToForm(template, key, startClock);
  const time = h('input', { class: 'input', type: 'time', value: f.time });
  const manual = h('input', { type: 'checkbox', checked: f.manual });
  const findings = h('textarea', { class: 'input', rows: 3 }, f.findings);
  const recognize = h('textarea', { class: 'input', rows: 3 }, f.recognize);
  const err = h('p', { class: 'form-error', role: 'alert' });
  const normal = normalFor(template, catalogs);
  let cache = null;
  // What the patient will be at this change's time (manual changes: at the start), recomputed when the time changes.
  const fromVitals = () => {
    const atMin = manual.checked ? 0 : clockToMin(startClock, time.value || f.time);
    if (cache?.atMin !== atMin) {
      let v;
      try { v = settings ? projectedVitals(template, { catalogs, settings, atMin, excludeGroup: key, startClock }) : template.vitals.baseline; } catch { v = template.vitals.baseline; }
      cache = { atMin, v };
    }
    return cache.v;
  };
  const initial = changeFormToGes(f, fromVitals(), normal);
  const events = eventList(initial.length ? initial : [{}], { context: 'change', template, catalogs, fromVitals, normal });
  const sync = () => { time.disabled = manual.checked; events.refreshFrom(); };
  time.addEventListener('change', sync);
  manual.addEventListener('change', sync);
  sync();

  let fd = null; // the form is a draft until saved or cancelled (shared/drafts.js)
  const modal = openModal({
    title: key ? 'Edit scenario change' : 'New scenario change',
    wide: true,
    body: h('div', { class: 'iv-form' },
      h('div', { class: 'editor-grid' },
        field('Time (shift clock)', time),
        h('label', { class: 'inline' }, manual, ' Instructor triggers it (Fire now) ', helpTip('change.manual'))),
      h('h4', {}, 'What happens'), events.el,
      field('New assessment findings (one per line; students see them when they reassess)', findings),
      field('What students should recognize (debrief, one per line)', recognize),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost', onClick: () => { fd?.clear(); return true; } },
      {
        label: 'Save change', kind: 'primary', onClick: () => {
          if (!manual.checked && !time.value) { err.textContent = 'Pick a time or make it instructor-triggered.'; return false; }
          try {
            const list = events.value();
            const start = list.find((g) => g.type === 'call-light' || g.type === 'staff-message');
            if (start && !start.message?.trim()) throw new Error('Write what the patient says or what is reported.');
            const form = gesToChangeForm(list, { ...f, time: time.value, manual: manual.checked, findings: findings.value, recognize: recognize.value }, fromVitals());
            if (!list.length && !form.findings.trim()) throw new Error('Add at least one event (or new findings).');
            onSave(formToChange(template, form, startClock).template);
            fd?.clear(); return true;
          } catch (e) { err.textContent = e.message; return false; }
        },
      },
    ],
  });
  fd = formDraft(modal.el.querySelector('.modal-body'), `change.${template.id}.${key || 'new'}`);
  if (fd.note) modal.el.querySelector('.modal-body').prepend(fd.note);
}
