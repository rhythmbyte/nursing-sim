// The instructor's triage tag as a chip: shape + name + color (color-blind safe).
// Symbols/labels are data (priority-scales.json instructorTags), set once at boot.
import { h } from './dom.js';

let TAGS = {};
export function setTagStyles(catalog) { TAGS = catalog?.instructorTags || {}; }

export function tagText(tag) {
  const t = TAGS[tag] || {};
  return `${t.symbol ? `${t.symbol} ` : ''}${t.label || tag}`;
}

export function triageChip(tag) {
  return h('span', { class: `triage-chip triage-${tag}`, title: `Triage tag: ${TAGS[tag]?.label || tag}` }, tagText(tag));
}
