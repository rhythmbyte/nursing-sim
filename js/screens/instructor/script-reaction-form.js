// Script builder: a reaction written as "When / If / Then" with dropdowns from the catalogs and this patient.
// Saving goes through script-model.js formToReaction (readable errors shown in the form).

import { h } from '../shared/dom.js';
import { helpField, helpTip } from '../shared/help.js';
import { openModal } from '../shared/modal.js';
import { reactionToForm, formToReaction } from './script-model.js';
import { scriptOptions, select, input, vitalLabel } from './script-parts.js';
import { whenPart, ifPart } from './script-when.js';
import { penaltyPreview } from '../../engine/reactions/describe.js';
import { limitOne } from '../../engine/penalties.js';

const field = (label, el, hint) => helpField('script', label, el, hint);
const EFFECTS = [['state', 'Go to a state'], ['vitals', 'Change vitals'], ['penalty', 'Recovery penalty (late treatment helps less)'], ['findings', 'Reveal new findings'], ['event', 'Call light, message, orders, lab or code'], ['fire', 'Fire one of this patient\'s events']];
const EVENT_TYPES = [['staff-message', 'Staff message'], ['call-light', 'Call light'], ['new-orders', 'New orders (order set)'], ['lab-result', 'Release a pending lab'], ['code', 'Start a code']];
const VITALS = ['spo2', 'hr', 'rr', 'bp', 'tempF', 'o2', 'rhythm'];

function effectRow(e, opts, n, onRemove, preview) {
  const type = select(`Effect ${n}`, EFFECTS, e.type);
  const to = select(`Effect ${n} state`, opts.states.map((s) => [s.id, s.label]), e.to, { blank: '(pick a state)' });
  const values = Object.fromEntries(VITALS.map((k) => [k, k === 'rhythm'
    ? select(`Effect ${n} rhythm`, opts.rhythms.map((r) => [r.id, r.label]), e.values?.rhythm, { blank: '(rhythm: no change)' })
    : input(`Effect ${n} ${vitalLabel(k)}`, e.values?.[k] ?? '', { placeholder: vitalLabel(k) })]));
  const overMin = input(`Effect ${n} trend minutes`, e.overMin || '', { type: 'number', min: 0, placeholder: 'over min (0 = now)' });
  const findings = h('textarea', { class: 'input', rows: 2, 'aria-label': `Effect ${n} findings`, placeholder: 'One finding per line' }); findings.value = e.findingsText || '';
  const eventType = select(`Effect ${n} kind`, EVENT_TYPES, e.eventType);
  const p = e.payload || {};
  const from = input(`Effect ${n} from`, p.from, { placeholder: 'From (CNA, family…)' });
  const message = input(`Effect ${n} message`, p.message, { placeholder: 'Message / what is said' });
  const orderSet = select(`Effect ${n} order set`, opts.orderSets.map((s) => [s, s]), p.orderSet, { blank: '(order set)' });
  const lab = select(`Effect ${n} lab`, opts.pendingLabs.map((l) => [l.code, l.label]), p.code, { blank: '(pending lab)' });
  const codeRhythm = select(`Effect ${n} code rhythm`, opts.rhythms.map((r) => [r.id, r.label]), p.rhythm, { blank: '(arrest rhythm)' });
  const eventId = select(`Effect ${n} event`, opts.events.map((x) => [x.id, x.label]), e.eventId, { blank: '(pick an event)' });
  const pLabel = input(`Effect ${n} penalty name`, e.label, { placeholder: 'Penalty name (debrief)' });
  const pPercent = input(`Effect ${n} recovery reduced %`, e.percent, { type: 'number', min: 0, max: 100, placeholder: 'reduce recovery %' });
  const pCaps = Object.fromEntries(['spo2', 'sbp', 'hr', 'rr'].map((k) => [k, input(`Effect ${n} ${k} recovers no further than`, e.caps?.[k] ?? '', { placeholder: `${vitalLabel(k)} cap` })]));
  const pVitals = Object.fromEntries(['spo2', 'hr', 'rr', 'sbp', 'dbp', 'tempF'].map((k) => [k, h('input', { type: 'checkbox', checked: (e.vitals || []).includes(k), 'aria-label': `Effect ${n} limits ${k}` })]));
  const pWear = input(`Effect ${n} wears off over min`, e.wearOffMin, { type: 'number', min: 0, placeholder: 'wears off over min (blank = stays)' });
  const pSlow = input(`Effect ${n} recovery slower by`, e.slowFactor, { type: 'number', min: 1, step: 0.5, placeholder: 'slower ×' });
  const pPreview = h('p', { class: 'muted small penalty-preview', 'aria-live': 'polite' });
  const penaltyValue = () => ({ percent: Number(pPercent.value) || 0, caps: Object.fromEntries(Object.entries(pCaps).filter(([, x]) => x.value !== '').map(([k, x]) => [k, Number(x.value)])),
    vitals: Object.entries(pVitals).filter(([, x]) => x.checked).map(([k]) => k), wearOffMin: Number(pWear.value) || null, slowFactor: Number(pSlow.value) || null });
  const parts = {
    penalty: h('div', {}, h('div', { class: 'pick-row' }, pLabel, pPercent, ...Object.values(pCaps), pWear, pSlow),
      h('div', { class: 'pick-row' }, 'Limits: ', ...Object.entries(pVitals).map(([k, x]) => h('label', { class: 'inline' }, x, ` ${vitalLabel(k)}`)), h('span', { class: 'muted small' }, '(none ticked = all)')), pPreview),
    state: h('div', {}, to),
    vitals: h('div', { class: 'pick-row' }, ...Object.values(values), overMin),
    findings: h('div', {}, findings),
    event: h('div', { class: 'pick-row' }, eventType, from, message, orderSet, lab, codeRhythm),
    fire: h('div', {}, eventId),
  };
  const evShow = { from: ['staff-message'], message: ['staff-message', 'call-light', 'new-orders', 'code'], orderSet: ['new-orders'], lab: ['lab-result'], codeRhythm: ['code'] };
  const evEls = { from, message, orderSet, lab, codeRhythm };
  const sync = () => {
    for (const [k, el] of Object.entries(parts)) el.hidden = type.value !== k;
    for (const [k, el] of Object.entries(evEls)) el.hidden = !evShow[k].includes(eventType.value);
  };
  const showPreview = () => { pPreview.textContent = preview(penaltyValue()); };
  parts.penalty.addEventListener('input', showPreview); parts.penalty.addEventListener('change', showPreview);
  type.addEventListener('change', () => { sync(); showPreview(); }); eventType.addEventListener('change', sync); sync(); showPreview();
  const el = h('div', { class: 'effect-row' }, type, ...Object.values(parts), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { el.remove(); onRemove(); } }, 'Remove'));
  return {
    el,
    value: () => ({ type: type.value, to: to.value, values: Object.fromEntries(Object.entries(values).map(([k, x]) => [k, x.value])), overMin: overMin.value,
      findingsText: findings.value, change: e.change, eventType: eventType.value, eventId: eventId.value,
      label: pLabel.value, percent: pPercent.value, caps: Object.fromEntries(Object.entries(pCaps).map(([k, x]) => [k, x.value])), vitals: penaltyValue().vitals, wearOffMin: pWear.value, slowFactor: pSlow.value,
      payload: { from: from.value, message: message.value, orderSet: orderSet.value, code: lab.value, label: lab.value === p.code ? p.label || '' : '', rhythm: codeRhythm.value } }),
  };
}

