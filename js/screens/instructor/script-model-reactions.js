// Reaction form ⇄ data, duplicate/delete, and reaction templates (data/catalogs/reaction-templates.json).
// Pure, tested. A `where` the form can't show (alternatives with several fields each) is kept as-is.

import { clone, lines, list, numOrNull, uniqueId, slug, withScript, changeText, setChange, newChangeId } from './script-model.js';

export const matcherKey = (m) => `${m.kind}:${m.kind === 'intervention' ? m.interventionId : m.orderId || m.med}`;
export function keyToMatcher(key) {
  const [kind, id] = key.split(':');
  return kind === 'intervention' ? { kind, interventionId: id } : { kind, orderId: id };
}

const testToRow = (field, t) => ({ field, min: t.min ?? '', max: t.max ?? '', matches: (t.matches || []).join(', '), excludes: (t.excludes || []).join(', ') });
function rowToTest(r) {
  const t = {};
  if (numOrNull(r.min) != null) t.min = Number(r.min);
  if (numOrNull(r.max) != null) t.max = Number(r.max);
  if (list(r.matches).length) t.matches = list(r.matches);
  if (list(r.excludes).length) t.excludes = list(r.excludes);
  return t;
}

/** where → { mode: 'all'|'any', rows, raw? } */
function whereToForm(where) {
  if (!where) return { mode: 'all', rows: [] };
  if (!Array.isArray(where)) return { mode: 'all', rows: Object.entries(where).map(([f, t]) => testToRow(f, t)) };
  if (where.every((w) => Object.keys(w).length === 1)) return { mode: 'any', rows: where.map((w) => testToRow(...Object.entries(w)[0])) };
  return { mode: 'all', rows: [], raw: where };
}
function formToWhere({ mode, rows, raw }) {
  const used = rows.filter((r) => r.field && Object.keys(rowToTest(r)).length);
  if (!used.length) return raw || undefined;
  return mode === 'any' ? used.map((r) => ({ [r.field]: rowToTest(r) })) : Object.fromEntries(used.map((r) => [r.field, rowToTest(r)]));
}

const EVENT_FIELDS = { 'call-light': ['message'], 'staff-message': ['from', 'message'], 'new-orders': ['orderSet', 'message'], 'lab-result': ['code', 'label'], code: ['rhythm', 'message'] };

function effectToForm(t, e) {
  const base = { type: e.type, to: '', values: {}, overMin: 0, findingsText: '', change: '', eventType: 'staff-message', payload: {}, eventId: '' };
  if (e.type === 'state') return { ...base, to: e.to };
  if (e.type === 'vitals') return { ...base, values: { ...e.values }, overMin: e.overMin || 0 };
  if (e.type === 'findings') return { ...base, change: e.change, findingsText: changeText(t, e.change) };
  if (e.type === 'event') return { ...base, eventType: e.event.type, payload: { ...e.event.payload } };
  if (e.type === 'fire') return { ...base, eventId: e.eventId };
  if (e.type === 'assessment') return { ...base, answers: structuredClone(e.answers || {}) };
  if (e.type === 'penalty') return { ...base, label: e.label || '', percent: e.percent ?? '', caps: { ...(e.caps || {}) }, vitals: [...(e.vitals || [])], wearOffMin: e.wearOffMin ?? '', slowFactor: e.slowFactor ?? '' };
  return { ...base, ...e };
}

