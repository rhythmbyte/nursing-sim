// Guided event builder model (pure, no DOM, tested). One "guided event" (ge) shape for every place events are made:
// scenario changes, reaction effects, patient states and Live control. Converters below turn a ge into what each
// place stores (keyframes, effects, state fields, runner calls) and back.
//
// ge = { type, rows?, rhythm?, from?, message?, orders?, orderSet?, labCode?, answers?, to?, outcome?, roscRhythm?,
//        findingsText?, change?, eventId?, penalty?, id? (kept event id) }
// rows (vitals) = [{ vital, direction: improve|worsen|set, from, to, overN, overUnit: instant|seconds|minutes|hours, lpm? (O₂), note? (pain text) }]

export const TYPES = {
  vitals: 'Vitals change', rhythm: 'Rhythm change', 'call-light': 'Call light', 'staff-message': 'Staff message',
  'new-orders': 'New orders', 'lab-result': 'Lab result', assessment: 'Assessment change', state: 'State change',
  code: 'Code / cardiac arrest', admission: 'Admission', findings: 'Reveal new findings', fire: 'Fire one of this patient\'s events', penalty: 'Recovery penalty',
};
export const CONTEXT_TYPES = {
  change: ['vitals', 'rhythm', 'call-light', 'staff-message', 'new-orders', 'lab-result', 'assessment', 'state', 'code', 'admission'],
  reaction: ['vitals', 'rhythm', 'call-light', 'staff-message', 'new-orders', 'lab-result', 'assessment', 'state', 'code', 'findings', 'fire', 'penalty'],
  state: ['vitals', 'rhythm', 'assessment'],
  live: ['vitals', 'rhythm', 'call-light', 'staff-message', 'new-orders', 'lab-result', 'assessment', 'state', 'code'],
};
export const VITALS = [
  { id: 'spo2', label: 'SpO₂', unit: '%' }, { id: 'hr', label: 'HR', unit: ' bpm' }, { id: 'sbp', label: 'BP systolic', unit: ' mmHg' },
  { id: 'dbp', label: 'BP diastolic', unit: ' mmHg' }, { id: 'rr', label: 'RR', unit: '/min' }, { id: 'tempF', label: 'Temp', unit: ' °F' },
  { id: 'pain', label: 'Pain', unit: '/10' }, { id: 'gcs', label: 'GCS', unit: '' }, { id: 'glucose', label: 'Glucose', unit: ' mg/dL' }, { id: 'o2', label: 'O₂ device', unit: '' },
];
export const UNITS = { instant: 0, seconds: 1 / 60, minutes: 1, hours: 60 };
const vitalOf = (k) => VITALS.find((v) => v.id === k);
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Sim minutes from "number + unit" (instant = 0). */
export const overToMin = (n, unit) => (unit === 'instant' ? 0 : (num(n) ?? 0) * (UNITS[unit] ?? 1));
/** { overN, overUnit } for a duration in sim minutes. */
export function minToOver(min) {
  const m = Number(min) || 0;
  if (!m) return { overN: '', overUnit: 'instant' };
  if (m < 1) return { overN: Math.round(m * 60), overUnit: 'seconds' };
  if (m >= 60 && m % 60 === 0) return { overN: m / 60, overUnit: 'hours' };
  return { overN: m, overUnit: 'minutes' };
}
const overText = (min) => {
  const { overN, overUnit } = minToOver(min);
  return overUnit === 'instant' ? 'instantly' : `over ${overN} ${overN === 1 ? overUnit.slice(0, -1) : overUnit}`;
};

/** A vital's number from patient vitals ({ bp: '120/80' } → sbp 120). */
export function vitalNow(values, k) {
  if (k === 'sbp' || k === 'dbp') { const m = /^(\d+)\/(\d+)/.exec(String(values?.bp ?? '')); return m ? Number(m[k === 'sbp' ? 1 : 2]) : null; }
  if (k === 'pain') return num(/^(\d+(\.\d+)?)/.exec(String(values?.pain ?? ''))?.[1]);
  if (k === 'o2') return values?.o2 ?? null;
  return num(values?.[k]);
}

