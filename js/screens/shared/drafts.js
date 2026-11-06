// Drafts: what someone is typing is saved as they type (debounced, through storage.js) and restored after a reload,
// crash or coming back, with a small "Draft restored · Discard" note. Submitting clears the draft.
// formDraft snapshots every field in a container by a stable key (aria-label, name, or position) and restores them in
// document order, firing input/change so dynamic parts (e.g. an event type that adds fields) appear before their fields.

import { load, save, remove } from '../../storage.js';
import { h } from './dom.js';

const PREFIX = 'draft.';
// Pending (debounced) saves are flushed when the page hides (tab closed, reload, switching apps on a tablet).
const pending = new Set();
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { for (const f of [...pending]) f(); });
const fields = (root) => [...root.querySelectorAll('input, select, textarea')].filter((el) => !['file', 'hidden', 'password', 'button', 'submit'].includes(el.type));
const keyOf = (el, i) => el.getAttribute('data-draft') || el.getAttribute('aria-label') || el.name || `#${i}`;
function snapshot(root) {
  const out = []; const seen = {};
  fields(root).forEach((el, i) => { let k = keyOf(el, i); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k = `${k}~${seen[k]}`; out.push([k, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value]); });
  return out;
}
function find(root, key) {
  const [base, nth] = key.split('~'); let n = 0;
  return fields(root).find((el, i) => keyOf(el, i) === base && (++n === (Number(nth) || 1))) || null;
}
function apply(root, snap) {
  for (const [k, v] of snap) {
    const el = find(root, k);
    if (!el) continue;
    if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== v) el.checked = v; } else if (el.value !== v) el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** Raw drafts (any JSON), e.g. the patient editor's working copy. */
export const loadDraft = (key) => load(PREFIX + key, null);
export const saveDraft = (key, value) => save(PREFIX + key, value);
export const clearDraft = (key) => remove(PREFIX + key);

/** "Draft restored · Discard" note. */
export function draftNote(onDiscard, text = 'Draft restored') {
  const el = h('p', { class: 'draft-note small', role: 'status' }, `✎ ${text} `, h('button', { class: 'btn-link', type: 'button', onclick: () => { onDiscard(); el.remove(); } }, 'Discard'));
  return el;
}

/**
 * Autosaves a form container under `key` and restores it now if a draft exists. extra = { get(), set(v) } saves
 * structural state (restored first, e.g. Sim setup's groups). Returns { note (element or null), clear(), saveNow() }.
 */
export function formDraft(root, key, { extra = null, delay = 250, onRestore = null } = {}) {
  const k = PREFIX + key;
  let timer = null;
  const initial = snapshot(root);
  const saveNow = () => { clearTimeout(timer); pending.delete(saveNow); save(k, { at: Date.now(), fields: snapshot(root), extra: extra ? extra.get() : null }); };
  const later = () => { clearTimeout(timer); pending.add(saveNow); timer = setTimeout(saveNow, delay); };
  const d = load(k, null);
  let note = null;
  const differs = d && (JSON.stringify(d.extra) !== JSON.stringify(extra ? extra.get() : null) || d.fields?.some(([fk, v]) => String(v) !== String(initial.find(([ik]) => ik === fk)?.[1] ?? '')));
  if (differs) {
    if (extra && d.extra != null) extra.set(d.extra);
    apply(root, d.fields);
    onRestore?.();
    note = draftNote(() => { remove(k); apply(root, initial); setTimeout(() => remove(k), delay + 50); });
  } else if (d) remove(k);
  root.addEventListener('input', later);
  root.addEventListener('change', later);
  return { note, saveNow, clear: () => { clearTimeout(timer); pending.delete(saveNow); remove(k); root.removeEventListener('input', later); root.removeEventListener('change', later); } };
}

/** One text field: restores its draft (if any) now, saves as you type. Returns { restored, clear() }. */
export function textDraft(el, key, delay = 250) {
  const k = PREFIX + key;
  const d = load(k, null);
  const restored = d != null && d !== '' && d !== el.value;
  if (restored) el.value = d;
  let timer = null;
  const flush = () => { clearTimeout(timer); pending.delete(flush); save(k, el.value); };
  const onInput = () => { clearTimeout(timer); pending.add(flush); timer = setTimeout(flush, delay); };
  el.addEventListener('input', onInput);
  el.addEventListener('blur', () => { if (pending.has(flush)) flush(); });
  return { restored, clear: () => { clearTimeout(timer); pending.delete(flush); remove(k); } };
}
