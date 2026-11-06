// "?" help next to settings and editor fields. Text is data (data/catalogs/help.json), set once at boot.
// Keys: "<screen>.<label slug>" for labeled fields, or explicit keys for inline checkboxes.

import { h } from './dom.js';

let HELP = {};
export function setHelp(catalog) { HELP = catalog || {}; }

export const helpSlug = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');

/** A small "?" that toggles a plain-language explanation; null if there is no help text for the key. */
export function helpTip(key) {
  const text = HELP[key];
  if (!text) return null;
  const tip = h('span', { class: 'help-pop', role: 'note', hidden: true }, text);
  const btn = h('button', { class: 'help-btn', type: 'button', 'aria-label': `Help: ${text}`, 'aria-expanded': 'false',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); tip.hidden = !tip.hidden; btn.setAttribute('aria-expanded', String(!tip.hidden)); } }, '?');
  return h('span', { class: 'help' }, btn, tip);
}

/** Field with label, control, optional hint, and help looked up by `${screen}.${slug(label)}`. */
export function helpField(screen, label, el, hint) {
  return h('label', { class: 'field' }, h('span', {}, label, ' ', helpTip(`${screen}.${helpSlug(label)}`)), el, hint ? h('span', { class: 'muted small' }, hint) : null);
}
