// Variant integrity check for case templates (pure, no DOM). A case's ranges, relative changes and med classes must
// not break what the case is built to teach: every variant has to start on the same side of each threshold, cross the
// same thresholds when its script says so, and fire the same reactions and states as the nominal patient (the file's
// own values). Two levels:
//   rangeWarnings(template, catalogs)                → fast static checks, shown live in the patient editor
//   variantProblems(template, { catalogs, settings }) → samples many seeds and compares dry runs (tests and the editor's
//                                                       "Check variants" button)
// Each item: { level: 'warn'|'error', where, message }.

import { instantiate, allowedDrugs } from './cases.js';
import { dryRun } from './reactions/dry-run.js';

const VITALS = ['hr', 'rr', 'spo2', 'tempF', 'sbp', 'dbp'];
const NAMES = { hr: 'HR', rr: 'RR', spo2: 'SpO₂', tempF: 'Temp', sbp: 'SBP', dbp: 'DBP' };
const parseBp = (bp) => { const m = /^(\d+)\/(\d+)/.exec(String(bp ?? '')); return m ? [Number(m[1]), Number(m[2])] : null; };
/** One vital's number from a vitals object (sbp/dbp from bp). */
export function vitalOf(v, k) {
  if (k === 'sbp' || k === 'dbp') return parseBp(v?.bp)?.[k === 'sbp' ? 0 : 1] ?? null;
  return typeof v?.[k] === 'number' ? v[k] : null;
}
const test = (x, op, value) => (op === '<' ? x < value : op === '<=' ? x <= value : op === '>' ? x > value : op === '>=' ? x >= value : x === value);
const short = (s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
const fmt = ([lo, hi]) => `${lo}–${hi}`;

/** Every number threshold the case reacts to: parameter orders and vitals / duration reactions. */
export function thresholds(t) {
  const out = [];
  for (const o of t.orders || []) {
    const p = o.parameter;
    if (p?.watch?.startsWith('vitals.') && p.op && p.value != null) out.push({ kind: 'vital', field: p.watch.slice(7), op: p.op, value: p.value, label: `"${short(o.text)}"` });
    if (p?.watch?.startsWith('labs.') && p.op && p.value != null) out.push({ kind: 'lab', code: p.watch.slice(5), op: p.op, value: p.value, label: `"${short(o.text)}"` });
  }
  for (const r of t.script?.reactions || []) {
    const w = r.when;
    if ((w.kind === 'vitals' || w.kind === 'duration') && VITALS.includes(w.field)) out.push({ kind: 'vital', field: w.field, op: w.op, value: w.value, label: `reaction "${r.label || r.id}"`, reactionId: r.id });
  }
  return out;
}

const refRange = (catalogs, code) => {
  const m = /(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/.exec(catalogs?.labs?.labs?.find((l) => l.code === code)?.refRange || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const flagOf = (x, rr) => (x < rr[0] ? 'low' : x > rr[1] ? 'high' : 'normal');

/** Static checks: ranges that could put a variant on the other side of a threshold, empty med classes, and so on. */
export function rangeWarnings(t, catalogs) {
  if (!t?.case) return [];
  const out = [];
  const add = (level, where, message) => out.push({ level, where, message });
  const c = t.case;
  if (c.ageRange && c.ageRange[0] > c.ageRange[1]) add('error', 'case', `Age range ${fmt(c.ageRange)} is backwards`);
  if (c.sex && !['M', 'F', 'either'].includes(c.sex)) add('error', 'case', `Sex must be M, F or either (got ${c.sex})`);
  const ranges = t.vitals?.ranges || {};
  const base = t.vitals?.baseline || {};
  const ths = thresholds(t);
  for (const [k, r] of Object.entries(ranges)) {
    if (!Array.isArray(r) || r.length !== 2) { add('error', `vitals.ranges.${k}`, `${NAMES[k] || k} range must be [low, high]`); continue; }
    if (r[0] > r[1]) { add('error', `vitals.ranges.${k}`, `${NAMES[k] || k} range ${fmt(r)} is backwards`); continue; }
    const nominal = vitalOf(base, k);
    if (nominal != null && (nominal < r[0] || nominal > r[1])) add('warn', `vitals.ranges.${k}`, `Baseline ${NAMES[k]} ${nominal} is outside its range ${fmt(r)}`);
    for (const th of ths.filter((x) => x.kind === 'vital' && x.field === k)) {
      const sides = new Set([r[0], r[1], nominal].filter((x) => x != null).map((x) => test(x, th.op, th.value)));
      if (sides.size > 1) add('warn', `vitals.ranges.${k}`, `${NAMES[k]} range ${fmt(r)} crosses ${NAMES[k]} ${th.op} ${th.value} (${th.label}): some variants would start past it`);
    }
    const nr = t.normalRanges?.[k];
    if (nr && nominal != null && test(nominal, '>=', nr[0]) && test(nominal, '<=', nr[1]) && (r[0] < nr[0] || r[1] > nr[1])) add('warn', `vitals.ranges.${k}`, `${NAMES[k]} range ${fmt(r)} goes outside this patient's target ${fmt(nr)}`);
  }
  // Relative scripted changes: the value they reach at the ends of the range must stay on the nominal side.
  const rel = [
    ...(t.vitals?.keyframes || []).map((k) => ({ obj: k, where: `keyframe ${k.eventId || k.atMin}` })),
    ...(t.script?.states || []).filter((s) => s.vitals).map((s) => ({ obj: s.vitals, where: `state ${s.id}` })),
    ...(t.script?.reactions || []).flatMap((r) => r.then.filter((e) => e.type === 'vitals').map((e) => ({ obj: e, where: `reaction ${r.id}` }))),
  ].filter((x) => x.obj.valuesRel);
  for (const { obj, where } of rel) {
    for (const [k, delta] of Object.entries(obj.valuesRel)) {
      const nominal = vitalOf(base, k);
      const r = ranges[k];
      if (nominal == null || !r) continue;
      for (const th of ths.filter((x) => x.kind === 'vital' && x.field === k)) {
        const sides = new Set([nominal, r[0], r[1]].map((b) => test(b + delta, th.op, th.value)));
        if (sides.size > 1) add('warn', where, `${NAMES[k]} ${delta > 0 ? '+' : ''}${delta} from baseline reaches ${r[0] + delta}–${r[1] + delta} across the range, so it ${test(nominal + delta, th.op, th.value) ? 'doesn’t always cross' : 'sometimes crosses'} ${NAMES[k]} ${th.op} ${th.value} (${th.label}). Use an absolute value or narrow the range`);
      }
    }
  }
  // Labs: a range should keep the lab's flag (normal / high / low) and any lab threshold the nominal value has.
  for (const l of t.labs || []) {
    if (!l.range) continue;
    const where = `labs.${l.code}`;
    if (l.range[0] > l.range[1]) { add('error', where, `${l.code} range ${fmt(l.range)} is backwards`); continue; }
    if (l.teachingPoint) { add('warn', where, `${l.code} is a teaching point, so its range is ignored (the value stays ${l.value})`); continue; }
    const x = Number.parseFloat(l.value);
    if (!Number.isFinite(x)) continue;
    if (x < l.range[0] || x > l.range[1]) add('warn', where, `${l.code} ${l.value} is outside its range ${fmt(l.range)}`);
    const rr = refRange(catalogs, l.code);
    if (rr && new Set([x, ...l.range].map((v) => flagOf(v, rr))).size > 1) add('warn', where, `${l.code} range ${fmt(l.range)} crosses the reference range ${fmt(rr)}: some variants would flag differently`);
    for (const th of ths.filter((y) => y.kind === 'lab' && y.code === l.code)) {
      if (new Set([x, ...l.range].map((v) => test(v, th.op, th.value))).size > 1) add('warn', where, `${l.code} range ${fmt(l.range)} crosses ${l.code} ${th.op} ${th.value} (${th.label})`);
    }
  }
  // Med classes: known, and at least one drug left after allergies and exclusions.
  const classes = new Set([...(t.homeMeds || []), ...(t.orders || [])].map((m) => m.medClass).filter(Boolean));
  for (const cls of classes) {
    if (!catalogs?.medClasses?.classes.some((x) => x.id === cls)) { add('error', `medClass ${cls}`, `Unknown medication class "${cls}" (data/catalogs/med-classes.json)`); continue; }
    if (!allowedDrugs(t, cls, catalogs).length) add('error', `medClass ${cls}`, `No drug left in "${cls}" after this patient's allergies and excluded drugs`);
  }
  return out;
}

// ---------- dry-run comparison ----------
function plans(t) {
  const times = (t.events || []).filter((e) => typeof e.atMin === 'number').map((e) => e.atMin);
  const end = Math.min(240, Math.max(30, ...times) + 30);
  const waits = (to, from = 0) => Array.from({ length: Math.ceil((to - from) / 5) }, () => ({ kind: 'wait', min: 5 }));
  const out = [{ label: 'nothing done', steps: waits(end) }];
  const first = times.length ? Math.min(...times) : 0;
  for (const r of t.script?.reactions || []) {
    const w = r.when;
    let step = null;
    if (w.kind === 'intervention') {
      const where = Array.isArray(w.where) ? w.where[0] : w.where || {};
      const fields = Object.fromEntries(Object.entries(where).map(([k, v]) => [k, v.equals ?? v.min ?? v.matches?.[0] ?? v.max ?? '']).filter(([, v]) => v !== ''));
      step = { kind: 'chart', interventionId: w.interventionId, fields };
    } else if (w.kind === 'med' && w.orderId) step = { kind: 'med', orderId: w.orderId, result: w.result || 'given' };
    if (!step) continue;
    const at = Math.max(5, Math.ceil((first + 2) / 5) * 5);
    out.push({ label: `${r.label || r.id} at ${at} min`, steps: [...waits(at), step, ...waits(at + 30, at)] });
  }
  return out;
}

function signature(frame, ths) {
  return {
    state: frame.state,
    fired: (frame.fired || []).map((f) => f.reactionId).sort().join(','),
    events: (frame.events || []).slice().sort().join(','),
    sides: ths.filter((x) => x.kind === 'vital').map((x) => { const v = vitalOf(frame.vitals, x.field); return v == null ? '-' : test(v, x.op, x.value) ? 'past' : 'within'; }).join(','),
    error: frame.error || '',
  };
}

function describeDiff(a, b, ths) {
  if (a.error !== b.error) return `error "${b.error || a.error}"`;
  if (a.state !== b.state) return `state is "${b.state}" (nominal: "${a.state}")`;
  if (a.fired !== b.fired) return `reactions fired: ${b.fired || 'none'} (nominal: ${a.fired || 'none'})`;
  if (a.events !== b.events) return `events: ${b.events || 'none'} (nominal: ${a.events || 'none'})`;
  const vt = ths.filter((x) => x.kind === 'vital');
  const as = a.sides.split(','); const bs = b.sides.split(',');
  const i = as.findIndex((x, j) => x !== bs[j]);
  const th = vt[i];
  return th ? `${NAMES[th.field]} is ${bs[i] === 'past' ? 'past' : 'not past'} ${th.op} ${th.value} (${th.label}); nominal is ${as[i] === 'past' ? 'past' : 'not past'}` : 'differs';
}

/**
 * Samples `samples` variants and runs each plan (nothing done, and each reaction's trigger once) through the dry run,
 * comparing every frame to the nominal patient. Returns rangeWarnings + one item per plan × variant that differs.
 */
export function variantProblems(t, { catalogs, settings, samples = 16, startClock = '07:00' }) {
  const out = rangeWarnings(t, catalogs);
  if (!t?.case || out.some((x) => x.level === 'error')) return out;
  const ths = thresholds(t);
  const nominal = instantiate(t, { seed: 'nominal', catalogs, nominal: true });
  const ps = plans(t);
  const base = ps.map((p) => dryRun(nominal, { catalogs, settings, steps: p.steps, startClock }).map((f) => signature(f, ths)));
  const seen = new Set();
  for (let i = 0; i < samples; i++) {
    const v = instantiate(t, { seed: `check:${i}`, catalogs });
    ps.forEach((p, pi) => {
      const frames = dryRun(v, { catalogs, settings, steps: p.steps, startClock });
      for (let f = 0; f < frames.length; f++) {
        const a = base[pi][f]; const b = signature(frames[f], ths);
        if (!a || JSON.stringify(a) === JSON.stringify(b)) continue;
        const msg = describeDiff(a, b, ths);
        const key = msg; // the same difference in several plans is reported once
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ level: 'error', where: `plan: ${p.label}`, message: `Variant ${v.demographics.name} (BP ${v.vitals.baseline.bp}, HR ${v.vitals.baseline.hr}, SpO₂ ${v.vitals.baseline.spo2}) at ${frames[f].atMin} min: ${msg}`, seed: `check:${i}` });
        }
        break;
      }
    });
  }
  return out;
}
