// "Break — back at 10:45" on every screen while the instructor has the sim on a break (session.break, engine/session.js
// startBreak). The time is the wall clock (the sim clock is paused). breakText is shared with the standalone monitor.

import { h } from './dom.js';

export function breakText(b, now = Date.now()) {
  const back = new Date(b.until);
  const hhmm = `${String(back.getHours()).padStart(2, '0')}:${String(back.getMinutes()).padStart(2, '0')}`;
  const left = Math.ceil((b.until - now) / 60000);
  return `☕ Break — back at ${hhmm}${left > 0 ? ` (${left} min)` : ' (any minute now)'}. The sim is paused.`;
}

/** A banner element that follows the store; returns { el, destroy }. */
export function breakBanner(store, getSession) {
  const el = h('div', { class: 'banner break-banner', role: 'status', hidden: true });
  const render = () => { const b = getSession()?.break; el.hidden = !b; if (b) el.textContent = breakText(b); };
  render();
  const off = store.subscribe(render);
  const timer = setInterval(render, 15000);
  return { el, destroy: () => { off(); clearInterval(timer); } };
}