function formToEffect(t, f, rid) {
  // From the guided event builder: already an effect (findings still need their findings-change entry).
  if (f.effect) {
    if (f.effect.type !== 'findings') return structuredClone(f.effect);
    f = { type: 'findings', findingsText: f.effect.findingsText, change: f.effect.change };
  }
  if (f.type === 'state') { if (!f.to) throw new Error('Pick the state to go to'); return { type: 'state', to: f.to }; }
  if (f.type === 'vitals') {
    const values = Object.fromEntries(Object.entries(f.values || {}).filter(([, v]) => String(v ?? '').trim() !== '').map(([k, v]) => [k, ['hr', 'rr', 'tempF', 'spo2'].includes(k) ? Number(v) : String(v).trim()]));
    if (!Object.keys(values).length) throw new Error('Vitals effect: enter at least one value');
    return { type: 'vitals', values, ...(Number(f.overMin) ? { overMin: Number(f.overMin) } : {}) };
  }
  if (f.type === 'findings') {
    const change = setChange(t, f.change || newChangeId(t, `${rid}-findings`), f.findingsText);
    if (!change) throw new Error('Findings effect: write at least one finding');
    return { type: 'findings', change };
  }
  if (f.type === 'event') {
    const payload = Object.fromEntries((EVENT_FIELDS[f.eventType] || []).map((k) => [k, String(f.payload?.[k] ?? '').trim()]).filter(([, v]) => v));
    if (f.eventType === 'new-orders' && !payload.orderSet) throw new Error('New orders: pick an order set');
    if (f.eventType === 'lab-result' && !payload.code) throw new Error('Lab result: pick a pending lab');
    return { type: 'event', event: { type: f.eventType, payload } };
  }
  if (f.type === 'fire') { if (!f.eventId) throw new Error('Pick the event to fire'); return { type: 'fire', eventId: f.eventId }; }
  if (f.type === 'assessment') {
    if (!Object.keys(f.answers || {}).length) throw new Error('Assessment effect: set at least one tool item');
    return { type: 'assessment', answers: structuredClone(f.answers) };
  }
  if (f.type === 'penalty') {
    const e = { type: 'penalty' };
    if (String(f.label || '').trim()) e.label = f.label.trim();
    if (numOrNull(f.percent) != null && Number(f.percent) > 0) e.percent = Number(f.percent);
    const caps = Object.fromEntries(Object.entries(f.caps || {}).filter(([, v]) => numOrNull(v) != null).map(([k, v]) => [k, Number(v)]));
    if (Object.keys(caps).length) e.caps = caps;
    if (!e.percent && !e.caps) throw new Error('Penalty: enter a percent or at least one cap');
    if (f.vitals?.length) e.vitals = [...f.vitals];
    if (numOrNull(f.wearOffMin) != null && Number(f.wearOffMin) > 0) e.wearOffMin = Number(f.wearOffMin);
    if (numOrNull(f.slowFactor) != null && Number(f.slowFactor) > 1) e.slowFactor = Number(f.slowFactor);
    return e;
  }
  throw new Error(`Unknown effect ${f.type}`);
}

export function reactionToForm(t, rid) {
  const r = t.script?.reactions.find((x) => x.id === rid) || { id: '', label: '', when: { kind: 'intervention' }, then: [] };
  const w = r.when;
  const c = r.if || {};
  return {
    id: r.id, label: r.label || '', short: r.short || '', review: r.review || 'proposed', repeat: Boolean(r.repeat), maxFires: r.maxFires ?? '',
    when: {
      kind: w.kind, interventionId: w.interventionId || '', where: whereToForm(w.where), orderId: w.orderId || '', medResult: w.result || 'given',
      doseMin: w.dose?.min ?? '', doseMax: w.dose?.max ?? '', field: w.field || 'spo2', op: w.op || '<=', value: w.value ?? '',
      forMin: w.forMin ?? 5, atLeastPercent: w.atLeastPercent ?? 40, toolId: w.toolId || '', scoreRule: w.rise != null ? 'rise' : w.op || '>=', scoreValue: w.rise ?? (w.kind === 'assessment' ? w.value : '') ?? '',
      since: w.since || 'state', state: w.state || '', eventId: w.eventId || '', reactionId: w.reactionId || '', afterMin: w.afterMin ?? 5,
      without: (w.without || []).map(matcherKey), firedKind: w.reactionId ? 'reaction' : 'event',
    },
    cond: { inState: c.inState || [], notInState: c.notInState || [], vitals: Object.entries(c.vitals || {}).map(([field, x]) => ({ field, min: x.min ?? '', max: x.max ?? '' })),
      done: (c.done || []).map(matcherKey), notDone: (c.notDone || []).map(matcherKey), from: c.betweenMin?.[0] ?? '', to: c.betweenMin?.[1] ?? '' },
    then: r.then.map((e) => effectToForm(t, e)),
  };
}

