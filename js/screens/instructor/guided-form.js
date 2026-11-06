// Guided event builder (instructor): one "Add event" form used by scenario changes, reaction effects, patient states
// and Live control. Pick the event type, then only the fields that type needs, with dropdowns from the catalogs and
// the patient. Vitals rows auto-fill "From" with what the patient will be at that point. Model: guided-model.js.
// ctx = { context: change|reaction|state|live, template, catalogs, fromVitals: () => vitals, normal, penaltyPreview? }

import { h, clear } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { answersEditor } from './assessment-answers.js';
import { scriptOptions, select, input } from './script-parts.js';
import { TYPES, CONTEXT_TYPES, VITALS, minToOver, vitalNow, directionOf, rowText, previewText, parseO2 } from './guided-model.js';

const UNIT_OPTS = [['instant', 'instantly'], ['seconds', 'seconds'], ['minutes', 'minutes'], ['hours', 'hours']];
const DIR_OPTS = [['worsen', 'worsens'], ['improve', 'improves'], ['set', 'set to']];
const rangeText = (r) => (r ? (r[0] === r[1] ? `normal ${r[0]}` : `normal ${r[0]}–${r[1]}`) : '');

function vitalsRows(ge, ctx, onChange) {
  const rows = [];
  const box = h('div', { class: 'pick-list guided-rows' });
  const devices = ctx.catalogs.vitals?.o2Devices?.devices || [];
  function add(r = { vital: 'spo2', direction: 'worsen', from: '', to: '', overN: 5, overUnit: 'minutes' }) {
    const n = rows.length + 1;
    const from0 = vitalNow(ctx.fromVitals(), r.vital);
    const st = { touchedFrom: r.from !== '' && r.from != null && String(r.from) !== String(from0 ?? '') };
    const vital = select(`Row ${n} vital`, VITALS.map((v) => [v.id, v.label]), r.vital);
    const dir = select(`Row ${n} direction`, DIR_OPTS, r.direction);
    const from = input(`Row ${n} from`, r.from === '' ? from0 ?? '' : r.from, { placeholder: 'from' });
    const to = input(`Row ${n} to`, r.to, { placeholder: 'to' });
    const note = input(`Row ${n} pain description`, r.note || '', { placeholder: 'description (optional)' });
    const device = select(`Row ${n} O₂ device`, devices.map((d) => [d.id, d.label]), r.vital === 'o2' ? r.to : 'NC');
    const lpm = input(`Row ${n} liters per minute`, r.lpm ?? '', { type: 'number', min: 0, max: 60, placeholder: 'L/min' });
    const overN = input(`Row ${n} over`, r.overN, { type: 'number', min: 0, placeholder: 'how long' });
    const unit = select(`Row ${n} unit`, UNIT_OPTS, r.overUnit);
    const hint = h('span', { class: 'muted small' });
    const line = h('div', { class: 'guided-preview muted small', 'aria-live': 'polite' });
    const row = { vital, dir, from, to, note, device, lpm, overN, unit, st };
    const value = () => (vital.value === 'o2'
      ? { vital: 'o2', direction: 'set', from: from.value, to: device.value, lpm: lpm.value, overN: '', overUnit: 'instant' }
      : { vital: vital.value, direction: dir.value, from: from.value, to: to.value, overN: overN.value, overUnit: unit.value, ...(vital.value === 'pain' && note.value.trim() ? { note: note.value.trim() } : {}) });
    row.value = value;
    const sync = () => {
      const o2 = vital.value === 'o2';
      for (const el of [dir, to, overN, unit]) el.hidden = o2;
      device.hidden = !o2; lpm.hidden = !o2 || !(devices.find((d) => d.id === device.value)?.flow);
      note.hidden = vital.value !== 'pain';
      overN.disabled = unit.value === 'instant';
      hint.textContent = o2 ? '' : rangeText(ctx.normal?.[vital.value]);
      line.textContent = rowText(value(), ctx.normal);
      onChange();
    };
    vital.addEventListener('change', () => { if (!st.touchedFrom) from.value = vital.value === 'o2' ? ctx.fromVitals().o2 ?? '' : vitalNow(ctx.fromVitals(), vital.value) ?? ''; sync(); });
    from.addEventListener('input', () => { st.touchedFrom = true; sync(); });
    to.addEventListener('input', () => { // suggest the direction from the normal range, unless the instructor picked one
      if (!st.touchedDir) { const d = directionOf(vital.value, from.value, to.value, ctx.normal); if (d !== 'set') dir.value = d; }
      sync();
    });
    dir.addEventListener('change', () => { st.touchedDir = true; sync(); });
    for (const el of [overN, unit, device, lpm, note]) { el.addEventListener('input', sync); el.addEventListener('change', sync); }
    const el = h('div', { class: 'guided-row' },
      h('div', { class: 'pick-row' }, vital, dir, h('span', { class: 'muted small' }, 'from'), from, device, lpm, h('span', { class: 'muted small' }, 'to'), to, note, overN, unit,
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { el.remove(); rows.splice(rows.indexOf(row), 1); onChange(); } }, 'Remove')),
      h('div', {}, hint, ' ', line));
    rows.push(row);
    box.append(el);
    sync();
  }
  (ge.rows?.length ? ge.rows : [undefined]).forEach((r) => add(r));
  return {
    el: h('div', {}, box, h('button', { class: 'btn btn-small', type: 'button', onclick: () => add() }, 'Add a vital')),
    value: () => rows.map((r) => r.value()),
    /** The point in the scenario moved (e.g. the change's time): refill "From" where the instructor didn't type one. */
    refreshFrom: () => rows.forEach((r) => { if (!r.st.touchedFrom) { r.from.value = r.vital.value === 'o2' ? ctx.fromVitals().o2 ?? '' : vitalNow(ctx.fromVitals(), r.vital.value) ?? ''; r.from.dispatchEvent(new Event('change')); } }),
  };
}