const dist = (v, [lo, hi]) => (v < lo ? lo - v : v > hi ? v - hi : 0);
/** improve / worsen relative to a normal range [lo, hi]; set when it can't be told. */
export function directionOf(k, from, to, normal) {
  const r = normal?.[k];
  if (!r || num(from) == null || num(to) == null || Number(from) === Number(to)) return 'set';
  return dist(Number(to), r) < dist(Number(from), r) ? 'improve' : dist(Number(to), r) > dist(Number(from), r) ? 'worsen' : 'set';
}

/** O₂ text ("4 L NC") ⇄ { device, lpm }. */
export function parseO2(text) {
  const m = /^(\d+(\.\d+)?)\s*L(?:PM)?\s+(.+)$/i.exec(String(text ?? '').trim());
  return m ? { device: m[3], lpm: Number(m[1]) } : { device: String(text ?? '').trim(), lpm: null };
}
export const o2Text = (device, lpm) => (num(lpm) ? `${Number(lpm)} L ${device}` : device);

/**
 * Vitals rows → { values, valuesRel, overMin, overMinBy } (BP rows combine; rows without "to" are skipped). A row with
 * direction "rel" is a change from the patient's baseline ("SBP by −30"), resolved per patient (engine/cases.js).
 */
export function rowsToValues(rows, fromVitals = {}) {
  const values = {}; const by = {}; const valuesRel = {};
  const bp = {};
  for (const r of rows || []) {
    if (r.vital === 'pain' && (r.to === '' || r.to == null) && r.note) { values.pain = r.note; by.pain = 0; continue; } // pain text only
    if (r.to === '' || r.to == null) continue;
    const min = overToMin(r.overN, r.overUnit);
    if (r.direction === 'rel' && REL_VITALS.includes(r.vital)) { const k = r.vital === 'sbp' || r.vital === 'dbp' ? 'bp' : r.vital; valuesRel[r.vital] = Number(r.to); by[k] = Math.max(by[k] ?? 0, min); continue; }
    if (r.vital === 'sbp' || r.vital === 'dbp') { bp[r.vital] = Number(r.to); by.bp = Math.max(by.bp ?? 0, min); continue; }
    if (r.vital === 'o2') { values.o2 = o2Text(r.to, r.lpm); by.o2 = 0; continue; }
    values[r.vital] = r.vital === 'pain' ? `${Number(r.to)}/10${r.note ? ` ${r.note}` : ''}` : Number(r.to);
    by[r.vital] = min;
  }
  if (bp.sbp != null || bp.dbp != null) values.bp = `${bp.sbp ?? vitalNow(fromVitals, 'sbp') ?? 120}/${bp.dbp ?? vitalNow(fromVitals, 'dbp') ?? 80}`;
  const times = [...new Set(Object.values(by))];
  const overMin = times.length === 1 ? times[0] : Math.max(0, ...times);
  return { values, valuesRel, overMin, overMinBy: times.length > 1 ? by : null };
}
/** Vitals that can be relative to the baseline. */
export const REL_VITALS = ['hr', 'rr', 'spo2', 'tempF', 'sbp', 'dbp'];
const relRows = (rel = {}, overMin = 0, overMinBy = null) => Object.entries(rel || {}).map(([k, d]) => ({ vital: k, direction: 'rel', from: '', to: d, ...minToOver(overMinBy?.[k === 'sbp' || k === 'dbp' ? 'bp' : k] ?? overMin) }));
const withRel = (v) => (Object.keys(v.valuesRel || {}).length ? { valuesRel: v.valuesRel } : {});
const hasAny = (v) => Object.keys(v.values).length || Object.keys(v.valuesRel || {}).length;

