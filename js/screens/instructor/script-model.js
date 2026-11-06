// Reaction-script builder model (pure, no DOM, tested): form ⇄ template.script, plus duplicate, delete,
// rename and reaction templates. Every function returns a NEW template; the editor keeps it as its working copy.
// Data shape: SPEC §4.6. Findings for a state or effect are stored as findings.changes entries.

const VITAL_KEYS = ['bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain'];
const NUM = new Set(['hr', 'rr', 'tempF', 'spo2']);
export const clone = (x) => structuredClone(x);
export const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
export const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'state';

/** Unique id: base, base-2, base-3… */
export function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function withScript(t) {
  const out = clone(t);
  out.script ??= { review: 'proposed', initialState: 'baseline', states: [{ id: 'baseline', label: 'Baseline', review: 'proposed' }], reactions: [] };
  return out;
}

// ---------- findings changes owned by the script ----------
export const changeText = (t, id) => (t.findings.changes || []).find((c) => c.eventId === id)?.findings.join('\n') || '';
export function setChange(t, id, text) {
  t.findings.changes ??= [];
  const i = t.findings.changes.findIndex((c) => c.eventId === id);
  const items = lines(text);
  if (!items.length) { if (i >= 0 && !referencedChange(t, id)) t.findings.changes.splice(i, 1); return null; }
  if (i >= 0) t.findings.changes[i] = { ...t.findings.changes[i], findings: items };
  else t.findings.changes.push({ eventId: id, review: 'proposed', findings: items });
  return id;
}
/** A findings-change id not used yet in this patient. */
export const newChangeId = (t, base) => uniqueId(base, new Set((t.findings.changes || []).map((c) => c.eventId)));
const referencedChange = (t, id) => t.events.some((e) => e.payload?.change === id);

// ---------- states ----------
export function stateToForm(t, id) {
  const s = t.script?.states.find((x) => x.id === id) || { id: '', label: '' };
  const v = s.vitals?.values || {};
  return { id: s.id, label: s.label, review: s.review || 'proposed', overMin: s.vitals?.overMin ?? 0, rhythm: s.rhythm || v.rhythm || '', note: s.note || '',
    values: Object.fromEntries(VITAL_KEYS.map((k) => [k, v[k] ?? ''])), findingsText: s.findings ? changeText(t, s.findings) : '', assessments: structuredClone(s.assessments || {}) };
}

/** Saves a state form (new when `originalId` is null). Renaming updates every reference. */
export function formToState(t0, form, originalId = null) {
  const t = withScript(t0);
  const taken = new Set(t.script.states.map((s) => s.id).filter((x) => x !== originalId));
  const id = form.id?.trim() ? slug(form.id) : uniqueId(slug(form.label), taken);
  if (taken.has(id)) throw new Error(`There is already a state "${id}"`);
  if (!form.label?.trim()) throw new Error('A state needs a label');
  const values = {};
  for (const k of VITAL_KEYS) {
    const raw = String(form.values?.[k] ?? '').trim();
    if (raw) values[k] = NUM.has(k) ? Number(raw) : raw;
  }
  const old = t.script.states.find((s) => s.id === originalId);
  const def = { id, label: form.label.trim(), review: form.review || 'proposed' };
  if (form.vitalsDirect) { if (Object.keys(form.vitalsDirect.values || {}).length) def.vitals = structuredClone(form.vitalsDirect); } // guided builder: per-vital durations
  else if (Object.keys(values).length) def.vitals = { values, ...(Number(form.overMin) > 0 ? { overMin: Number(form.overMin) } : {}) };
  if (form.rhythm) def.rhythm = form.rhythm;
  if (form.note?.trim()) def.note = form.note.trim();
  const changeId = setChange(t, old?.findings || newChangeId(t, `state-${id}`), form.findingsText);
  if (changeId) def.findings = changeId;
  if (Object.keys(form.assessments || {}).length) def.assessments = structuredClone(form.assessments);
  if (old) t.script.states[t.script.states.indexOf(old)] = def; else t.script.states.push(def);
  return originalId && originalId !== id ? renameState(t, originalId, id) : t;
}

export function renameState(t0, from, to) {
  const t = clone(t0);
  const sc = t.script;
  const swap = (arr) => arr?.map((x) => (x === from ? to : x));
  if (sc.initialState === from) sc.initialState = to;
  for (const r of sc.reactions) {
    if (r.when.state === from) r.when.state = to;
    if (r.if?.inState) r.if.inState = swap(r.if.inState);
    if (r.if?.notInState) r.if.notInState = swap(r.if.notInState);
    for (const e of r.then) if (e.type === 'state' && e.to === from) e.to = to;
  }
  return t;
}

/** Reactions that would point at nothing if this state were deleted. */
export function stateUsedBy(t, id) {
  return (t.script?.reactions || []).filter((r) => r.when.state === id || r.if?.inState?.includes(id) || r.if?.notInState?.includes(id) || r.then.some((e) => e.type === 'state' && e.to === id)).map((r) => r.id);
}

export function deleteState(t0, id) {
  const t = clone(t0);
  if (t.script.initialState === id) throw new Error('This is the starting state; pick another starting state first');
  const used = stateUsedBy(t, id);
  if (used.length) throw new Error(`Used by ${used.join(', ')}; change or delete those reactions first`);
  t.script.states = t.script.states.filter((s) => s.id !== id);
  return t;
}

export function duplicateState(t0, id) {
  const t = clone(t0);
  const s = t.script.states.find((x) => x.id === id);
  const copy = { ...clone(s), id: uniqueId(`${id}-copy`, new Set(t.script.states.map((x) => x.id))), label: `${s.label} (copy)`, review: 'proposed' };
  if (s.findings) copy.findings = setChange(t, newChangeId(t, `state-${copy.id}`), changeText(t, s.findings)) || undefined;
  if (!copy.findings) delete copy.findings;
  t.script.states.splice(t.script.states.indexOf(s) + 1, 0, copy);
  return { template: t, id: copy.id };
}

export { reactionToForm, formToReaction, duplicateReaction, deleteReaction, matcherKey, keyToMatcher, applyTemplate, templateFrom } from './script-model-reactions.js';
