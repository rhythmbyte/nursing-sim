// Live sim clock display: "08:15 · Running · 2x". Updates on the store's 'tick' event.
// Returns { el, destroy }.

import { h } from './dom.js';
import { formatShiftTime, formatRemaining } from '../../engine/time.js';

const STATUS = { ready: 'Not started', running: 'Running', paused: 'Paused', ended: 'Ended' };

export function simClock(store, runner) {
  const time = h('span', { class: 'sim-time' });
  const meta = h('span', { class: 'sim-meta' });
  const left = h('span', { class: 'sim-left' });
  const el = h('div', { class: 'sim-clock', role: 'timer', 'aria-live': 'off' }, time, meta, left);

  function update() {
    const s = runner.state;
    time.textContent = formatShiftTime(s.startClock, runner.simMin());
    meta.textContent = `${STATUS[s.clock.status]} · ${s.clock.speed}x`;
    // Time remaining until the scenario's end clock (none for open-ended scenarios).
    left.textContent = s.endMin == null ? '' : s.clock.status === 'ended' ? 'Shift over' : formatRemaining(s.endMin - runner.simMin());
    el.dataset.status = s.clock.status;
  }

  update();
  const offTick = store.on('tick', update);
  const offSet = store.subscribe(update);
  return { el, destroy: () => { offTick(); offSet(); } };
}

/** Whole sim minutes since `sinceMin`, e.g. "4 min". */
export function elapsed(simMin, sinceMin) {
  return `${Math.max(0, Math.floor(simMin - sinceMin))} min`;
}