function orderRows(ge, ctx, onChange) {
  const rows = [];
  const box = h('div', { class: 'pick-list' });
  const ivs = ctx.catalogs.interventions.interventions;
  const add = (o = { text: '', type: 'once', tier: 2 }) => {
    const n = rows.length + 1;
    const r = { id: o.id || null, delegable: o.delegable,
      text: input(`New order ${n}`, o.text, { placeholder: 'e.g. Obtain 12-lead ECG now' }),
      type: select(`New order ${n} type`, ['once', 'prn', 'scheduled', 'continuous'].map((x) => [x, x]), o.type),
      tier: select(`New order ${n} tier`, [1, 2, 3].map((x) => [x, `Tier ${x}`]), o.tier),
      iv: select(`New order ${n} satisfied by`, ivs.map((i) => [i.id, i.label]), o.interventionId, { blank: '(charting that satisfies it)' }),
      med: input(`New order ${n} medication`, o.med || '', { placeholder: 'med on the MAR (optional)' }) };
    rows.push(r);
    box.append(h('div', { class: 'pick-row' }, r.text, r.type, r.tier, r.iv, r.med));
    r.text.addEventListener('input', onChange);
  };
  (ge.orders?.length ? ge.orders : [undefined]).forEach((o) => add(o));
  return { el: h('div', {}, box, h('button', { class: 'btn btn-small', type: 'button', onclick: () => add() }, 'Add order')),
    value: () => rows.map((r) => ({ id: r.id, text: r.text.value, type: r.type.value, tier: Number(r.tier.value), interventionId: r.iv.value, med: r.med.value.trim(), delegable: Boolean(r.delegable) })) };
}

