// Live control → Adjust vitals: current values, edit any of them, apply now or trend over N minutes.
// Quick buttons come from data (catalog vitals-presets.json + the patient's own vitalsPresets).

import { h } from '../shared/dom.js';
import { openModal } from '../shared/modal.js';
import { badge } from '../shared/badge.js';
import { presetTarget } from '../../engine/vitals-control.js';

const FIELDS = [['rhythm', 'Rhythm'], ['bp', 'BP'], ['hr', 'HR'], ['rr', 'RR'], ['tempF', 'Temp °F'], ['spo2', 'SpO₂ %'], ['o2', 'O₂ device'], ['pain', 'Pain'], ['gcs', 'GCS'], ['glucose', 'Glucose']];

/** Compact current vitals for the patients table. */
export function vitalsSummary(ps) {
  const v = ps.vitals;
  const parts = [v.bp && `BP ${v.bp}`, v.hr != null && `HR ${v.hr}`, v.rr != null && `RR ${v.rr}`, v.spo2 != null && `SpO₂ ${v.spo2}%`].filter(Boolean).join(' · ');
  return h('span', {}, parts, ps.vitalsTrend ? [' ', badge('trending', 'pending')] : null);
}

export function openAdjustVitals(runner, pid, name, template, catalogs, user) {
  const ps = runner.state.patients[pid];
  const inputs = Object.fromEntries(FIELDS.map(([k]) => [k, h('input', { class: 'input', value: ps.vitals[k] ?? '', 'aria-label': k })]));
  // Rhythm: pick from data/catalogs/rhythms.json (codes may have set an alias such as "PEA").
  inputs.rhythm = h('select', { 'aria-label': 'rhythm' }, h('option', { value: ps.vitals.rhythm ?? '' }, ps.vitals.rhythm ? `${ps.vitals.rhythm} (current)` : '—'),
    Object.entries(catalogs.rhythms?.rhythms || {}).filter(([id]) => id !== ps.vitals.rhythm).map(([id, r]) => h('option', { value: id }, r.label)));
  const overMin = h('input', { class: 'input', type: 'number', min: 1, value: 10, 'aria-label': 'Trend minutes' });
  const modeNow = h('input', { type: 'radio', name: `vmode-${pid}`, checked: true });
  const modeTrend = h('input', { type: 'radio', name: `vmode-${pid}` });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const { presets = [], limits = {} } = catalogs.vitalsPresets || {};
  const allPresets = [...presets, ...(template.vitalsPresets || [])];

  let presetId = null;
  function applyPreset(p) {
    presetId = p.id;
    const target = presetTarget(ps.vitals, p, limits);
    for (const [k, v] of Object.entries(target)) if (inputs[k]) inputs[k].value = String(v);
    if (p.overMin) { overMin.value = String(p.overMin); modeTrend.checked = true; } else modeNow.checked = true;
  }

  openModal({
    title: `Adjust vitals · ${name}`,
    wide: true,
    body: h('div', { class: 'iv-form' },
      allPresets.length ? h('div', { class: 'controls' }, h('span', { class: 'muted small' }, 'Quick:'),
        allPresets.map((p) => h('button', { class: 'btn btn-small', type: 'button', title: p.review === 'proposed' || catalogs.vitalsPresets?.review === 'proposed' ? 'Proposed preset: needs instructor review' : '', onclick: () => applyPreset(p) }, p.label))) : null,
      h('div', { class: 'editor-grid' }, FIELDS.map(([k, label]) => h('label', { class: 'field' }, h('span', {}, label), inputs[k]))),
      h('div', { class: 'controls' },
        h('label', { class: 'inline' }, modeNow, ' Apply now'),
        h('label', { class: 'inline' }, modeTrend, ' Trend over ', overMin, ' min')),
      h('p', { class: 'muted small' }, 'Changes feed the monitor, Take BP now, Measure, delegated reports, parameter rules and the debrief. A scripted vitals event takes over again unless the scenario says otherwise.'),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Apply', kind: 'primary', onClick: () => {
          // Only fields the instructor actually changed.
          const values = Object.fromEntries(Object.entries(inputs).filter(([k, el]) => el.value.trim() !== String(ps.vitals[k] ?? '')).map(([k, el]) => [k, el.value]));
          if (!Object.keys(values).length) { err.textContent = 'Nothing changed.'; return false; }
          try {
            runner.adjustVitals(pid, { values, overMin: modeTrend.checked ? Number(overMin.value) : 0, presetId }, user);
            return true;
          } catch (e) { err.textContent = e.message; return false; }
        },
      },
    ],
  });
}