/** { values, overMin, overMinBy } (+ valuesRel) → rows (direction from the normal range; From from fromVitals). */
export function valuesToRows(values = {}, overMin = 0, overMinBy = null, fromVitals = {}, normal = {}, valuesRel = null) {
  const rows = relRows(valuesRel, overMin, overMinBy);
  const dur = (k) => overMinBy?.[k] ?? overMin;
  for (const [k, v] of Object.entries(values)) {
    if (k === 'rhythm') continue;
    if (k === 'bp') {
      const m = /^(\d+)\/(\d+)/.exec(String(v));
      if (m) for (const [vk, val] of [['sbp', Number(m[1])], ['dbp', Number(m[2])]]) rows.push(row(vk, val, dur('bp'), fromVitals, normal));
      continue;
    }
    if (k === 'o2') { const o = parseO2(v); rows.push({ vital: 'o2', direction: 'set', from: fromVitals.o2 ?? '', to: o.device, lpm: o.lpm ?? '', overN: '', overUnit: 'instant' }); continue; }
    if (!vitalOf(k)) continue;
    if (k === 'pain') { const n = vitalNow({ pain: v }, 'pain'); rows.push({ ...row(k, n ?? '', dur(k), fromVitals, normal), note: n == null ? String(v) : String(v).replace(/^\d+(\.\d+)?(\/10)?\s*/, '') }); continue; }
    rows.push(row(k, v, dur(k), fromVitals, normal));
  }
  return rows;
}
function row(k, to, min, fromVitals, normal) {
  const from = vitalNow(fromVitals, k);
  return { vital: k, direction: directionOf(k, from, to, normal), from: from ?? '', to, ...minToOver(min) };
}

/** Plain English for one row: "SpO₂ worsens from 91% to 82% over 5 minutes." */
export function rowText(r, normal = {}) {
  const v = vitalOf(r.vital);
  if (!v) return '';
  if (r.vital === 'o2') return `O₂ set to ${o2Text(r.to, r.lpm) || '—'}.`;
  if (r.to === '' || r.to == null) return `${v.label}: enter a target (To).`;
  if (r.direction === 'rel') return `${v.label} changes by ${Number(r.to) > 0 ? '+' : ''}${r.to}${v.unit} from this patient's baseline ${overText(overToMin(r.overN, r.overUnit))} (each variant from its own value).`;
  const verb = r.direction === 'improve' ? 'improves' : r.direction === 'worsen' ? 'worsens' : 'is set';
  const from = num(r.from) != null ? ` from ${r.from}${v.unit}` : '';
  const warn = r.direction !== 'set' && directionOf(r.vital, r.from, r.to, normal) !== 'set' && directionOf(r.vital, r.from, r.to, normal) !== r.direction
    ? ` (note: that moves ${directionOf(r.vital, r.from, r.to, normal) === 'improve' ? 'toward' : 'away from'} normal)` : '';
  return `${v.label} ${verb}${from} to ${r.to}${v.unit} ${overText(overToMin(r.overN, r.overUnit))}.${warn}`;
}