/** One guided event. Returns { el, value() → ge, refreshFrom() }. */
export function eventForm(ge0, ctx, { onRemove = null } = {}) {
  const ge = { type: CONTEXT_TYPES[ctx.context][0], ...ge0 };
  const opts = scriptOptions(ctx.template, ctx.catalogs);
  const types = CONTEXT_TYPES[ctx.context].filter((t) => t !== 'state' || ctx.template.script).filter((t) => t !== 'fire' || opts.events.length);
  const type = select('Event type', types.map((t) => [t, TYPES[t]]), ge.type);
  const body = h('div', { class: 'guided-body' });
  const preview = h('p', { class: 'guided-summary small', 'aria-live': 'polite' });
  const rhythms = opts.rhythms.map((r) => [r.id, r.label]);
  const names = { state: (id) => opts.states.find((s) => s.id === id)?.label || id, rhythm: (id) => opts.rhythms.find((r) => r.id === id)?.label || id,
    tool: (id) => ctx.catalogs.assessmentTools?.tools.find((t) => t.id === id)?.name || id };
  let part = null; // { value(): partial ge, refreshFrom? }
  const show = () => { try { preview.textContent = previewText(value(), { normal: ctx.normal, names }); } catch { preview.textContent = ''; } };

  function build(t, g) {
    const fld = (label, el, help = null) => h('label', { class: 'field' }, h('span', {}, label, ' ', help ? helpTip(help) : null), el);
    if (t === 'vitals') { const r = vitalsRows(g, ctx, show); return { el: r.el, value: () => ({ rows: r.value(), extra: g.extra }), refreshFrom: r.refreshFrom }; }
    if (t === 'rhythm') { const s = select('Rhythm', rhythms, g.rhythm, { blank: '(pick a rhythm)', onchange: show }); return { el: fld('Rhythm', s), value: () => ({ rhythm: s.value }) }; }
    if (t === 'call-light' || t === 'admission') { const m = h('textarea', { class: 'input', rows: 2, 'aria-label': t === 'admission' ? 'Admission report' : 'What the patient says', oninput: show }); m.value = g.message || ''; return { el: fld(t === 'admission' ? 'Admission report (shown on the admissions board)' : 'What the patient says', m), value: () => ({ message: m.value }) }; }
    if (t === 'staff-message') {
      const from = select('From', (ctx.catalogs.staff?.messageFrom || ['CNA']).map((x) => [x, x]), g.from || 'CNA', { onchange: show });
      const m = h('textarea', { class: 'input', rows: 2, 'aria-label': 'Message', oninput: show }); m.value = g.message || '';
      return { el: h('div', {}, fld('From', from), fld('Message', m)), value: () => ({ from: from.value, message: m.value }) };
    }
    if (t === 'new-orders') {
      if (ctx.context === 'reaction') {
        const set = select('Order set', opts.orderSets.map((x) => [x, x]), g.orderSet, { blank: '(order set)', onchange: show });
        const m = input('Message', g.message || '', { placeholder: 'e.g. New orders from the provider' });
        return { el: h('div', {}, fld('Order set (orders already in this patient)', set), fld('Message', m)), value: () => ({ orderSet: set.value, message: m.value }) };
      }
      const o = orderRows(g, ctx, show); return { el: o.el, value: () => ({ orders: o.value() }) };
    }
    if (t === 'lab-result') { const s = select('Pending lab', opts.pendingLabs.map((l) => [l.code, l.label]), g.labCode, { blank: '(pending lab)', onchange: show }); return { el: fld('Lab to release (its scripted value)', s), value: () => ({ labCode: s.value, labLabel: g.labCode === s.value ? g.labLabel : '' }) }; }
    if (t === 'assessment') { const a = answersEditor(ctx.catalogs, g.answers || {}, { title: 'Event' }); return { el: a.el, value: () => ({ answers: a.value() }) }; }
    if (t === 'state') { const s = select('Go to state', opts.states.map((x) => [x.id, x.label]), g.to, { blank: '(state)', onchange: show }); return { el: fld('Go to state', s), value: () => ({ to: s.value }) }; }
    if (t === 'code') {
      const arrest = select('Arrest rhythm', rhythms.filter(([id]) => ctx.catalogs.rhythms?.rhythms?.[id]?.pulseless), g.rhythm, { blank: '(arrest rhythm)', onchange: show });
      const outcome = select('Planned outcome', [['instructor', 'Instructor decides'], ['survive', 'Survives (ROSC)'], ['die', 'Dies (no ROSC)']], g.outcome || 'instructor', { onchange: show });
      const rosc = select('ROSC rhythm', rhythms.filter(([id]) => !ctx.catalogs.rhythms?.rhythms?.[id]?.pulseless), g.roscRhythm, { blank: '(scenario default)', onchange: show });
      const m = input('Code message', g.message || '', { placeholder: 'optional, e.g. Patient is unresponsive' });
      return { el: h('div', { class: 'editor-grid' }, fld('Arrest rhythm', arrest), fld('Planned outcome', outcome, 'event.outcome'), fld('ROSC rhythm', rosc), fld('Code message', m)),
        value: () => ({ rhythm: arrest.value, outcome: outcome.value, roscRhythm: rosc.value, message: m.value }) };
    }
    if (t === 'findings') { const a = h('textarea', { class: 'input', rows: 2, 'aria-label': 'New findings', placeholder: 'One per line' }); a.value = g.findingsText || ''; return { el: fld('New findings (one per line)', a), value: () => ({ findingsText: a.value, change: g.change }) }; }
    if (t === 'fire') { const s = select('Event to fire', opts.events.map((e) => [e.id, e.label]), g.eventId, { blank: '(event)', onchange: show }); return { el: fld('Event to fire (with its linked events)', s), value: () => ({ eventId: s.value }) }; }
    if (t === 'penalty') return ctx.penaltyPart(g, show);
    return { el: h('p', {}, 'Not available here.'), value: () => ({}) };
  }
  const value = () => ({ type: type.value, ...(ge.id && type.value === ge.type ? { id: ge.id, orig: ge.orig } : {}), ...(part ? part.value() : {}) });
  const render = () => { part = build(type.value, type.value === ge.type ? ge : {}); clear(body).append(part.el); show(); };
  type.addEventListener('change', render);
  body.addEventListener('input', show); body.addEventListener('change', show);
  render();
  const el = h('div', { class: 'guided-event' },
    h('div', { class: 'pick-row' }, h('label', { class: 'inline' }, 'Event ', type), onRemove ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { el.remove(); onRemove(); } }, 'Remove event') : null),
    body, preview);
  return { el, value, refreshFrom: () => part?.refreshFrom?.() };
}

/** A list of guided events with "Add event". Returns { el, value() → ge[], refreshFrom() }. */
export function eventList(list, ctx) {
  const items = [];
  const box = h('div', { class: 'guided-list' });
  const add = (ge = {}) => { const f = eventForm(ge, ctx, { onRemove: () => items.splice(items.indexOf(f), 1) }); items.push(f); box.append(f.el); };
  list.forEach(add);
  return {
    el: h('div', {}, box, h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => add() }, 'Add event'), ' ', helpTip('event.builder')),
    value: () => items.map((f) => f.value()),
    refreshFrom: () => items.forEach((f) => f.refreshFrom()),
  };
}