/** onSave(newTemplate, reactionId). */
export function openReactionForm({ template, reactionId = null, catalogs, onSave }) {
  const opts = scriptOptions(template, catalogs);
  const f = reactionToForm(template, reactionId);
  const label = input('Reaction name', f.label, { placeholder: 'e.g. No O₂ within 5 min: hypoxic' });
  const id = input('Reaction id', f.id, { placeholder: 'made from the name' });
  const review = select('Review status', [['proposed', 'proposed'], ['partial', 'partial'], ['approved', 'approved']], f.review);
  const repeat = h('input', { type: 'checkbox', checked: f.repeat });
  const maxFires = input('Most times it can fire', f.maxFires, { type: 'number', min: 1, placeholder: 'default from settings' });
  const when = whenPart(f.when, opts);
  const cond = ifPart(f.cond, opts);
  const rows = [];
  const thenBox = h('div', { class: 'effects' });
  // Plain preview of a penalty against the trigger chosen above ("If SpO₂ ≤ 82 for 5+ min: recovery reduced 20%… → ~93 instead of 96").
  const preview = (pe) => {
    const w = when.value();
    const data = { kind: w.kind, field: w.field, op: w.op, value: Number(w.value), forMin: Number(w.forMin), afterMin: Number(w.afterMin), without: w.without };
    return penaltyPreview(['vitals', 'duration', 'elapsed'].includes(w.kind) ? data : null, pe, template, limitOne, catalogs.vitals?.recovery?.normal);
  };
  const add = (e = { type: 'state' }) => { const r = effectRow(e, opts, rows.length + 1, () => rows.splice(rows.indexOf(r), 1), preview); rows.push(r); thenBox.append(r.el); };
  f.then.forEach(add);
  if (!f.then.length) add();
  const err = h('p', { class: 'form-error', role: 'alert' });
  if (f.when.where.raw) err.textContent = 'This trigger has field tests the form can\'t show (several alternatives with several fields). They are kept unless you add field tests here.';

  openModal({
    title: reactionId ? `Edit reaction: ${f.label || f.id}` : 'New reaction',
    wide: true,
    body: h('div', { class: 'iv-form script-form' },
      h('div', { class: 'editor-grid' }, field('Reaction name', label), field('Reaction id', id, 'Starts with r-'), field('Review status', review)),
      h('h4', {}, 'When ', helpTip('script.when')), when.el,
      h('h4', {}, 'If (optional) ', helpTip('script.if')), cond.el,
      h('h4', {}, 'Then ', helpTip('script.then'), ' ', helpTip('script.penalty')), thenBox, h('button', { class: 'btn btn-small', type: 'button', onclick: () => add() }, 'Add effect'),
      h('div', { class: 'editor-grid' }, h('label', { class: 'inline' }, repeat, ' Can fire more than once ', helpTip('script.repeat')), field('Most times it can fire', maxFires)),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Save reaction', kind: 'primary', onClick: () => {
        try {
          const form = { ...f, id: id.value, label: label.value, review: review.value, repeat: repeat.checked, maxFires: maxFires.value, when: when.value(), cond: cond.value(), then: rows.map((r) => r.value()) };
          const next = formToReaction(template, form, reactionId);
          onSave(next, next.script.reactions.find((r) => !template.script?.reactions.some((x) => x.id === r.id))?.id || reactionId);
          return true;
        } catch (e) { err.textContent = e.message; return false; }
      } },
    ],
  });
}
