// Task duration overrides (patient editor, Sim setup): pick a task (intervention, assessment tool or MAR action),
// a number and seconds / minutes. Stored in sim seconds as { key: sec } (keys: interventionId, tool:<id>, mar:<result>).

import { h } from '../shared/dom.js';
import { select, input } from './script-parts.js';

export function taskOptions(catalogs) {
  return [
    ...catalogs.interventions.interventions.map((i) => [i.id, `${i.label} (${i.durationSec ?? '?'} s)`]),
    ...(catalogs.assessmentTools?.tools || []).map((t) => [`tool:${t.id}`, `${t.name} (${t.durationSec ?? '?'} s)`]),
    ...Object.entries(catalogs.taskTiming?.mar || {}).map(([r, sec]) => [`mar:${r}`, `MAR: ${r.replace('-', ' ')} (${sec} s)`]),
  ];
}

/** Returns { el, value() → { key: sec } }. */
export function durationOverrides(catalogs, value = {}, { label = 'Task time' } = {}) {
  const rows = [];
  const box = h('div', { class: 'pick-list' });
  const opts = taskOptions(catalogs);
  const add = (key = '', sec = '') => {
    const n = rows.length + 1;
    const inMin = sec !== '' && sec >= 60 && sec % 60 === 0;
    const r = { task: select(`${label} ${n} task`, opts, key, { blank: '(pick a task)' }), n: input(`${label} ${n} amount`, sec === '' ? '' : inMin ? sec / 60 : sec, { type: 'number', min: 0 }),
      unit: select(`${label} ${n} unit`, [['seconds', 'seconds'], ['minutes', 'minutes']], inMin ? 'minutes' : 'seconds') };
    const el = h('div', { class: 'pick-row' }, r.task, r.n, r.unit, h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { el.remove(); rows.splice(rows.indexOf(r), 1); } }, 'Remove'));
    rows.push(r); box.append(el);
  };
  Object.entries(value || {}).forEach(([k, v]) => add(k, v));
  return {
    el: h('div', {}, box, h('button', { class: 'btn btn-small', type: 'button', onclick: () => add() }, 'Add a task time')),
    value: () => Object.fromEntries(rows.filter((r) => r.task.value && r.n.value !== '').map((r) => [r.task.value, Number(r.n.value) * (r.unit.value === 'minutes' ? 60 : 1)])),
  };
}