function formToWhen(f) {
  const w = { kind: f.kind };
  if (f.kind === 'intervention') { if (!f.interventionId) throw new Error('Pick the intervention'); w.interventionId = f.interventionId; const where = formToWhere(f.where); if (where) w.where = where; }
  if (f.kind === 'order') { if (!f.orderId) throw new Error('Pick the order'); w.orderId = f.orderId; }
  if (f.kind === 'med') {
    if (!f.orderId) throw new Error('Pick the med order'); w.orderId = f.orderId; if (f.medResult && f.medResult !== 'given') w.result = f.medResult;
    const dose = rowToTest({ min: f.doseMin, max: f.doseMax }); if (Object.keys(dose).length) w.dose = dose;
  }
  if (f.kind === 'vitals' || f.kind === 'duration') { if (numOrNull(f.value) == null) throw new Error('Enter the threshold value'); Object.assign(w, { field: f.field, op: f.op, value: Number(f.value) }); }
  if (f.kind === 'duration') { if (numOrNull(f.forMin) == null) throw new Error('Enter how many minutes the threshold must hold'); w.forMin = Number(f.forMin); }
  if (f.kind === 'assessment') {
    if (!f.toolId) throw new Error('Pick the assessment tool'); if (numOrNull(f.scoreValue) == null) throw new Error('Enter the score');
    w.toolId = f.toolId;
    if (f.scoreRule === 'rise') w.rise = Number(f.scoreValue); else Object.assign(w, { op: f.scoreRule, value: Number(f.scoreValue) });
  }
  if (f.kind === 'penalty') { if (numOrNull(f.atLeastPercent) == null) throw new Error('Enter the penalty %'); w.atLeastPercent = Number(f.atLeastPercent); }
  if (f.kind === 'elapsed') {
    if (numOrNull(f.afterMin) == null) throw new Error('Enter how many minutes'); Object.assign(w, { since: f.since, afterMin: Number(f.afterMin) });
    if (f.since === 'state') { if (!f.state) throw new Error('Pick the state the countdown starts in'); w.state = f.state; }
    if (f.since === 'event') { if (!f.eventId) throw new Error('Pick the event'); w.eventId = f.eventId; }
    if (f.since === 'reaction') { if (!f.reactionId) throw new Error('Pick the reaction'); w.reactionId = f.reactionId; }
    if (f.without?.length) w.without = f.without.map(keyToMatcher);
  }
  if (f.kind === 'fired') {
    if (f.firedKind === 'reaction') { if (!f.reactionId) throw new Error('Pick the reaction'); w.reactionId = f.reactionId; } else { if (!f.eventId) throw new Error('Pick the event'); w.eventId = f.eventId; }
  }
  return w;
}

function formToCond(c) {
  const out = {};
  if (c.inState?.length) out.inState = [...c.inState];
  if (c.notInState?.length) out.notInState = [...c.notInState];
  const vit = (c.vitals || []).filter((v) => v.field && (numOrNull(v.min) != null || numOrNull(v.max) != null));
  if (vit.length) out.vitals = Object.fromEntries(vit.map((v) => [v.field, rowToTest(v)]));
  if (c.done?.length) out.done = c.done.map(keyToMatcher);
  if (c.notDone?.length) out.notDone = c.notDone.map(keyToMatcher);
  if (numOrNull(c.from) != null && numOrNull(c.to) != null) out.betweenMin = [Number(c.from), Number(c.to)];
  return Object.keys(out).length ? out : undefined;
}

/** Saves a reaction form (new when `originalId` is null). Throws a readable message on a missing choice. */
export function formToReaction(t0, form, originalId = null) {
  const t = withScript(t0);
  const taken = new Set(t.script.reactions.map((r) => r.id).filter((x) => x !== originalId));
  const id = form.id?.trim() ? (form.id.startsWith('r-') ? form.id.trim() : `r-${slug(form.id)}`) : uniqueId(`r-${slug(form.label || 'reaction')}`, taken);
  if (taken.has(id)) throw new Error(`There is already a reaction "${id}"`);
  if (!form.then?.length) throw new Error('Add at least one "Then" effect');
  const r = { id, label: form.label?.trim() || id, review: form.review || 'proposed', when: formToWhen(form.when) };
  if (form.short?.trim()) r.short = form.short.trim().slice(0, 28); // diagram arrow label
  const cond = formToCond(form.cond || {});
  if (cond) r.if = cond;
  r.then = form.then.map((f) => formToEffect(t, f, id));
  if (form.repeat) { r.repeat = true; if (numOrNull(form.maxFires) != null) r.maxFires = Number(form.maxFires); }
  const i = t.script.reactions.findIndex((x) => x.id === originalId);
  if (i >= 0) t.script.reactions[i] = r; else t.script.reactions.push(r);
  if (originalId && originalId !== id) for (const x of t.script.reactions) { if (x.when.reactionId === originalId) x.when.reactionId = id; }
  return t;
}