export function previewText(ge, { normal = {}, names = {} } = {}) {
  const n = { state: (x) => x, order: (x) => x, tool: (x) => x, rhythm: (x) => x, ...names };
  switch (ge.type) {
    case 'vitals': return (ge.rows || []).filter((r) => r.to !== '' && r.to != null).map((r) => rowText(r, normal)).join(' ') || 'No vitals entered yet.';
    case 'rhythm': return ge.rhythm ? `Monitor rhythm changes to ${n.rhythm(ge.rhythm)}.` : 'Pick a rhythm.';
    case 'call-light': return `Call light: "${ge.message || '…'}"`;
    case 'staff-message': return `${ge.from || 'Staff'} says: "${ge.message || '…'}"`;
    case 'new-orders': return ge.orderSet ? `New orders: ${ge.orderSet}.` : `${(ge.orders || []).filter((o) => o.text?.trim()).length} new order(s).`;
    case 'lab-result': return ge.labCode ? `Lab resulted: ${ge.labCode}.` : 'Pick a pending lab.';
    case 'assessment': return `Assessments will find new answers for ${Object.keys(ge.answers || {}).map(n.tool).join(', ') || '…'}.`;
    case 'state': return ge.to ? `Patient goes to "${n.state(ge.to)}".` : 'Pick a state.';
    case 'code': return `Cardiac arrest${ge.rhythm ? ` in ${n.rhythm(ge.rhythm)}` : ''}; planned outcome: ${ge.outcome === 'survive' ? 'survives' : ge.outcome === 'die' ? 'dies' : 'instructor decides'}${ge.roscRhythm ? `, ROSC rhythm ${n.rhythm(ge.roscRhythm)}` : ''}.`;
    case 'admission': return `Patient arrives${ge.message ? `: "${ge.message}"` : ''}.`;
    case 'findings': return 'New findings at the next assessment.';
    case 'fire': return ge.eventId ? `Fires event ${ge.eventId}.` : 'Pick an event.';
    case 'penalty': return 'Recovery penalty.';
    default: return '';
  }
}

// ---------- reactions: ge ⇄ effects ----------
const ev = (type, payload) => ({ type: 'event', event: { type, payload } });
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/** One ge → reaction effects (vitals with mixed durations stay one effect via overMinBy). Throws on a missing choice. */
export function geToEffects(ge, fromVitals = {}) {
  switch (ge.type) {
    case 'vitals': { const v = rowsToValues(ge.rows, fromVitals); if (!hasAny(v)) throw new Error('Vitals change: enter at least one "To" value'); return [{ type: 'vitals', values: v.values, ...withRel(v), ...(v.overMin ? { overMin: v.overMin } : {}), ...(v.overMinBy ? { overMinBy: v.overMinBy } : {}) }]; }
    case 'rhythm': if (!ge.rhythm) throw new Error('Rhythm change: pick a rhythm'); return [{ type: 'vitals', values: { rhythm: ge.rhythm } }];
    case 'call-light': if (!ge.message?.trim()) throw new Error('Call light: write what the patient says'); return [ev('call-light', { message: ge.message.trim() })];
    case 'staff-message': if (!ge.message?.trim()) throw new Error('Staff message: write the message'); return [ev('staff-message', clean({ from: ge.from, message: ge.message.trim() }))];
    case 'new-orders': if (!ge.orderSet) throw new Error('New orders: pick an order set'); return [ev('new-orders', clean({ orderSet: ge.orderSet, message: ge.message?.trim() }))];
    case 'lab-result': if (!ge.labCode) throw new Error('Lab result: pick a pending lab'); return [ev('lab-result', clean({ code: ge.labCode, label: ge.labLabel }))];
    case 'assessment': if (!Object.keys(ge.answers || {}).length) throw new Error('Assessment change: set at least one item'); return [{ type: 'assessment', answers: ge.answers }];
    case 'state': if (!ge.to) throw new Error('State change: pick a state'); return [{ type: 'state', to: ge.to }];
    case 'code': return [ev('code', clean({ rhythm: ge.rhythm, message: ge.message?.trim(), outcome: ge.outcome, roscRhythm: ge.roscRhythm }))];
    case 'findings': return [{ type: 'findings', findingsText: ge.findingsText, change: ge.change }];
    case 'fire': if (!ge.eventId) throw new Error('Pick the event to fire'); return [{ type: 'fire', eventId: ge.eventId }];
    case 'penalty': return [{ type: 'penalty', ...ge.penalty }];
    default: throw new Error(`Unknown event type ${ge.type}`);
  }
}

