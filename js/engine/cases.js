// Case templates (pure, no DOM). A patient file with `case` is a reusable case ("Cardiac 1"); a sim instantiates it
// into a concrete patient from a seed, so the patient is identical through the sim, reloads, rejoins and the debrief.
// Everything downstream (engine, rules, screens) works on the instantiated patient, so its values are used everywhere.
//   case: { title, code: 'C1', sex: 'M'|'F'|'either', ageRange: [lo, hi], excludeDrugs?: [drugIds], locked?: [{ seed, label }] }
// Variation per sim: settings randomizeNames / randomizeValues / randomizeMeds (off = that part exactly as written).
//   vitals.ranges: { hr: [lo, hi], sbp, dbp, rr, spo2, tempF }      labs[i].range: [lo, hi] (unless teachingPoint)
//   valuesRel on keyframes / state vitals / vitals effects: relative to the instantiated baseline ({ sbp: -30 })
//   homeMeds[i].medClass / orders[i].medClass: 'beta-blocker' → one drug per class per patient (med-classes.json)
//   Text placeholders anywhere: {firstName} {lastName} {fullName} {age} {sex} {room}, any {male/female} word pair
//   ({he/she} {His/Her} {Mr/Ms} {wife/husband}…), this patient's baseline {bp} {hr} {rr} {spo2} {tempF}, first lab value
//   {lab.<code>}, and the class drug {med.<class>} {med.<class>.Name|dose|route|freq}
// Instance meta on the result: t.instance = { caseId, caseTitle, code, seed, nominal, meds: { class: drugName } } (instructor-only).

import { allergyMatch } from './rules/allergy-conflict.js';

/** Small seeded PRNG (mulberry32 over a string hash): same seed → same patient. */
export function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, [lo, hi], dec = 0) => { const p = 10 ** dec; return Math.round((lo + rng() * (hi - lo)) * p) / p; };
const norm = (s) => String(s || '').trim().toLowerCase();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const parseBp = (bp) => { const m = /^(\d+)\/(\d+)/.exec(String(bp ?? '')); return m ? [Number(m[1]), Number(m[2])] : null; };

/** Fill placeholders in one string. Unknown placeholders are left as they are. */
export function fillText(s, ctx) {
  return s.replace(/\{([A-Za-z][A-Za-z0-9]*(?:\/[A-Za-z]+)?|(?:med|lab)\.[a-z0-9-]+(?:\.[A-Za-z]+)?)\}/g, (all, key) => {
    if (key.startsWith('med.')) {
      const [, cls, part = 'name'] = key.split('.');
      const d = ctx.meds[cls];
      if (!d) return all;
      return part === 'Name' ? cap(d.name) : d[part] ?? all;
    }
    if (key.startsWith('lab.')) return ctx.labs?.[key.slice(4)] ?? all;
    const m = ctx.sex === 'M';
    if (key.includes('/')) { // any {male/female} word pair: {he/she}, {his/her}, {Mr/Ms}, {wife/husband}, {Dad/Mom}…
      if (key === 'Mr/Ms') return m ? 'Mr.' : 'Ms.';
      const [a, b] = key.split('/');
      return m ? a : b;
    }
    const vit = ctx.vitals || {};
    const v = { firstName: ctx.first, lastName: ctx.last, fullName: `${ctx.first} ${ctx.last}`, age: String(ctx.age), sex: ctx.sex, room: ctx.room,
      bp: vit.bp, hr: vit.hr, rr: vit.rr, spo2: vit.spo2, tempF: vit.tempF }[key];
    return v == null ? all : String(v);
  });
}
function fillAll(o, ctx) {
  if (typeof o === 'string') return fillText(o, ctx);
  if (Array.isArray(o)) return o.map((x) => fillAll(x, ctx));
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fillAll(v, ctx)]));
  return o;
}

/** valuesRel → absolute values against the baseline (sbp/dbp combine into bp). Mutates obj. */
function resolveRel(obj, baseline) {
  if (!obj?.valuesRel) return;
  const out = { ...(obj.values || {}) };
  const bp = parseBp(baseline.bp);
  let s = null; let d = null;
  for (const [k, delta] of Object.entries(obj.valuesRel)) {
    if (k === 'sbp') s = (bp?.[0] ?? 120) + delta;
    else if (k === 'dbp') d = (bp?.[1] ?? 80) + delta;
    else if (typeof baseline[k] === 'number') out[k] = Math.round((baseline[k] + delta) * (k === 'tempF' ? 10 : 1)) / (k === 'tempF' ? 10 : 1);
  }
  const cur = parseBp(out.bp) || bp; // an absolute side written next to a relative one is kept
  if (s != null || d != null) out.bp = `${Math.round(s ?? cur?.[0] ?? 120)}/${Math.round(d ?? cur?.[1] ?? 80)}`;
  obj.values = out;
  delete obj.valuesRel;
}

