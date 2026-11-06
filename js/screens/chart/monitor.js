// Chart → Monitor: the bedside monitor for this patient, "Connect to monitor" (logged) and Full screen
// (so a tablet or TV next to the manikin can run it as a standalone display).

import { h } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { createMonitor } from '../monitor/bedside-monitor.js';
import { monitorView } from '../../engine/monitor.js';
import { formatShiftTime } from '../../engine/time.js';

export default {
  id: 'monitor',
  label: 'Monitor',
  mount(root, { pid, runner, catalogs, act, view }) {
    const connectBtn = h('button', { class: 'btn btn-primary', onclick: () => { act('connectMonitor', {}); toast('Connected to the monitor'); } }, 'Connect to monitor');
    const wrap = h('div', { class: 'monitor-wrap' });
    // Full screen can be refused (iframes, some browsers): say so instead of failing silently.
    const full = h('button', { class: 'btn', onclick: () => {
      const p = document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.();
      Promise.resolve(p).catch(() => toast('Full screen isn\'t allowed here. Use the browser\'s full-screen key instead.'));
    } }, 'Full screen');
    root.append(h('div', { class: 'controls' }, connectBtn, full), wrap);
    const mon = createMonitor(wrap, { isRunning: () => runner.state.clock.status === 'running', title: `Rm ${view.demographics.room} ${view.demographics.name}`,
      onSilence: () => { act('acknowledgeAlarm', {}); toast('Alarm silenced'); } });
    return {
      update(state) {
        const v = monitorView(state, pid, runner.templates()[pid], catalogs, runner.simMin());
        v.bpTime = v.bpAtMin != null ? formatShiftTime(state.startClock, v.bpAtMin) : null;
        connectBtn.hidden = Boolean(state.patients[pid].monitorLink);
        mon.setView(v);
      },
      destroy() { mon.destroy(); },
    };
  },
};
