// Handoff popup (handoffMode "once"): SBAR report + a notes box. Closing it is final;
// the report is gone for good, the notes stay (shown on the chart Summary).

import { textDraft } from '../shared/drafts.js';
import { h } from '../shared/dom.js';
import { openModal } from '../shared/modal.js';

const SBAR = [['situation', 'Situation'], ['background', 'Background'], ['assessment', 'Assessment'], ['recommendation', 'Recommendation']];

export function openHandoffModal({ view, notes = '', onClose, draftKey = null }) {
  const d = view.demographics;
  const box = h('textarea', { class: 'input notes-box', rows: 6, 'aria-label': 'Your handoff notes', placeholder: 'Take notes. They stay after you close the report.' });
  box.value = notes;
  const draft = draftKey ? textDraft(box, draftKey) : null; // notes typed while the report is open survive a reload

  openModal({
    title: `Handoff report · Rm ${d.room} ${d.name}`,
    wide: true,
    dismissable: false,
    body: h('div', { class: 'handoff' },
      h('dl', { class: 'sbar' }, SBAR.map(([k, label]) => [h('dt', {}, label), h('dd', {}, view.handoff?.[k] || '—')])),
      h('label', { class: 'field' }, h('span', {}, 'My notes'), box),
      h('p', { class: 'muted' }, 'Once you close this report you cannot open it again. Your notes will stay on the chart.'),
    ),
    actions: [{ label: 'Close report', kind: 'primary' }],
    onClose: () => { draft?.clear(); onClose(box.value); },
  });
  box.focus();
}
