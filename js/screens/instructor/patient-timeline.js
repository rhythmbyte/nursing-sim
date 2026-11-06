// Per-patient timeline: shift clock across the top, one marker per scenario change.
// Click a marker to open its change; drag it to change its time (snaps to 5 min).

import { h } from '../shared/dom.js';
import { listChanges, minToClock } from './change-model.js';

const SNAP = 5;

export function patientTimeline(template, startClock, { spanMin = 480, onOpen, onRetime }) {
  const changes = listChanges(template);
  const scheduled = changes.filter((c) => !c.manual);
  const span = Math.max(spanMin, ...scheduled.map((c) => c.atMin + 30));
  const pct = (m) => `${(m / span) * 100}%`;
  const track = h('div', { class: 'ptl-track' });
  for (let m = 0; m <= span; m += 60) track.append(h('span', { class: 'ptl-tick', style: `left:${pct(m)}` }, minToClock(startClock, m)));

  for (const c of scheduled) {
    const marker = h('button', { class: `ptl-marker ptl-${c.type}`, style: `left:${pct(c.atMin)}`, title: `${minToClock(startClock, c.atMin)} · ${c.label}`, type: 'button' }, minToClock(startClock, c.atMin));
    let drag = null;
    marker.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, moved: false }; marker.setPointerCapture(e.pointerId); });
    marker.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      if (!drag.moved) return;
      const m = Math.max(0, Math.round((c.atMin + (dx / track.clientWidth) * span) / SNAP) * SNAP);
      marker.style.left = pct(m);
      marker.textContent = minToClock(startClock, m);
      drag.m = m;
    });
    marker.addEventListener('pointerup', () => {
      const d = drag;
      drag = null;
      if (d?.moved && d.m != null && d.m !== c.atMin) onRetime(c.key, d.m);
      else if (!d?.moved) onOpen(c.key);
    });
    marker.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c.key); } });
    track.append(marker);
  }
  const manual = changes.filter((c) => c.manual);
  return h('div', { class: 'ptl-wrap' },
    track,
    manual.length ? h('div', { class: 'controls' }, h('span', { class: 'muted small' }, 'Instructor-triggered:'),
      manual.map((c) => h('button', { class: 'btn btn-small', type: 'button', onclick: () => onOpen(c.key) }, c.label.slice(0, 40)))) : null,
    h('p', { class: 'muted small' }, 'Click a marker to edit it; drag it to change its time.'),
  );
}