function resolveAllRel(t, base) {
  for (const k of t.vitals.keyframes || []) resolveRel(k, base);
  for (const s of t.script?.states || []) if (s.vitals) resolveRel(s.vitals, base);
  for (const r of t.script?.reactions || []) for (const e of r.then) if (e.type === 'vitals') resolveRel(e, base);
  for (const e of t.events || []) if (e.payload) resolveRel(e.payload, base);
}

function allergyClasses(catalogs) { return catalogs?.rules?.rules?.['allergy-conflict']?.classes || {}; }

/** Drugs a class may pick from for this patient: not excluded by the case, not matching an allergy. */
export function allowedDrugs(t, classId, catalogs) {
  const cls = catalogs?.medClasses?.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const excl = new Set(t.case?.excludeDrugs || []);
  return cls.drugs.filter((d) => !excl.has(d.id) && !(t.allergies || []).some((a) => allergyMatch(a.agent, d.name, allergyClasses(catalogs))));
}

/** The drug a class resolves to "as written": the home med / order drug the file names, else the first allowed one. */
function writtenDrug(t, cls, ok) {
  const named = [...(t.homeMeds || []).filter((m) => m.medClass === cls).map((m) => m.name), ...t.orders.filter((o) => o.medClass === cls).map((o) => String(o.med || '').split(' ')[0])];
  return ok.find((d) => named.some((n) => norm(n) === norm(d.name))) || ok[0];
}

/** Which parts of a case vary in this sim (scenario settings randomizeNames / randomizeValues / randomizeMeds). */
export const varyFrom = (settings = {}) => ({ names: settings.randomizeNames !== false, values: settings.randomizeValues !== false, meds: settings.randomizeMeds !== false });

/**
 * Instantiate one case. opts: { seed, instanceId, catalogs, room?, usedNames?: Set, identity?: { first, last, sex, age },
 * nominal?: true (values and drugs as written), vary?: { names, values, meds } (false = that part as written) }.
 * Returns a concrete patient template.
 */
export function instantiate(template, { seed, instanceId = template.id, catalogs, room = null, usedNames = new Set(), identity = null, nominal = false, vary = null }) {
  if (vary) { nominal = nominal || (!vary.values && !vary.meds); if (!vary.names && !identity && template.case) identity = fileIdentity(template); }
  const sameValues = nominal || vary?.values === false;
  const sameMeds = nominal || vary?.meds === false;
  const t = structuredClone(template);
  t.id = instanceId;
  if (room != null) t.demographics.room = String(room);
  if (!t.case) { resolveAllRel(t, t.vitals.baseline); return t; } // a fixed patient: only relative changes resolve
  const rng = seededRandom(`${seed}|${template.id}`);
  const c = t.case;
  const sex = identity?.sex || (c.sex === 'either' || !c.sex ? (rng() < 0.5 ? 'M' : 'F') : c.sex);
  const age = identity?.age ?? between(rng, c.ageRange || [t.demographics.age, t.demographics.age]);
  const pools = catalogs?.names;
  let first = identity?.first; let last = identity?.last;
  for (let i = 0; !identity && i < 50; i++) {
    first = pick(rng, pools?.first?.[sex] || [t.demographics.name.split(' ')[0]]);
    last = pick(rng, pools?.last || [t.demographics.name.split(' ').at(-1)]);
    if (!usedNames.has(`${first} ${last}`)) break;
  }
  usedNames.add(`${first} ${last}`);
  // Meds: one drug per class, used by every home med, order and text that names the class.
  const classes = new Set([...(t.homeMeds || []), ...t.orders].map((m) => m.medClass).filter(Boolean));
  const meds = {};
  for (const cls of classes) {
    const ok = allowedDrugs(template, cls, catalogs);
    if (ok.length) meds[cls] = sameMeds ? writtenDrug(template, cls, ok) : pick(rng, ok);
  }
  // Baseline ranges and labs (teaching-point values stay as written).
  const base = t.vitals.baseline;
  if (!sameValues) {
    const r = t.vitals.ranges || {};
    for (const k of ['hr', 'rr', 'spo2', 'tempF']) if (r[k]) base[k] = between(rng, r[k], k === 'tempF' ? 1 : 0);
    if (r.sbp || r.dbp) { const bp = parseBp(base.bp) || [120, 80]; base.bp = `${r.sbp ? between(rng, r.sbp) : bp[0]}/${r.dbp ? between(rng, r.dbp) : bp[1]}`; }
    for (const l of t.labs) if (l.range && !l.teachingPoint && l.value != null) l.value = String(between(rng, l.range, l.decimals ?? (String(l.value).includes('.') ? String(l.value).split('.')[1].length : 0)));
  }
  const labs = {};
  for (const l of t.labs) if (l.value != null && !(l.code in labs)) labs[l.code] = l.value;
  const ctx = { first, last, sex, age, meds, room: t.demographics.room, vitals: base, labs };
  resolveAllRel(t, base); // relative scripted changes → absolute against this patient's baseline
  // Home meds and orders from a class.
  // (The same drug as the file keeps the file's dose and frequency; another drug from the class uses the catalog's.)
  for (const m of t.homeMeds || []) {
    const d = m.medClass && meds[m.medClass];
    if (d && norm(m.name) !== norm(d.name)) Object.assign(m, { name: cap(d.name), dose: d.dose, freq: d.freq });
  }
  for (const o of t.orders) {
    const d = o.medClass && meds[o.medClass];
    if (!d) continue;
    o.med = `${cap(d.name)} ${d.dose} ${d.route}`;
    if (o.frequencyMin && d.frequencyMin) o.frequencyMin = d.frequencyMin; // only orders that repeat on an interval
  }
  const out = fillAll(t, ctx);
  out.demographics = { ...out.demographics, name: `${first} ${last}`, age, sex };
  out.instance = { caseId: template.id, caseTitle: c.title || template.id, seed: String(seed), nominal, ...(c.code ? { code: c.code } : {}), meds: Object.fromEntries(Object.entries(meds).map(([k, d]) => [k, d.name])) };
  return out;
}

