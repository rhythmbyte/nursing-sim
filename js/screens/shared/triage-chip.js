import { h } from './dom.js';

const LABELS = { red: 'Red', yellow: 'Yellow', green: 'Green', black: 'Black' };

export function triageChip(tag) {
  return h('span', { class: `triage-chip triage-${tag}`, title: `Triage tag: ${LABELS[tag] || tag}` }, LABELS[tag] || tag);
}
