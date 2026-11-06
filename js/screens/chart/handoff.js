// Handoff tab (handoffMode "always" only): SBAR report stays available, with editable notes.

import { h } from '../shared/dom.js';
import { toast } from '../shared/toast.js';

const SBAR = [['situation', 'Situation'], ['background', 'Background'], ['assessment', 'Assessment'], ['recommendation', 'Recommendation']];

export default {
  id: 'handoff',
  label: 'Handoff',
  mount(root, { pid, view, user, runner, act }) {
    const box = h('textarea', { class: 'input notes-box', rows: 6, 'aria-label': 'Handoff notes' });
    box.value = runner.state.students[user.userId]?.handoff?.[pid]?.notes || '';
    root.append(h('div', { class: 'chart-grid two' },
      h('section', { class: 'panel' }, h('h3', {}, 'Handoff report'),
        h('dl', { class: 'sbar' }, SBAR.map(([k, l]) => [h('dt', {}, l), h('dd', {}, view.handoff?.[k] || '—')]))),
      h('section', { class: 'panel' }, h('h3', {}, 'My notes'), box,
        h('div', { class: 'controls' }, h('button', {
          class: 'btn btn-primary',
          onclick: () => { act('saveHandoffNotes', { notes: box.value }); toast('Handoff notes saved'); },
        }, 'Save notes'))),
    ));
    return { update() {} };
  },
};
