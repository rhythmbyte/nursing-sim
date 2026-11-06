// "Busy" banner for a student doing a timed task (engine/tasks.js): what, which patient, a progress bar, time left,
// "Pause task" (step away and come back) and "Interrupt task" (stops it; nothing is charted). A paused task shows its own
// line with Resume and Drop. Alerts, call lights and the monitor keep working meanwhile.
// Updates itself on ticks; returns { el, destroy }.

import { h, clear } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { toast } from '../shared/toast.js';

const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s` : `${sec} s`);

export function busyBanner(store, runner, user, roomOf) {
  const el = h('div', { class: 'busy-banner-wrap', 'aria-live': 'polite' });
  let lastKey = '';
  const render = () => {
    const b = runner.busy(user.userId);
    const p = runner.paused(user.userId);
    const key = `${b ? `${b.label}|${b.leftSec}` : ''}#${p ? p.label : ''}`;
    if (key === lastKey) return;
    lastKey = key;
    const act = (fn) => () => { try { fn(); } catch (e) { toast(e.message, 5000); } };
    clear(el).append(...[b ? h('div', { class: 'banner busy-banner', role: 'status' },
      h('strong', {}, b.resumed ? 'Busy (resumed): ' : 'Busy: '), `${b.label} · ${roomOf(b.patientId)} `,
      h('progress', { max: 1, value: b.fraction, 'aria-label': 'Task progress' }),
      h('span', { class: 'busy-left' }, ` ${fmt(b.leftSec)} left `), helpTip('chart.busy'),
      h('button', { class: 'btn btn-small', disabled: Boolean(p), title: p ? 'You already have a paused task' : 'Step away and come back to it', onclick: act(() => runner.pauseTask(user)) }, 'Pause task'),
      h('button', { class: 'btn btn-small', onclick: act(() => runner.interruptTask(user)) }, 'Interrupt task')) : null,
    p ? h('div', { class: 'banner paused-banner', role: 'status' },
      h('strong', {}, 'Paused: '), `${p.label} · ${roomOf(p.patientId)} · ${fmt(p.leftSec)} left when you come back `,
      h('button', { class: 'btn btn-small btn-primary', disabled: Boolean(b), title: b ? 'Finish or pause the current task first' : 'Carry on with it', onclick: act(() => runner.resumeTask(user)) }, 'Resume'),
      h('button', { class: 'btn btn-small btn-ghost', onclick: act(() => runner.dropPausedTask(user)) }, 'Drop task')) : null].filter(Boolean));
  };
  render();
  const off = store.on('tick', render);
  const offSet = store.subscribe(render);
  return { el, destroy: () => { off(); offSet(); } };
}
