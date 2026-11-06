// Brief confirmation message ("Charted: Pain assessment"). Announced to screen readers.

import { h } from './dom.js';

let region = null;

export function toast(message, ms = 2500) {
  if (!region || !region.isConnected) {
    region = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const el = h('div', { class: 'toast' }, message);
  region.append(el);
  setTimeout(() => el.remove(), ms);
}
