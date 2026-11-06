// Script builder: a reaction written as "When / If / Then" with dropdowns from the catalogs and this patient.
// Saving goes through script-model.js formToReaction (readable errors shown in the form).

import { h } from '../shared/dom.js';
import { helpField, helpTip } from '../shared/help.js';
import { openModal } from '../shared/modal.js';
import { reactionToForm, formToReaction } from './script-model.js';
import { scriptOptions, select, input, vitalLabel } from './script-parts.js';
import { whenPart, ifPart } from './script-when.js';
import { eventList } from './guided-form.js';
import { effectToGe, geToEffects } from './guided-model.js';
import { changeText } from './script-model.js';
import { stateVitals } from '../../engine/reactions/dry-run.js';
import { normalFor } from '../../engine/penalties.js';
import { penaltyPreview } from '../../engine/reactions/describe.js';
import { limitOne } from '../../engine/penalties.js';

const field = (label, el, hint) => helpField('script', label, el, hint);
/** "Recovery penalty" fields for the guided builder (reaction effects only); preview uses the trigger above. */
function penaltyPart(g, show, preview) {
  const e = g.penalty || {};
  const pLabel = input('Penalty name', e.label, { placeholder: 'Penalty name (debrief)' });
  const pPercent = input('Recovery reduced %', e.percent, { type: 'number', min: 0, max: 100, placeholder: 'reduce recovery %' });
  const pCaps = Object.fromEntries(['spo2', 'sbp', 'hr', 'rr'].map((k) => [k, input(`${vitalLabel(k)} recovers no further than`, e.caps?.[k] ?? '', { placeholder: `${vitalLabel(k)} cap` })]));
  const pVitals = Object.fromEntries(['spo2', 'hr', 'rr', 'sbp', 'dbp', 'tempF'].map((k) => [k, h('input', { type: 'checkbox', checked: (e.vitals || []).includes(k), 'aria-label': `Penalty limits ${k}` })]));
  const pWear = input('Wears off over min', e.wearOffMin, { type: 'number', min: 0, placeholder: 'wears off over min (blank = stays)' });
  const pSlow = input('Recovery slower by', e.slowFactor, { type: 'number', min: 1, step: 0.5, placeholder: 'slower ×' });
  const pPreview = h('p', { class: 'muted small penalty-preview', 'aria-live': 'polite' });
  const value = () => {
    const out = {};
    if (pLabel.value.trim()) out.label = pLabel.value.trim();
    if (Number(pPercent.value) > 0) out.percent = Number(pPercent.value);
    const caps = Object.fromEntries(Object.entries(pCaps).filter(([, x]) => x.value !== '').map(([k, x]) => [k, Number(x.value)]));
    if (Object.keys(caps).length) out.caps = caps;
    const vit = Object.entries(pVitals).filter(([, x]) => x.checked).map(([k]) => k);
    if (vit.length) out.vitals = vit;
    if (Number(pWear.value) > 0) out.wearOffMin = Number(pWear.value);
    if (Number(pSlow.value) > 1) out.slowFactor = Number(pSlow.value);
    return out;
  };
  const el = h('div', {}, h('div', { class: 'pick-row' }, pLabel, pPercent, ...Object.values(pCaps), pWear, pSlow),
    h('div', { class: 'pick-row' }, 'Limits: ', ...Object.entries(pVitals).map(([k, x]) => h('label', { class: 'inline' }, x, ` ${vitalLabel(k)}`)), h('span', { class: 'muted small' }, '(none ticked = all)')), pPreview);
  const refresh = () => { pPreview.textContent = preview({ percent: 0, ...value() }); show(); };
  el.addEventListener('input', refresh); el.addEventListener('change', refresh); refresh();
  return { el, value: () => ({ penalty: value() }) };
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
  // Plain preview of a penalty against the trigger chosen above ("If SpO₂ ≤ 82 for 5+ min: recovery reduced 20%… → ~93 instead of 96").
  const preview = (pe) => {
    const w = when.value();
    const data = { kind: w.kind, field: w.field, op: w.op, value: Number(w.value), forMin: Number(w.forMin), afterMin: Number(w.afterMin), without: w.without };
    return penaltyPreview(['vitals', 'duration', 'elapsed'].includes(w.kind) ? data : null, pe, template, limitOne, normalFor(template, catalogs));
  };
  // Then: the guided event builder ("From" starts at the state this reaction reacts in).
  const r0 = template.script?.reactions.find((x) => x.id === reactionId);
  const fromVitals = () => stateVitals(template, r0?.if?.inState?.[0] || r0?.when?.state || when.value().state);
  const normal = normalFor(template, catalogs);
  const effects = (r0?.then || []).map((e) => ({ ...effectToGe(e, fromVitals(), normal), ...(e.type === 'findings' ? { findingsText: changeText(template, e.change) } : {}) }));
  const then = eventList(effects.length ? effects : [{ type: 'state' }], { context: 'reaction', template, catalogs, fromVitals, normal, penaltyPart: (g, show) => penaltyPart(g, show, preview) });
  const short = input('Short label', f.short || '', { placeholder: 'e.g. no O₂ 5 min (diagram arrows)', maxlength: 28 });
  const err = h('p', { class: 'form-error', role: 'alert' });
  if (f.when.where.raw) err.textContent = 'This trigger has field tests the form can\'t show (several alternatives with several fields). They are kept unless you add field tests here.';

  openModal({
    title: reactionId ? `Edit reaction: ${f.label || f.id}` : 'New reaction',
    wide: true,
    body: h('div', { class: 'iv-form script-form' },
      h('div', { class: 'editor-grid' }, field('Reaction name', label), field('Reaction id', id, 'Starts with r-'), field('Short label', short, 'Shown on diagram arrows'), field('Review status', review)),
      h('h4', {}, 'When ', helpTip('script.when')), when.el,
      h('h4', {}, 'If (optional) ', helpTip('script.if')), cond.el,
      h('h4', {}, 'Then ', helpTip('script.then'), ' ', helpTip('script.penalty')), then.el,
      h('div', { class: 'editor-grid' }, h('label', { class: 'inline' }, repeat, ' Can fire more than once ', helpTip('script.repeat')), field('Most times it can fire', maxFires)),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Save reaction', kind: 'primary', onClick: () => {
        try {
          const form = { ...f, id: id.value, label: label.value, review: review.value, repeat: repeat.checked, maxFires: maxFires.value, short: short.value, when: when.value(), cond: cond.value(),
            then: then.value().flatMap((ge) => geToEffects(ge, fromVitals())).map((effect) => ({ effect })) };
          const next = formToReaction(template, form, reactionId);
          onSave(next, next.script.reactions.find((r) => !template.script?.reactions.some((x) => x.id === r.id))?.id || reactionId);
          return true;
        } catch (e) { err.textContent = e.message; return false; }
      } },
    ],
  });
}
