// Flowsheet: vitals over time. Phase 3 shows the prior-shift baseline + vitals the student charts
// (vs-full / vs-bp interventions). Phase 4 adds the monitor cycle and manual entries (GCS, glucose, I&O…).

import { h, clear } from '../shared/dom.js';
import { at, byWhom } from './util.js';

const COLS = [['bp', 'BP'], ['hr', 'HR'], ['rr', 'RR'], ['tempF', 'Temp'], ['spo2', 'SpO₂'], ['o2', 'O₂'], ['pain', 'Pain']];
const VITALS_INTERVENTIONS = new Set(['vs-full', 'vs-bp']);

/** Charted vitals rows, oldest first: [{ atMin, values, by, prior }]. */
export function vitalsRows(state, pid, view) {
  const rows = [{ atMin: 0, values: view.vitalsBaseline, by: 'Prior shift', prior: true }];
  for (const l of state.log) {
    if (l.patientId === pid && l.action === 'intervention' && VITALS_INTERVENTIONS.has(l.details.interventionId)) {
      const values = Object.fromEntries(Object.entries(l.details.fields || {}).filter(([, v]) => v !== '' && v != null));
      if (Object.keys(values).length) rows.push({ atMin: l.simMin, values, by: byWhom(l), prior: false });
    }
  }
  return rows;
}

/** Most recent charted vitals for the Summary: { values, label }. */
export function latestVitals(state, pid, view) {
  const r = vitalsRows(state, pid, view).at(-1);
  return { values: r.values, label: r.prior ? `${at(state, 0)} · prior shift` : `Charted ${at(state, r.atMin)} · ${r.by}` };
}

export default {
  id: 'flowsheet',
  label: 'Flowsheet',
  mount(root, { pid, view }) {
    const body = h('div', {});
    root.append(h('section', { class: 'panel' },
      h('h3', {}, 'Vital signs'),
      body,
      h('p', { class: 'muted' }, 'To add vitals, chart "Vital signs" or "Blood pressure" under Interventions. Monitor cycles arrive in phase 4.'),
    ));
    return {
      update(state) {
        clear(body).append(h('table', { class: 'data-table flowsheet' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Time'), COLS.map(([, l]) => h('th', {}, l)), h('th', {}, 'By'))),
          h('tbody', {}, vitalsRows(state, pid, view).map((r) => h('tr', { class: r.prior ? 'is-prior' : '' },
            h('td', {}, at(state, r.atMin)),
            COLS.map(([k]) => h('td', {}, r.values[k] != null ? String(r.values[k]) : '')),
            h('td', {}, r.by),
          ))),
        ));
      },
    };
  },
};
