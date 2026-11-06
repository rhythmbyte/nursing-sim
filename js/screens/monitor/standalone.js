// Standalone bedside monitor page (index.html?monitor=<patientId>): just the monitor, for a tablet or TV
// at the bedside. DISPLAY ONLY: it reads the session the main tab saves (same browser, via storage.js) and
// never writes. Full build: it would subscribe to the server's realtime channel instead (SPEC §13).

import { h, clear } from '../shared/dom.js';
import { createMonitor } from './bedside-monitor.js';
import { monitorView } from '../../engine/monitor.js';
import { effectiveTemplates } from '../../engine/templates.js';
import { simMinutes } from '../../engine/clock.js';
import { formatShiftTime } from '../../engine/time.js';

/** Pure: what the standalone page shows for a saved session at wall time `now`, or null if it can't. */
export function standaloneView(session, pid, templatesById, catalogs, now) {
  if (!session?.patients?.[pid] || !templatesById[pid]) return null;
  const templates = effectiveTemplates(templatesById, session);
  const simMin = simMinutes(session.clock, now);
  const view = monitorView(session, pid, templates[pid], catalogs, simMin);
  view.bpTime = view.bpAtMin != null ? formatShiftTime(session.startClock, view.bpAtMin) : null;
  return { view, running: session.clock.status === 'running', title: `Rm ${templatesById[pid].demographics.room} ${templatesById[pid].demographics.name}` };
}

export function mountStandaloneMonitor(root, { pid, templatesById, catalogs, loadSession, onSessionChange }) {
  document.body.classList.add('standalone-monitor');
  const wrap = h('div', { class: 'monitor-wrap standalone' });
  const status = h('p', { class: 'standalone-status' });
  const full = h('button', { class: 'mon-btn', onclick: () => Promise.resolve(document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen?.()).catch(() => {}) }, 'Full screen');
  clear(root).append(h('div', { class: 'standalone-bar' }, status, full), wrap);
  let session = loadSession();
  let mon = null;

  function render() {
    const sv = standaloneView(session, pid, templatesById, catalogs, Date.now());
    if (!sv) { status.textContent = 'Waiting for the sim… (open the sim in another tab of this browser)'; return; }
    status.textContent = `${sv.title} · follows the sim running in this browser`;
    mon ??= createMonitor(wrap, { isRunning: () => session?.clock.status === 'running', title: sv.title });
    mon.setView(sv.view);
  }
  render();
  onSessionChange(() => { session = loadSession(); render(); });
  setInterval(render, 2000); // keeps "silenced"/time-based bits fresh between saves
}
