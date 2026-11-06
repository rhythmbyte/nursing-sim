// Case templates (pure, no DOM). A patient file with `case` is a reusable case ("Cardiac 1"); a sim instantiates it
// into a concrete patient from a seed, so the patient is identical through the sim, reloads, rejoins and the debrief.
// Everything downstream (engine, rules, screens) works on the instantiated patient, so its values are used everywhere.
//   case: { title, sex: 'M'|'F'|'either', ageRange: [lo, hi], excludeDrugs?: [drugIds], locked?: [{ seed, label }] }
//   vitals.ranges: { hr: [lo, hi], sbp, dbp, rr, spo2, tempF }      labs[i].range: [lo, hi] (unless teachingPoint)
//   valuesRel on keyframes / state vitals / vitals effects: relative to the instantiated baseline ({ sbp: -30 })
//   homeMeds[i].medClass / orders[i].medClass: 'beta-blocker' → one drug per class per patient (med-classes.json)
//   Text placeholders anywhere: {firstName} {lastName} {fullName} {age} {sex} {he/she} {He/She} {his/her} {His/Her}
//   {him/her} {Mr/Ms} {med.<class>} {med.<class>.Name|dose|route|freq}
// Instance meta on the result: t.instance = { caseId, caseTitle, seed, meds: { class: drugName } } (instructor-only).

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
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const parseBp = (bp) => { const m = /^(\d+)\/(\d+)/.exec(String(bp ?? '')); return m ? [Number(m[1]), Number(m[2])] : null; };

