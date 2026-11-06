// "End of sim on a shared computer": clears what this device remembers for one user (drafts, rejoin token, saved
// place and scroll), after a confirmation. Students: the tab then acts as a new device, so signing back in as the same
// student needs the token or the instructor's approval. Display + storage only.

import { h } from './dom.js';
import { removeMatching, save } from '../../storage.js';

const STUDENT_DRAFTS = ['notes', 'handoff', 'reflection', 'iv', 'ivsel', 'assess', 'assesssel', 'mar'];

/** What a student's sign-out removes from this device. */
export function studentKeys(userId, tabId) {
  return (k, v) => (k.startsWith('draft.') && STUDENT_DRAFTS.some((p) => k.startsWith(`draft.${p}.${userId}.`)))
    || k.startsWith(`ui.${userId}.`) || (k.startsWith('rejoin.') && v?.userId === userId)
    || k === `device.${tabId}` || (k.startsWith('ui.scroll.') && (k.includes(userId) || k.includes(tabId)));
}
/** What the instructor's sign-out removes. */
export const instructorKeys = (k) => ['draft.change.', 'draft.reaction.', 'draft.state.', 'draft.live-event.', 'draft.setup', 'draft.editor.'].some((p) => k.startsWith(p))
  || k.startsWith('ui.instructor.') || k === 'ui.live.filter' || k === 'ui.debrief.student' || k.startsWith('ui.scroll.');

export function sharedComputerButton({ who, pred, after }) {
  return h('button', { class: 'btn btn-ghost btn-small', title: 'Clears your drafts and saved place on this computer for the next person', onclick: () => {
    if (!window.confirm(`End of sim on a shared computer: clear ${who}'s drafts, rejoin token and saved place on THIS computer? Your charting in the sim is kept.`)) return;
    const n = removeMatching(pred);
    after(n);
  } }, 'End of sim on this computer');
}

export const markFreshDevice = (tabId) => { const id = `${tabId}~${Date.now().toString(36)}`; save(`device.${tabId}`, id); return id; };
