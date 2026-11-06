// Bedside patient monitor display: canvases (ECG, pleth) + numeric tiles, alarms, mute.
// Reusable module: createMonitor(container, { isRunning }) → { el, setView(view), destroy() }.
// `view` comes from engine/monitor.js monitorView (already filtered to what the patient is connected for).
// ONE animation loop for every mounted monitor; it draws only while the page is visible and the sim runs.

import { h } from '../shared/dom.js';
import { beep } from '../shared/sound.js';
import { ecgSample, plethSample, nextRR } from './waveforms.js';

const PX_PER_SEC = 120;
const monitors = new Set();
let raf = null;
let last = 0;

function loop(ts) {
  const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
  last = ts;
  if (!document.hidden) for (const m of monitors) m.frame(dt);
  raf = monitors.size ? requestAnimationFrame(loop) : null;
}
function startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }

function sweep(canvas, color) {
  const c = canvas.getContext('2d');
  let x = 0;
  return {
    plot(values, lo, hi) {
      const { width: w, height: hgt } = canvas;
      c.strokeStyle = color;
      c.lineWidth = 2;
      for (const v of values) {
        const y = hgt - 6 - ((v - lo) / (hi - lo)) * (hgt - 12);
        c.clearRect(x, 0, 14, hgt);
        if (this.prev != null && x > 0) { c.beginPath(); c.moveTo(x - 1, this.prev); c.lineTo(x, y); c.stroke(); }
        this.prev = y;
        x += 1;
        if (x >= w) { x = 0; this.prev = null; }
      }
    },
    prev: null,
  };
}

function tile(cls, label) {
  const value = h('div', { class: 'mon-value' }, '--');
  const sub = h('div', { class: 'mon-sub' });
  const el = h('div', { class: `mon-tile ${cls}` }, h('div', { class: 'mon-label' }, label), value, sub);
  return { el, value, sub };
}

export function createMonitor(container, { isRunning, title = '', onSilence = null }) {
  let view = null;
  let muted = true; // sound off until the user turns it on (browsers need a gesture anyway)
  const ecgCanvas = h('canvas', { class: 'mon-wave', width: 640, height: 120, 'aria-label': 'ECG waveform' });
  const plethCanvas = h('canvas', { class: 'mon-wave', width: 640, height: 80, 'aria-label': 'Pleth waveform' });
  const ecgLabel = h('div', { class: 'mon-wave-label mon-green' });
  const plethLabel = h('div', { class: 'mon-wave-label mon-cyan' }, 'Pleth');
  const t = { hr: tile('mon-green', 'HR'), spo2: tile('mon-cyan', 'SpO₂ %'), nibp: tile('mon-white', 'NIBP mmHg'), rr: tile('mon-yellow', 'RR'), temp: tile('mon-orange', 'Temp °F'), o2: tile('mon-white', 'O₂') };
  const muteBtn = h('button', { class: 'mon-btn', type: 'button', onclick: () => { muted = !muted; muteBtn.textContent = muted ? '🔇 Alarms muted' : '🔊 Alarm sound on'; } }, '🔇 Alarms muted');
  const silenceBtn = h('button', { class: 'mon-btn mon-silence', type: 'button', hidden: true, onclick: () => onSilence?.() }, 'Silence alarm');
  const el = h('div', { class: 'bedside-monitor', role: 'group', 'aria-label': `Bedside monitor ${title}` },
    h('div', { class: 'mon-head' }, h('span', {}, title), h('span', {}, silenceBtn, ' ', muteBtn)),
    h('div', { class: 'mon-body' },
      h('div', { class: 'mon-waves' }, ecgLabel, ecgCanvas, plethLabel, plethCanvas),
      h('div', { class: 'mon-tiles' }, t.hr.el, t.spo2.el, t.nibp.el, t.rr.el, t.temp.el, t.o2.el)),
  );
  container.append(el);
  const ecg = sweep(ecgCanvas, '#39ff6a');
  const pleth = sweep(plethCanvas, '#36e0ff');
  let clock = 0; let beatT = 0; let rr = 1; let alarmT = 0;

  const self = {
    frame(dt) {
      if (!view || !isRunning()) return;
      const n = Math.round(dt * PX_PER_SEC);
      const draw = view.rhythm?.draw;
      const rate = view.connected.ecg ? (view.rhythm?.showsRate === false ? null : view.hr) : view.pulseRate;
      const ecgVals = []; const plVals = [];
      for (let i = 0; i < n; i++) {
        clock += 1 / PX_PER_SEC;
        beatT += 1 / PX_PER_SEC;
        if (rate && beatT >= rr) { beatT -= rr; rr = nextRR(rate, draw?.irregular); }
        ecgVals.push(view.connected.ecg ? ecgSample(draw, rate ? beatT : 9, clock) : 0);
        plVals.push(view.connected.spo2 ? plethSample(rate ? beatT : 9, view.pulse) : 0);
      }
      ecg.plot(ecgVals, -0.6, 1.2);
      pleth.plot(plVals, -0.1, 1.1);
      alarmT += dt;
      if (view.alarms.length && !view.silenced && !muted && alarmT > 1) { alarmT = 0; beep({ freq: 960, ms: 120 }); }
    },
    setView(v) {
      view = v;
      const show = (tl, on, text, sub = '') => { tl.el.hidden = !on.visible; tl.value.textContent = on.connected ? text ?? '--' : '--'; tl.sub.textContent = on.connected ? sub : 'not connected'; };
      const c = v.connected;
      ecgLabel.textContent = c.ecg ? `II · ${v.rhythm?.label || ''}` : 'ECG not connected';
      plethLabel.textContent = c.spo2 ? 'Pleth' : 'SpO₂ not connected';
      show(t.hr, { visible: true, connected: c.ecg || c.spo2 }, v.hr ?? v.pulseRate);
      show(t.spo2, { visible: true, connected: c.spo2 }, v.spo2, v.pulseRate != null ? `PR ${v.pulseRate}` : '');
      show(t.nibp, { visible: true, connected: c.nibp }, v.bp, v.bpTime ? `at ${v.bpTime}` : 'no reading yet');
      show(t.rr, { visible: true, connected: c.ecg }, v.rr);
      show(t.temp, { visible: c.temp, connected: c.temp }, v.tempF);
      show(t.o2, { visible: true, connected: true }, v.o2 || '--');
      const alarm = new Set(v.alarms);
      t.hr.el.classList.toggle('mon-alarm', alarm.has('hr') || alarm.has('rhythm'));
      t.spo2.el.classList.toggle('mon-alarm', alarm.has('spo2'));
      t.nibp.el.classList.toggle('mon-alarm', alarm.has('nibp'));
      t.rr.el.classList.toggle('mon-alarm', alarm.has('rr'));
      el.classList.toggle('mon-has-alarm', alarm.size > 0);
      silenceBtn.hidden = !onSilence || !alarm.size || v.silenced;
      silenceBtn.textContent = v.silenced ? 'Alarm silenced' : 'Silence alarm';
    },
    destroy() { monitors.delete(self); el.remove(); },
  };
  monitors.add(self);
  startLoop();
  return { el, setView: self.setView, destroy: self.destroy };
}
