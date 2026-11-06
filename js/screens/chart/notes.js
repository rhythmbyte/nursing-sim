// Notes: free-text nursing notes (time-stamped) + quick escalation actions.
// Quick actions chart the matching catalog intervention, so rules see them like any other charting.

import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { at, byWhom, patientLog } from './util.js';

const QUICK = [
  { label: 'Notified provider', interventionId: 'notify-provider' },
  { label: 'Called rapid response', interventionId: 'rapid-response' },
  { label: 'Notified charge nurse', interventionId: 'notify-charge' },
  { label: 'Escalated', escalate: true },
];

export default {
  id: 'notes',
  label: 'Notes',
  mount(root, { pid, act }) {
    const text = h('textarea', { class: 'input notes-box', rows: 5, 'aria-label': 'Nursing note' });
    const list = h('div', {});

    root.append(h('div', { class: 'chart-grid two' },
      h('section', { class: 'panel' },
        h('h3', {}, 'New note'),
        text,
        h('div', { class: 'controls' },
          h('button', {
            class: 'btn btn-primary',
            onclick: () => {
              if (!text.value.trim()) return;
              act('addNote', { text: text.value });
              text.value = '';
              toast('Note saved');
            },
          }, 'Save note')),
        h('h3', {}, 'Quick actions'),
        h('div', { class: 'controls' }, QUICK.map((q) => h('button', {
          class: 'btn',
          onclick: () => {
            if (q.escalate) act('escalate', {});
            else act('chartIntervention', { interventionId: q.interventionId, fields: {}, orderId: null });
            toast(q.label);
          },
        }, q.label))),
      ),
      h('section', { class: 'panel' }, h('h3', {}, 'Notes and escalations'), list),
    ));

    const quickIds = new Set(QUICK.map((q) => q.interventionId).filter(Boolean));
    return {
      update(state) {
        const entries = patientLog(state, pid, ['note', 'escalated', 'intervention'])
          .filter((l) => l.action !== 'intervention' || quickIds.has(l.details.interventionId));
        clear(list).append(entries.length
          ? h('ul', { class: 'feed notes-list' }, entries.map((l) => h('li', {},
            h('span', { class: 'feed-time' }, at(state, l.simMin)),
            h('span', {},
              l.action === 'note' ? h('span', { class: 'pre' }, l.details.text)
                : h('strong', {}, l.action === 'escalated' ? 'Escalated' : QUICK.find((q) => q.interventionId === l.details.interventionId).label),
              h('span', { class: 'muted' }, ` · ${byWhom(l)}`)))))
          : h('p', { class: 'muted' }, 'No notes yet.'));
      },
    };
  },
};
