// Patient editor → "Case template" section: title, sex, age range, fixed / range per baseline vital, lab ranges and
// teaching points, "fixed / any from class X" for home meds and medication orders, excluded drugs, live range warnings
// (engine/case-check.js) and "Check variants" (sampled dry runs). Returns { el, apply(template) → template, refresh() }.

import { h, clear } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { checkList } from './script-parts.js';
import { instantiate, caseLabel, suggestCode } from '../../engine/cases.js';
import { rangeWarnings, variantProblems, vitalOf } from '../../engine/case-check.js';

const VITALS = [['hr', 'HR'], ['sbp', 'SBP'], ['dbp', 'DBP'], ['rr', 'RR'], ['spo2', 'SpO₂'], ['tempF', 'Temp °F']];
const num = (el) => (el.value === '' ? null : Number(el.value));
const small = (attrs) => h('input', { class: 'input input-small', type: 'number', step: 'any', ...attrs });

export function caseFields(work, catalogs, { settings, onChange = () => {}, current = null, takenCodes = [] }) {
  const c = work.case || null;
  const classes = catalogs.medClasses?.classes || [];
  const on = h('input', { type: 'checkbox', checked: Boolean(c), 'aria-label': 'This patient is a case template' });
  const auto = h('input', { type: 'checkbox', checked: Boolean(work.autopilot), 'aria-label': 'Autopilot by default' });
  const title = h('input', { class: 'input', value: c?.title || '', placeholder: 'e.g. Cardiac 1', 'aria-label': 'Case title' });
  // Short instructor code ("C1"), suggested from the title; instructors see "(C1) Robert Miller", students never.
  const code = h('input', { class: 'input input-small', value: c?.code || '', placeholder: suggestCode(c?.title || '', takenCodes), 'aria-label': 'Case code', maxlength: 6 });
  title.addEventListener('input', () => { code.placeholder = suggestCode(title.value, takenCodes); });
  const sex = h('select', { 'aria-label': 'Case sex' }, [['either', 'Either (random)'], ['M', 'Male'], ['F', 'Female']].map(([v, l]) => h('option', { value: v, selected: (c?.sex || 'either') === v }, l)));
  const ageLo = small({ value: c?.ageRange?.[0] ?? work.demographics.age, 'aria-label': 'Age from' });
  const ageHi = small({ value: c?.ageRange?.[1] ?? work.demographics.age, 'aria-label': 'Age to' });
  // Baseline vitals: fixed (the value in Baseline vitals) or a range.
  const vit = VITALS.map(([k, label]) => {
    const r = work.vitals.ranges?.[k];
    const mode = h('select', { 'aria-label': `${label} fixed or range` }, h('option', { value: 'fixed', selected: !r }, 'Fixed'), h('option', { value: 'range', selected: Boolean(r) }, 'Range'));
    const lo = small({ value: r?.[0] ?? '', placeholder: String(vitalOf(work.vitals.baseline, k) ?? ''), 'aria-label': `${label} low` });
    const hi = small({ value: r?.[1] ?? '', placeholder: String(vitalOf(work.vitals.baseline, k) ?? ''), 'aria-label': `${label} high` });
    return { k, label, mode, lo, hi };
  });
  // Labs with a number: fixed, range, or teaching point (always the value written).
  const labs = work.labs.map((l, i) => ({ l, i })).filter(({ l }) => l.status === 'resulted' && Number.isFinite(Number.parseFloat(l.value))).map(({ l, i }) => {
    const mode = h('select', { 'aria-label': `${l.code} variation` }, [['fixed', 'Fixed'], ['range', 'Range'], ['teaching', 'Teaching point (fixed)']].map(([v, t]) => h('option', { value: v, selected: (l.teachingPoint ? 'teaching' : l.range ? 'range' : 'fixed') === v }, t)));
    return { i, code: l.code, label: l.label || l.code, value: l.value, mode, lo: small({ value: l.range?.[0] ?? '', 'aria-label': `${l.code} low` }), hi: small({ value: l.range?.[1] ?? '', 'aria-label': `${l.code} high` }) };
  });
  const clsSel = (cur, label) => h('select', { 'aria-label': label }, h('option', { value: '' }, 'Fixed (as written)'), classes.map((x) => h('option', { value: x.id, selected: x.id === cur }, `Any ${x.label.toLowerCase().replace(/s$/, '')} (${x.drugs.map((d) => d.name).join(', ')})`)));
  const meds = (work.homeMeds || []).map((m, i) => ({ i, name: m.name, sel: clsSel(m.medClass, `${m.name} class`) }));
  const orders = work.orders.map((o, i) => ({ o, i })).filter(({ o }) => o.med).map(({ o, i }) => ({ i, text: o.text, sel: clsSel(o.medClass, `${o.id} class`) }));
  const allDrugs = classes.flatMap((x) => x.drugs.map((d) => ({ key: d.id, label: `${d.name} (${x.label})` })));
  const exclude = checkList('Never pick', allDrugs, c?.excludeDrugs || []);

  function apply(t) {
    const next = structuredClone(t);
    const ranges = Object.fromEntries(vit.filter((v) => v.mode.value === 'range' && v.lo.value !== '' && v.hi.value !== '').map((v) => [v.k, [num(v.lo), num(v.hi)]]));
    if (Object.keys(ranges).length) next.vitals.ranges = ranges; else delete next.vitals.ranges;
    for (const x of labs) {
      const l = next.labs[x.i];
      if (!l || l.code !== x.code) continue;
      delete l.range; delete l.teachingPoint;
      if (x.mode.value === 'teaching') l.teachingPoint = true;
      if (x.mode.value === 'range' && x.lo.value !== '' && x.hi.value !== '') l.range = [num(x.lo), num(x.hi)];
    }
    for (const m of meds) { const hm = next.homeMeds?.find((y) => y.name === m.name); if (hm) { if (m.sel.value) hm.medClass = m.sel.value; else delete hm.medClass; } }
    for (const o of orders) { const ord = next.orders[o.i]; if (ord) { if (o.sel.value) ord.medClass = o.sel.value; else delete ord.medClass; } }
    if (auto.checked) next.autopilot = true; else delete next.autopilot;
    if (!on.checked) { delete next.case; return next; }
    const ex = exclude.value();
    const cd = code.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || suggestCode(title.value.trim() || t.id, takenCodes);
    next.case = { ...(t.case || { review: 'proposed' }), title: title.value.trim() || t.id, code: cd, sex: sex.value, ageRange: [num(ageLo) ?? t.demographics.age, num(ageHi) ?? t.demographics.age], ...(ex.length ? { excludeDrugs: ex } : {}) };
    if (!ex.length) delete next.case.excludeDrugs;
    return next;
  }

  const warnBox = h('div', { role: 'status' });
  const checkBox = h('div', {});
  const preview = h('div', {});
  const now = () => (current ? current() : apply(work)); // the whole form as it stands (includes apply)
  const showWarnings = () => {
    let t;
    try { t = now(); } catch { return; }
    const w = t.case ? rangeWarnings(t, catalogs) : [];
    clear(warnBox).append(...(w.length ? [h('ul', { class: 'case-warnings' }, w.map((x) => h('li', { class: x.level === 'error' ? 'form-error' : 'warn' }, `${x.level === 'error' ? '✖' : '⚠'} ${x.message}`)))] : t.case ? [h('p', { class: 'muted small' }, '✓ No range problems found. Check variants runs the script on many variants to be sure.')] : []));
    clear(preview).append(...(t.case ? [h('p', { class: 'muted small' }, 'Sample variants: ', [1, 2, 3].map((n) => { const v = instantiate(t, { seed: `preview:${n}`, catalogs }); return h('span', { class: 'chip' }, `${caseLabel(v).split(' — ')[1]} · BP ${v.vitals.baseline.bp}, HR ${v.vitals.baseline.hr}`); }))] : []));
  };
  const check = h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
    const t = now();
    if (!t.case) { clear(checkBox).append(h('p', { class: 'muted' }, 'Turn on "case template" first.')); return; }
    const probs = variantProblems(t, { catalogs, settings, samples: 24 });
    clear(checkBox).append(probs.length
      ? h('ul', { class: 'case-warnings' }, probs.map((x) => h('li', { class: x.level === 'error' ? 'form-error' : 'warn' }, `${x.level === 'error' ? '✖' : '⚠'} ${x.where}: ${x.message}`)))
      : h('p', { class: 'banner' }, '✓ 24 variants checked: every reaction, state, event and threshold behaves as in the case as written.'));
  } }, 'Check variants');

  const row = (...kids) => h('div', { class: 'pick-row' }, ...kids);
  const el = h('section', { class: 'panel case-fields' },
    h('h3', {}, 'Case template ', helpTip('editor.case-template')),
    h('label', { class: 'inline' }, on, ' This patient is a case template: each sim makes its own patient from it (name, age, values, drugs)'),
    h('label', { class: 'inline' }, auto, ' Autopilot by default: in a sim, its script runs and you\'re only alerted for a code or a red flag ', helpTip('overview.autopilot')),
    h('p', { class: 'muted small' }, 'Students never see the case title. Name, age and sex above are the case "as written" (the demo, and Lock). In any text use {firstName} {lastName} {fullName} {age}{sex} {room} {he/she} {his/her} {him/her} {He/She} {Mr/Ms}, any {male/female} pair like {wife/husband}, baseline {bp} {hr} {rr} {spo2} {tempF}, {lab.wbc}, and {med.<class>} / {med.<class>.Name|dose|freq}. ', helpTip('editor.placeholders')),
    h('div', { class: 'editor-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Case title (instructor only)'), title),
      h('label', { class: 'field' }, h('span', {}, 'Code (instructor only) ', helpTip('editor.case-code')), code),
      h('label', { class: 'field' }, h('span', {}, 'Sex'), sex),
      h('div', { class: 'field' }, h('span', {}, 'Age range'), row(ageLo, '–', ageHi))),
    h('h4', {}, 'Baseline vitals ', helpTip('editor.vital-ranges')),
    h('div', { class: 'editor-grid' }, vit.map((v) => h('div', { class: 'field' }, h('span', {}, v.label), row(v.mode, v.lo, '–', v.hi)))),
    labs.length ? h('h4', {}, 'Labs ', helpTip('editor.lab-ranges')) : null,
    labs.length ? h('div', { class: 'editor-grid' }, labs.map((x) => h('div', { class: 'field' }, h('span', {}, `${x.label} (${x.value})`), row(x.mode, x.lo, '–', x.hi)))) : null,
    meds.length || orders.length ? h('h4', {}, 'Medications ', helpTip('editor.med-classes')) : null,
    ...meds.map((m) => h('div', { class: 'field' }, h('span', {}, `Home med: ${m.name}`), m.sel)),
    ...orders.map((o) => h('div', { class: 'field' }, h('span', {}, `Order: ${o.text.slice(0, 70)}`), o.sel)),
    h('details', {}, h('summary', {}, 'Excluded drugs (never picked for this case)'), exclude.el),
    h('h4', {}, 'Checks'), warnBox, preview, check, checkBox,
  );
  el.addEventListener('input', () => { onChange(); showWarnings(); });
  el.addEventListener('change', () => { onChange(); showWarnings(); });
  return { el, apply, refresh: showWarnings };
}
