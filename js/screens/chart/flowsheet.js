// Flowsheet: monitor cycle (BP/HR/SpO₂ auto-populate), charted vitals, manual entries, delegated reports.
// Rows come from session state (patients[id].flowsheet), built by the engine.

import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { at, fieldLabel } from './util.js';
import { vitalsInputs } from './vitals-form.js';
import { load, save } from '../../storage.js';

const COLS = ['bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain', 'gcs', 'glucose', 'intakeMl', 'outputMl', 'weightKg', 'neuro'];
const SHORT = { tempF: 'Temp', spo2: 'SpO₂', o2: 'O₂', intakeMl: 'In (mL)', outputMl: 'Out (mL)', weightKg: 'Wt (kg)', glucose: 'Gluc' };
const SOURCE = { prior: 'Prior shift', monitor: 'Monitor', charted: 'Charted', delegated: 'Reported' };
const who = (by) => by.replace(/^student-(\d+)$/, 'Student $1');

/**
 * Flowsheet rows in time order (oldest first). Rows are stored in the order they were recorded, which
 * isn't time order: a delegated report or a catch-up after "Skip" can land behind later rows.
 */
export function rowsByTime(ps) {
  return ps.flowsheet.map((r, i) => ({ r, i })).sort((a, b) => a.r.atMin - b.r.atMin || a.i - b.i).map((x) => x.r);
}

/** Latest value of each measure across the flowsheet: { values, times } (for the Summary). */
export function latestVitals(ps) {
  const values = {};
  const times = {};
  for (const r of rowsByTime(ps)) {
    for (const [k, v] of Object.entries(r.values)) { values[k] = v; times[k] = r.atMin; }
  }
  return { values, times };
}

export default {
  id: 'flowsheet',
  label: 'Flowsheet',
  mount(root, { pid, act, runner, scenario, catalogs, user }) {
    const HIDE_KEY = `ui.${user.userId}.flowsheet.chartedOnly`;
    // The catalog's full vital-signs intervention (vitalsCapture + temp): counts for VS orders and PRN pre-checks.
    const fullVitals = catalogs.interventions.interventions.find((i) => i.vitalsCapture && i.chartFields.includes('tempF'));
    const reveal = scenario.settings.revealManualVitals !== false;
    const cycle = h('select', {
      'aria-label': 'Monitor cycle',
      onchange: (e) => { act('setMonitor', { intervalMin: Number(e.target.value) }); toast(Number(e.target.value) ? `Monitor cycling q${e.target.value} min` : 'Monitor cycle off'); },
    }, [0, 5, 10, 15].map((m) => h('option', { value: m }, m ? `q${m} min` : 'Off')));
    const defaultCycle = scenario.settings.vitalsCycleDefaultMin;
    const monitorNote = h('span', { class: 'muted small' });

    const form = vitalsInputs(['tempF', 'rr', 'pain', 'gcs', 'glucose', 'intakeMl', 'outputMl', 'weightKg', 'neuro'], { reveal, measure: () => runner.measure(pid) });
    const withDevice = h('input', { type: 'checkbox', checked: true });
    const table = h('div', { class: 'table-wrap' });
    let chartedOnly = load(HIDE_KEY, false) === true;
    let lastState = null;
    const hideToggle = h('input', {
      type: 'checkbox', checked: chartedOnly,
      onchange: (e) => { chartedOnly = e.target.checked; save(HIDE_KEY, chartedOnly); if (lastState) renderTable(lastState); },
    });

    root.append(h('div', { class: 'chart-grid two' },
      h('section', { class: 'panel' },
        h('h3', {}, 'Monitor'),
        h('div', { class: 'controls' },
          h('label', { class: 'inline' }, 'NIBP cycle ', cycle),
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => { act('takeBpNow', {}); toast('NIBP started'); } }, 'Take BP now'),
          monitorNote),
        h('h3', {}, 'Chart vitals & measurements'),
        h('form', {
          class: 'iv-form',
          onsubmit: (e) => {
            e.preventDefault();
            const v = form.values();
            const vitals = Object.fromEntries(Object.entries(v).filter(([k]) => ['tempF', 'rr', 'pain'].includes(k)));
            const other = Object.fromEntries(Object.entries(v).filter(([k]) => !['tempF', 'rr', 'pain'].includes(k)));
            if (withDevice.checked) {
              act('chartIntervention', { interventionId: fullVitals.id, fields: vitals });
              if (Object.keys(other).length) act('flowsheetEntry', { values: other });
            } else if (Object.keys(v).length) {
              act('flowsheetEntry', { values: v });
            } else { toast('Nothing to save'); return; }
            form.reset();
            toast('Charted');
          },
        },
          h('label', { class: 'inline' }, withDevice, ' Include BP / HR / SpO₂ from the monitor (full vital signs)'),
          form.el,
          h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
        ),
      ),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h3', {}, 'Flowsheet'), h('label', { class: 'inline' }, hideToggle, ' Charted only (hide monitor rows)')),
        table),
    ));

    function renderTable(state) {
        const ps = state.patients[pid];
        const rows = rowsByTime(ps).reverse().filter((r) => !chartedOnly || r.source !== 'monitor');
        const used = COLS.filter((c) => rows.some((r) => r.values[c] != null));
        clear(table).append(h('table', { class: 'data-table flowsheet' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Time'), used.map((c) => h('th', {}, SHORT[c] || fieldLabel(c))), h('th', {}, 'Source'))),
          h('tbody', {}, rows.map((r) => h('tr', { class: `src-${r.source}` },
            h('td', {}, at(state, r.atMin)),
            used.map((c) => h('td', {}, r.values[c] != null ? String(r.values[c]) : '')),
            h('td', {}, r.source === 'charted' ? who(r.by) : r.source === 'delegated' ? `${r.by} report` : SOURCE[r.source]),
          ))),
        ));
    }

    return {
      update(state) {
        lastState = state;
        const ps = state.patients[pid];
        cycle.value = String(ps.monitor?.intervalMin ?? 0);
        monitorNote.textContent = ps.monitor ? `Started ${at(state, ps.monitor.fromMin)}` : (defaultCycle ? `Unit default q${defaultCycle} min` : '');
        renderTable(state);
      },
    };
  },
};