/** Fill placeholders in one string. Unknown placeholders are left as they are. */
export function fillText(s, ctx) {
  return s.replace(/\{([A-Za-z]+(?:\/[A-Za-z]+)?|med\.[a-z0-9-]+(?:\.[A-Za-z]+)?)\}/g, (all, key) => {
    if (key.startsWith('med.')) {
      const [, cls, part = 'name'] = key.split('.');
      const d = ctx.meds[cls];
      if (!d) return all;
      return part === 'Name' ? cap(d.name) : d[part] ?? all;
    }
    const m = ctx.sex === 'M';
    const v = { firstName: ctx.first, lastName: ctx.last, fullName: `${ctx.first} ${ctx.last}`, age: String(ctx.age), sex: ctx.sex,
      'he/she': m ? 'he' : 'she', 'He/She': m ? 'He' : 'She', 'his/her': m ? 'his' : 'her', 'His/Her': m ? 'His' : 'Her', 'him/her': m ? 'him' : 'her', 'Mr/Ms': m ? 'Mr.' : 'Ms.' }[key];
    return v ?? all;
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
  if (s != null || d != null) out.bp = `${Math.round(s ?? bp?.[0] ?? 120)}/${Math.round(d ?? bp?.[1] ?? 80)}`;
  obj.values = out;
  delete obj.valuesRel;
}

function allergyClasses(catalogs) { return catalogs?.rules?.rules?.['allergy-conflict']?.classes || {}; }

/** Drugs a class may pick from for this patient: not excluded by the case, not matching an allergy. */
export function allowedDrugs(t, classId, catalogs) {
  const cls = catalogs?.medClasses?.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const excl = new Set(t.case?.excludeDrugs || []);
  return cls.drugs.filter((d) => !excl.has(d.id) && !(t.allergies || []).some((a) => allergyMatch(a.agent, d.name, allergyClasses(catalogs))));
}

/**
 * Instantiate one case. opts: { seed, instanceId, catalogs, room?, usedNames?: Set, identity?: { first, last, sex, age },
 * nominal?: true (baseline and lab values as written, first allowed drug) }. Returns a concrete patient template.
 */
export function instantiate(template, { seed, instanceId = template.id, catalogs, room = null, usedNames = new Set(), identity = null, nominal = false }) {
  const t = structuredClone(template);
  t.id = instanceId;
  if (room != null) t.demographics.room = String(room);
  if (!t.case) return t;
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
    if (ok.length) meds[cls] = nominal ? ok[0] : pick(rng, ok);
  }
  const ctx = { first, last, sex, age, meds };
  // Baseline ranges and labs (teaching-point values stay as written).
  const base = t.vitals.baseline;
  if (!nominal) {
    const r = t.vitals.ranges || {};
    for (const k of ['hr', 'rr', 'spo2', 'tempF']) if (r[k]) base[k] = between(rng, r[k], k === 'tempF' ? 1 : 0);
    if (r.sbp || r.dbp) { const bp = parseBp(base.bp) || [120, 80]; base.bp = `${r.sbp ? between(rng, r.sbp) : bp[0]}/${r.dbp ? between(rng, r.dbp) : bp[1]}`; }
    for (const l of t.labs) if (l.range && !l.teachingPoint && l.value != null) l.value = String(between(rng, l.range, l.decimals ?? (String(l.value).includes('.') ? String(l.value).split('.')[1].length : 0)));
  }
  // Relative scripted changes → absolute against this patient's baseline.
  for (const k of t.vitals.keyframes || []) resolveRel(k, base);
  for (const s of t.script?.states || []) if (s.vitals) resolveRel(s.vitals, base);
  for (const r of t.script?.reactions || []) for (const e of r.then) if (e.type === 'vitals') resolveRel(e, base);
  for (const e of t.events) if (e.payload) resolveRel(e.payload, base);
  // Home meds and orders from a class.
  for (const m of t.homeMeds || []) if (m.medClass && meds[m.medClass]) Object.assign(m, { name: cap(meds[m.medClass].name), dose: meds[m.medClass].dose, freq: meds[m.medClass].freq });
  for (const o of t.orders) {
    const d = o.medClass && meds[o.medClass];
    if (!d) continue;
    o.med = `${cap(d.name)} ${d.dose} ${d.route}`;
    if (o.type === 'scheduled' && d.frequencyMin) o.frequencyMin = d.frequencyMin;
  }
  const out = fillAll(t, ctx);
  out.demographics = { ...out.demographics, name: `${first} ${last}`, age, sex };
  out.instance = { caseId: template.id, caseTitle: c.title || template.id, seed: String(seed), meds: Object.fromEntries(Object.entries(meds).map(([k, d]) => [k, d.name])) };
  return out;
}

/** The original identity of a case (its file name/sex/age): instantiating with it reproduces the file (round trip). */
export const fileIdentity = (t) => ({ first: t.demographics.name.split(' ')[0], last: t.demographics.name.split(' ').slice(1).join(' '), sex: t.demographics.sex, age: t.demographics.age });

/**
 * A sim's patients: { scenario (groups list instance ids), templatesById }. The same case twice gets instance ids
 * id, id~2… and different names. Seeds: scenario.variants[instanceId].seed, else the case's first locked seed (first
 * use), else `${scenario.seed ?? scenario.id}:${instanceId}`. Rooms: group.rooms / scenario.rooms, else the case's room
 * (made unique).
 */
export function instantiateScenario(scenario, library, catalogs) {
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
    const seed = v?.seed ?? (count[cid] === 1 ? t.case?.locked?.[0]?.seed : null) ?? `${scenario.seed ?? scenario.id}:${iid}`;
    templatesById[iid] = instantiate(t, { seed, instanceId: iid, catalogs, room, usedNames: used });
    return iid;
  };
  const groups = scenario.groups.map((g) => {
    const gr = [...(g.rooms || [])];
    return { ...g, patients: (g.patients || []).map((id) => make(id, gr)), admissions: (g.admissions || []).map((id) => make(id, gr)) };
  });
  return { scenario: { ...scenario, groups }, templatesById };
}

/** Instructor-facing label: "Cardiac 1 — Robert Miller, 68M, metoprolol tartrate". Students never see it. */
export function caseLabel(t) {
  if (!t?.instance) return t ? `${t.demographics.name}` : '';
  const meds = Object.values(t.instance.meds || {});
  return `${t.instance.caseTitle} — ${t.demographics.name}, ${t.demographics.age}${t.demographics.sex || ''}${meds.length ? `, ${meds.join(', ')}` : ''}`;
}