/** One reaction effect → ge (for editing). */
export function effectToGe(e, fromVitals = {}, normal = {}) {
  if (e.type === 'vitals') {
    const { rhythm, ...rest } = e.values || {};
    if (rhythm && !Object.keys(rest).length) return { type: 'rhythm', rhythm };
    return { type: 'vitals', rows: valuesToRows(rest, e.overMin, e.overMinBy, fromVitals, normal, e.valuesRel), rhythmAlso: rhythm || null };
  }
  if (e.type === 'event') {
    const p = e.event.payload || {};
    const t = e.event.type;
    if (t === 'call-light') return { type: t, message: p.message || '' };
    if (t === 'staff-message') return { type: t, from: p.from || '', message: p.message || '' };
    if (t === 'new-orders') return { type: t, orderSet: p.orderSet || '', message: p.message || '' };
    if (t === 'lab-result') return { type: t, labCode: p.code || '', labLabel: p.label || '' };
    if (t === 'code') return { type: t, rhythm: p.rhythm || '', message: p.message || '', outcome: p.outcome || 'instructor', roscRhythm: p.roscRhythm || '' };
    if (t === 'admission') return { type: t, message: p.message || '' };
  }
  if (e.type === 'assessment') return { type: 'assessment', answers: e.answers || {} };
  if (e.type === 'state') return { type: 'state', to: e.to };
  if (e.type === 'findings') return { type: 'findings', change: e.change, findingsText: e.findingsText || '' };
  if (e.type === 'fire') return { type: 'fire', eventId: e.eventId };
  if (e.type === 'penalty') { const { type, ...penalty } = e; return { type: 'penalty', penalty }; }
  return { type: e.type };
}

// ---------- states: ge list ⇄ state vitals / rhythm / assessments ----------
export function stateToGes(def, fromVitals = {}, normal = {}) {
  const out = [];
  if (Object.keys(def.vitals?.values || {}).filter((k) => k !== 'rhythm').length || Object.keys(def.vitals?.valuesRel || {}).length) out.push({ type: 'vitals', rows: valuesToRows(def.vitals.values, def.vitals.overMin, def.vitals.overMinBy, fromVitals, normal, def.vitals.valuesRel) });
  const rhythm = def.rhythm || def.vitals?.values?.rhythm;
  if (rhythm) out.push({ type: 'rhythm', rhythm });
  if (Object.keys(def.assessments || {}).length) out.push({ type: 'assessment', answers: def.assessments });
  return out;
}
/** → { vitals?: { values, overMin?, overMinBy? }, rhythm?, assessments? } */
export function gesToState(list, fromVitals = {}) {
  const out = {};
  for (const ge of list) {
    if (ge.type === 'vitals') { const v = rowsToValues(ge.rows, fromVitals); if (hasAny(v)) out.vitals = { values: { ...(out.vitals?.values || {}), ...v.values }, ...withRel(v), ...(v.overMin ? { overMin: v.overMin } : {}), ...(v.overMinBy ? { overMinBy: v.overMinBy } : {}) }; }
    if (ge.type === 'rhythm' && ge.rhythm) out.rhythm = ge.rhythm;
    if (ge.type === 'assessment' && Object.keys(ge.answers || {}).length) out.assessments = { ...(out.assessments || {}), ...ge.answers };
  }
  return out;
}

// ---------- scenario changes: ge list ⇄ change-model form ----------
const KEPT = { 'lab-result': 'lab-result', 'script-state': 'state', code: 'code', admission: 'admission' };

