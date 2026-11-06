// Color-blind-safe chip: symbol + word + color (tone). Labels/symbols/tones are data
// (rules.json rules.timeliness.tags / groupStatus.labels).
import { h } from './dom.js';

export function toneChip(info, title = '') {
  if (!info) return null;
  return h('span', { class: `tone-chip tone-${info.tone || 'neutral'}`, title: title || info.label }, `${info.symbol ? `${info.symbol} ` : ''}${info.label}`);
}