export function duplicateReaction(t0, rid) {
  const t = clone(t0);
  const r = t.script.reactions.find((x) => x.id === rid);
  const copy = { ...clone(r), id: uniqueId(`${rid}-copy`, new Set(t.script.reactions.map((x) => x.id))), label: `${r.label || rid} (copy)`, review: 'proposed' };
  copy.then = copy.then.map((e) => (e.type === 'findings' ? { ...e, change: setChange(t, newChangeId(t, `${copy.id}-findings`), changeText(t, e.change)) } : e));
  t.script.reactions.splice(t.script.reactions.indexOf(r) + 1, 0, copy);
  return { template: t, id: copy.id };
}

export function deleteReaction(t0, rid) {
  const t = clone(t0);
  const chained = t.script.reactions.filter((r) => r.when.reactionId === rid && r.id !== rid).map((r) => r.id);
  if (chained.length) throw new Error(`${chained.join(', ')} start(s) from this reaction; change or delete those first`);
  t.script.reactions = t.script.reactions.filter((r) => r.id !== rid);
  return t;
}

/**
 * Adds a reaction template ({ states, reactions }, states may carry findingsText) to the patient. Ids that are
 * taken get a suffix and every reference inside the template follows. Returns { template, states, reactions } ids.
 */
export function applyTemplate(t0, tpl) {
  const t = withScript(t0);
  const stateIds = new Set(t.script.states.map((s) => s.id));
  const rIds = new Set(t.script.reactions.map((r) => r.id));
  const sMap = Object.fromEntries((tpl.states || []).map((s) => { const id = uniqueId(s.id, stateIds); stateIds.add(id); return [s.id, id]; }));
  const rMap = Object.fromEntries((tpl.reactions || []).map((r) => { const id = uniqueId(r.id, rIds); rIds.add(id); return [r.id, id]; }));
  const st = (id) => sMap[id] || id;
  for (const s of tpl.states || []) {
    const { findingsText, ...def } = clone(s);
    def.id = st(s.id);
    def.review = 'proposed';
    if (findingsText?.length) def.findings = setChange(t, `state-${def.id}`, findingsText.join('\n'));
    t.script.states.push(def);
  }
  for (const r0 of tpl.reactions || []) {
    const r = clone(r0);
    r.id = rMap[r0.id]; r.review = 'proposed';
    if (r.when.state) r.when.state = st(r.when.state);
    if (r.when.reactionId) r.when.reactionId = rMap[r.when.reactionId] || r.when.reactionId;
    if (r.if?.inState) r.if.inState = r.if.inState.map(st);
    if (r.if?.notInState) r.if.notInState = r.if.notInState.map(st);
    r.then = r.then.map((e) => {
      if (e.type === 'state') return { ...e, to: st(e.to) };
      if (e.type === 'findings' && e.findingsText) return { type: 'findings', change: setChange(t, newChangeId(t, `${r.id}-findings`), e.findingsText.join('\n')) };
      return e;
    });
    t.script.reactions.push(r);
  }
  return { template: t, states: Object.values(sMap), reactions: Object.values(rMap) };
}

/** A reusable template from some of a patient's reactions (+ the states they go to, findings copied as text). */
export function templateFrom(t, reactionIds, { id, label, description = '' }) {
  const reactions = t.script.reactions.filter((r) => reactionIds.includes(r.id)).map(clone).map((r) => ({
    ...r, then: r.then.map((e) => (e.type === 'findings' ? { type: 'findings', findingsText: lines(changeText(t, e.change)) } : e)),
  }));
  const stateIds = new Set(reactions.flatMap((r) => r.then.filter((e) => e.type === 'state').map((e) => e.to)));
  const states = t.script.states.filter((s) => stateIds.has(s.id)).map((s) => {
    const { findings, ...rest } = clone(s);
    return findings ? { ...rest, findingsText: lines(changeText(t, findings)) } : rest;
  });
  return { id: slug(id || label), label, description, review: 'proposed', states, reactions };
}