/** change-model form → ge list (call light / message, vitals + rhythm, orders, assessments, kept events). */
export function changeFormToGes(f, fromVitals = {}, normal = {}) {
  const out = [];
  if (f.start === 'call-light') out.push({ type: 'call-light', message: f.message });
  if (f.start === 'staff-message') out.push({ type: 'staff-message', from: f.from, message: f.message });
  const { rhythm, ...vit } = Object.fromEntries(Object.entries(f.vitals || {}).filter(([, v]) => v !== '' && v != null));
  if (Object.keys(vit).length || Object.keys(f.vitalsRel || {}).length) out.push({ type: 'vitals', rows: valuesToRows(vit, f.vitalsOverMin || 0, f.vitalsOverMinBy || null, fromVitals, normal, f.vitalsRel), extra: Object.fromEntries(Object.entries(vit).filter(([k]) => !['bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain', 'gcs', 'glucose'].includes(k))) });
  if (rhythm) out.push({ type: 'rhythm', rhythm });
  if ((f.orders || []).length) out.push({ type: 'new-orders', orders: f.orders.map((o) => ({ ...o })) });
  if (Object.keys(f.assessments || {}).length) out.push({ type: 'assessment', answers: f.assessments });
  for (const e of f.keep || []) {
    const kind = KEPT[e.type];
    if (!kind) continue;
    const p = e.payload || {};
    const base = { id: e.id, orig: e }; // the original event: fields the form doesn't show are kept
    if (kind === 'lab-result') out.push({ type: kind, labCode: p.code || '', labLabel: p.label || '', ...base });
    if (kind === 'state') out.push({ type: kind, to: p.to || '', ...base });
    if (kind === 'code') out.push({ type: kind, rhythm: p.rhythm || '', message: p.message || '', outcome: p.outcome || 'instructor', roscRhythm: p.roscRhythm || '', ...base });
    if (kind === 'admission') out.push({ type: kind, message: p.message || '', ...base });
  }
  return out;
}

/** ge list → the change-model form fields (merged into the existing form `f`). Throws on a missing choice. */
export function gesToChangeForm(list, f, fromVitals = {}) {
  const lights = list.filter((g) => g.type === 'call-light' || g.type === 'staff-message');
  if (lights.length > 1) throw new Error('A scenario change can start with one call light or one staff message');
  const start = lights[0];
  const vitals = Object.fromEntries(Object.keys(f.vitals || {}).map((k) => [k, '']));
  let overMin = 0; let overMinBy = null; let vitalsRel = null;
  for (const g of list.filter((x) => x.type === 'vitals')) {
    const v = rowsToValues(g.rows, fromVitals);
    Object.assign(vitals, g.extra || {}, v.values);
    if (Object.keys(v.valuesRel).length) vitalsRel = { ...(vitalsRel || {}), ...v.valuesRel };
    overMin = Math.max(overMin, v.overMin);
    if (v.overMinBy) overMinBy = { ...(overMinBy || {}), ...v.overMinBy };
  }
  const rh = list.find((x) => x.type === 'rhythm');
  if (rh) { if (!rh.rhythm) throw new Error('Rhythm change: pick a rhythm'); vitals.rhythm = rh.rhythm; }
  const keepOther = (f.keep || []).filter((e) => !KEPT[e.type]);
  const kept = list.filter((g) => ['lab-result', 'state', 'code', 'admission'].includes(g.type)).map((g, i) => {
    if (g.type === 'lab-result' && !g.labCode) throw new Error('Lab result: pick a pending lab');
    if (g.type === 'state' && !g.to) throw new Error('State change: pick a state');
    const type = g.type === 'state' ? 'script-state' : g.type;
    const payload = g.type === 'lab-result' ? clean({ code: g.labCode, label: g.labLabel }) : g.type === 'state' ? { to: g.to }
      : g.type === 'code' ? clean({ rhythm: g.rhythm, message: g.message?.trim(), outcome: g.outcome, roscRhythm: g.roscRhythm }) : clean({ message: g.message?.trim() });
    return { ...(g.orig || {}), id: g.id || `__new-${type}-${i + 1}`, type, payload: { ...(g.orig?.payload || {}), ...payload } };
  });
  return {
    ...f,
    start: start ? start.type : 'silent', from: start?.from || f.from, message: start ? (start.message || '').trim() : (f.start === 'silent' ? f.message : ''),
    vitals, vitalsOverMin: overMin, vitalsOverMinBy: overMinBy, vitalsRel,
    orders: list.filter((g) => g.type === 'new-orders').flatMap((g) => g.orders || []),
    assessments: Object.assign({}, ...list.filter((g) => g.type === 'assessment').map((g) => g.answers || {})),
    keep: [...keepOther, ...kept],
  };
}
