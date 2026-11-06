// "Busy" banner for a student doing a timed task (engine/tasks.js): what, which patient, a progress bar, time left and
// "Interrupt task" (stops it; nothing is charted). Alerts, call lights and the monitor keep working meanwhile.
// Updates itself on ticks; returns { el, destroy }.

import { h, clear } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';

const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s` : `${sec} s`);

export function busyBanner(store, runner, user, roomOf) {
  const el = h('div', { class: 'busy-banner-wrap', 'aria-live': 'polite' });
  let lastKey = '';
  const render = () => {
    const b = runner.busy(user.userId);
    const key = b ? `${b.label}|${b.leftSec}` : '';
    if (key === lastKey) return;
    lastKey = key;
    clear(el).append(...(b ? [h('div', { class: 'banner busy-banner', role: 'status' },
      h('strong', {}, 'Busy: '), `${b.label} · ${roomOf(b.patientId)} `,
      h('progress', { max: 1, value: b.fraction, 'aria-label': 'Task progress' }),
      h('span', { class: 'busy-left' }, ` ${fmt(b.leftSec)} left `), helpTip('chart.busy'),
      h('button', { class: 'btn btn-small', onclick: () => runner.interruptTask(user) }, 'Interrupt task'))] : []));
  };
  render();
  const off = store.on('tick', render);
  const offSet = store.subscribe(render);
  return { el, destroy: () => { off(); offSet(); } };
}