/** The original identity of a case (its file name/sex/age): instantiating with it reproduces the file (round trip). */
export const fileIdentity = (t) => ({ first: t.demographics.name.split(' ')[0], last: t.demographics.name.split(' ').slice(1).join(' '), sex: t.demographics.sex, age: t.demographics.age });

/**
 * A sim's patients: { scenario (groups list instance ids), templatesById }. The same case twice gets instance ids
 * id, id~2… and different names. Seeds: scenario.variants[instanceId].seed, else the case's first locked seed (first
 * use), else `${scenario.seed ?? scenario.id}:${instanceId}`. Rooms: group.rooms / scenario.rooms, else the case's room
 * (made unique). opts.nominal (the demo): each case's first use is the case as written (file name, values, first drug).
 */
export function instantiateScenario(scenario, library, catalogs, { nominal = false } = {}) {
  const vary = varyFrom(scenario.settings);
  const byId = Object.fromEntries(library.map((p) => [p.id, p]));
  const used = new Set(); const rooms = new Set(); const count = {}; const templatesById = {};
  const roomPool = [...(scenario.rooms || [])];
  const make = (cid, groupRooms) => {
    const t = byId[cid];
    if (!t) return cid;
    count[cid] = (count[cid] || 0) + 1;
    const iid = count[cid] === 1 ? cid : `${cid}~${count[cid]}`;
    let room = groupRooms?.shift() ?? roomPool.shift() ?? t.demographics.room;
    for (let n = Number(room) || 0; rooms.has(String(room)); n++) room = String(n + 1);
    rooms.add(String(room));
    const v = scenario.variants?.[iid];
    const lock = count[cid] === 1 && !v?.seed ? t.case?.locked?.[0] : null;
    const seed = v?.seed ?? lock?.seed ?? `${scenario.seed ?? scenario.id}:${iid}`;
    // As written (the demo, or a locked "as written" variant): file name and values, first allowed drug.
    const asWritten = t.case && count[cid] === 1 && !v?.seed && (lock ? lock.nominal : nominal);
    templatesById[iid] = instantiate(t, { seed, instanceId: iid, catalogs, room, usedNames: used, vary, ...(asWritten ? { identity: fileIdentity(t), nominal: true } : {}) });
    return iid;
  };
  const groups = scenario.groups.map((g) => {
    const gr = [...(g.rooms || [])];
    return { ...g, patients: (g.patients || []).map((id) => make(id, gr)), admissions: (g.admissions || []).map((id) => make(id, gr)) };
  });
  return { scenario: { ...scenario, groups }, templatesById };
}

/** Short instructor code for a case title: "Cardiac 1" → "C1", "Heart failure 1" → "HF1" (unique against `taken`). */
export function suggestCode(title, taken = []) {
  const words = String(title || '').split(/[\s-]+/).filter(Boolean);
  const letters = words.filter((w) => !/^\d+$/.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 2) || 'P';
  let n = Number(words.find((w) => /^\d+$/.test(w)) || 1);
  const used = new Set(taken.map((x) => String(x).toUpperCase()));
  while (used.has(`${letters}${n}`)) n++;
  return `${letters}${n}`;
}
/** The case's instructor code ("C1"), or null for a fixed patient. */
export const caseCode = (t) => t?.instance?.code ?? t?.case?.code ?? null;
/** INSTRUCTOR only: "(C1) Robert Miller" (a fixed patient: just the name). Students never see the code. */
export const codeName = (t) => (t ? `${caseCode(t) ? `(${caseCode(t)}) ` : ''}${t.demographics.name}` : '');

/** Instructor-facing label: "Cardiac 1 — Robert Miller, 68M, metoprolol tartrate". Students never see it. */
export function caseLabel(t) {
  if (!t?.instance) return t ? `${t.demographics.name}` : '';
  const meds = Object.values(t.instance.meds || {});
  return `${t.instance.caseTitle} — ${t.demographics.name}, ${t.demographics.age}${t.demographics.sex || ''}${meds.length ? `, ${meds.join(', ')}` : ''}`;
}
