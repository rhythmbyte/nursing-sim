// "Entered in error" controls for chart lists: a button on the student's own entries (asks for a reason)
// and the struck-through display. Rules live in engine/chart.js strikeEntry.

import { h } from '../shared/dom.js';
import { promptText } from '../shared/modal.js';
import { toast } from '../shared/toast.js';
import { STRIKEABLE } from '../../engine/chart.js';

export function strikeButton(state, entry, ctx) {
  if (!entry || state.struck?.[entry.id] || entry.userId !== ctx.user.userId || !STRIKEABLE.includes(entry.action)) return null;
  return h('button', {
    class: 'btn btn-small btn-ghost strike-btn', type: 'button',
    onclick: async () => {
      const reason = await promptText('Entered in error', 'Reason (required)', { okLabel: 'Mark entered in error' });
      if (reason == null) return;
      ctx.act('strikeEntry', { logId: entry.id, reason });
      toast('Marked as entered in error');
    },
  }, 'Entered in error');
}

export function struckMark(state, entry) {
  const s = entry && state.struck?.[entry.id];
  return s ? h('span', { class: 'struck-note' }, ` Entered in error: ${s.reason}`) : null;
}
