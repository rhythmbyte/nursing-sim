// Vitals inputs shared by the Flowsheet and the vital-sign interventions.
// Device values (BP/HR/SpO₂) are never typed: they're read from the monitor when saved.
// Temp/RR/pain are typed; "Measure" fills them only if the scenario reveals manual vitals.

import { h } from '../shared/dom.js';
import { fieldLabel } from './util.js';

const DEVICE = new Set(['bp', 'hr', 'spo2']);

/**
 * Returns { el, values(), reset() }.
 * fields: chart field ids to show. measure(): {tempF, rr, pain} or {} (from runner.measure).
 */
export function vitalsInputs(fields, { measure, reveal }) {
  const device = fields.filter((f) => DEVICE.has(f));
  const manual = fields.filter((f) => !DEVICE.has(f));
  const inputs = Object.fromEntries(manual.map((f) => [f, h('input', { type: 'text', class: 'input', name: f, inputmode: f === 'pain' || f === 'neuro' ? 'text' : 'decimal' })]));
  const scriptedManual = manual.filter((f) => ['tempF', 'rr', 'pain'].includes(f));

  const el = h('div', { class: 'vitals-inputs' },
    device.length ? h('p', { class: 'muted small' }, `${device.map(fieldLabel).join(', ')}: read from the monitor when you save.`) : null,
    manual.map((f) => h('label', { class: 'field' }, h('span', {}, fieldLabel(f)), inputs[f])),
    reveal && scriptedManual.length ? h('button', {
      type: 'button',
      class: 'btn btn-small',
      onclick: () => {
        const m = measure();
        for (const f of scriptedManual) if (m[f] != null) inputs[f].value = String(m[f]);
      },
    }, `Measure ${scriptedManual.map(fieldLabel).join(' / ')}`) : null,
    !reveal && scriptedManual.length ? h('p', { class: 'muted small' }, 'Get temp, RR and pain from the manikin or your instructor.') : null,
  );

  return {
    el,
    values: () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]).filter(([, v]) => v !== '')),
    reset: () => Object.values(inputs).forEach((i) => { i.value = ''; }),
  };
}
