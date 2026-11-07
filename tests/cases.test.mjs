// Case templates: seeded instantiation, placeholders, ranges, relative changes, med classes, and the variant check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { casesById, catalogs, scenario, templatesById } from './fixtures.mjs';
import { instantiate, instantiateScenario, fileIdentity, fillText, caseLabel, allowedDrugs, seededRandom } from '../js/engine/cases.js';
import { rangeWarnings, variantProblems } from '../js/engine/case-check.js';

const library = Object.values(casesById);
const linda = casesById['p4-linda-garcia'];
const dorothy = casesById['p5-dorothy-evans'];
const unfilled = (o) => JSON.stringify(o).match(/\{[A-Za-z][A-Za-z0-9./-]*\}/g) || [];

test('same seed → same patient; different seed → different patient', () => {
  const a = instantiate(linda, { seed: 'sim-1', catalogs });
  const b = instantiate(linda, { seed: 'sim-1', catalogs });
  assert.deepEqual(a, b);
  const names = new Set(Array.from({ length: 12 }, (_, i) => instantiate(linda, { seed: `s${i}`, catalogs }).demographics.name));
  assert.ok(names.size > 6, 'names vary across seeds');
  assert.equal(seededRandom('x')(), seededRandom('x')());
});

test('round trip: the file identity + nominal values reproduce the starter texts and values', () => {
  const DROP = ['case', 'ranges', 'rangesReview', 'range', 'rangeReview', 'teachingPoint', 'medClass', 'instance'];
  const strip = (o) => (Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !DROP.includes(k)).map(([k, v]) => [k, strip(v)])) : o);
  for (const t of library) {
    const rt = templatesById[t.id];
    assert.deepEqual(unfilled(rt), [], `${t.id} has no unfilled placeholders`);
    const orig = JSON.parse(readFileSync(new URL(`../data/patients/${t.id}.json`, import.meta.url), 'utf8'));
    assert.equal(rt.demographics.name, orig.demographics.name);
    assert.deepEqual(strip(rt).vitals.baseline, orig.vitals.baseline);
  }
  // The texts the instructor wrote (names, pronouns, vitals in the handoff) come back as they were.
  assert.match(templatesById['p4-linda-garcia'].handoff.assessment, /febrile 101\.3, HR 104, RR 24, BP 102\/64, SpO2 91% on 2 L.*WBC 17\.8/);
  assert.match(templatesById['p1-robert-miller'].events[0].payload.message, /^Robert is on his call light: his chest pain/);
  assert.match(templatesById['p3-harold-thompson'].hpi, /lives at home with his wife, who is available to help him/);
});

test('placeholders: names, pronouns, word pairs, vitals, labs, room and class drugs; unknown ones stay', () => {
  const ctx = { first: 'Ana', last: 'Ruiz', sex: 'F', age: 70, room: '305', meds: { doac: { name: 'rivaroxaban', dose: '20 mg', route: 'PO', freq: 'daily' } }, vitals: { bp: '120/70', hr: 80 }, labs: { wbc: '9.1' } };
  assert.equal(fillText('{Mr/Ms} {lastName} ({age}{sex}, room {room}): {He/She} says {his/her} {wife/husband} is here. {Dad/Mom}!', ctx), 'Ms. Ruiz (70F, room 305): She says her husband is here. Mom!');
  assert.equal(fillText('{med.doac.Name} {med.doac.dose} {med.doac.freq}; hold {med.doac}. BP {bp}, HR {hr}, WBC {lab.wbc}', ctx), 'Rivaroxaban 20 mg daily; hold rivaroxaban. BP 120/70, HR 80, WBC 9.1');
  assert.equal(fillText('{med.ppi} {nothing}', ctx), '{med.ppi} {nothing}');
  for (let i = 0; i < 40; i++) for (const t of library) assert.deepEqual(unfilled(instantiate(t, { seed: `p${i}`, catalogs })), [], `${t.id} seed p${i}`);
});

test('ranges: baseline vitals and labs stay in range; teaching points stay fixed; handoff text matches the variant', () => {
  for (let i = 0; i < 30; i++) {
    const v = instantiate(linda, { seed: `r${i}`, catalogs });
    const b = v.vitals.baseline;
    const [s, d] = b.bp.split('/').map(Number);
    assert.ok(s >= 98 && s <= 106 && d >= 60 && d <= 68 && b.hr >= 100 && b.hr <= 108 && b.spo2 >= 90 && b.spo2 <= 92);
    assert.equal(v.labs.find((l) => l.code === 'lactate').value, '2.8');
    assert.equal(v.labs.find((l) => l.code === 'cr').value, '1.4');
    const wbc = Number(v.labs.find((l) => l.code === 'wbc').value);
    assert.ok(wbc >= 16 && wbc <= 19.5);
    assert.ok(v.handoff.assessment.includes(`BP ${b.bp}, SpO2 ${b.spo2}%`) && v.handoff.assessment.includes(`WBC ${v.labs.find((l) => l.code === 'wbc').value}`));
    const age = v.demographics.age;
    assert.ok(age >= 56 && age <= 70 && v.handoff.situation.startsWith(`${age}${v.demographics.sex} `));
    // Keyframes are absolute here, so the sepsis drop is the same for every variant.
    assert.equal(v.vitals.keyframes[0].values.bp, '86/52');
  }
});

test('relative scripted changes resolve against the instantiated baseline', () => {
  const t = structuredClone(linda);
  delete t.vitals.keyframes[0].values.bp;
  t.vitals.keyframes[0].valuesRel = { sbp: -20, hr: 15 };
  t.script.states.find((s) => s.id === 'hypoxic').vitals.valuesRel = { spo2: -9 };
  const v = instantiate(t, { seed: 'rel', catalogs });
  const [s, d] = v.vitals.baseline.bp.split('/').map(Number);
  assert.equal(v.vitals.keyframes[0].values.bp, `${s - 20}/${d}`);
  assert.equal(v.vitals.keyframes[0].values.hr, v.vitals.baseline.hr + 15);
  assert.equal(v.script.states.find((x) => x.id === 'hypoxic').vitals.values.spo2, v.vitals.baseline.spo2 - 9);
  assert.ok(!('valuesRel' in v.vitals.keyframes[0]));
});

test('med classes: one drug per class used in home meds, orders, MAR text and handoff; allergies and exclusions respected', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const v = instantiate(dorothy, { seed: `m${i}`, catalogs });
    const drug = v.instance.meds.doac;
    seen.add(drug);
    const order = v.orders.find((o) => o.id === 'o-p5-apixaban');
    assert.ok(order.med.toLowerCase().startsWith(drug) && order.text.toLowerCase().startsWith(drug));
    assert.equal(v.homeMeds.find((m) => m.medClass === 'doac').name.toLowerCase(), drug);
    assert.ok(v.hpi.includes(`takes ${drug}`) && v.handoff.background.includes(`on ${drug}`));
    assert.equal(v.orders.find((o) => o.id === 'o-p5-hold-apix').text, `Hold ${drug}`);
    assert.ok(v.debrief.shouldRecognize.some((s) => s.includes(`scheduled ${drug}`)));
  }
  assert.deepEqual([...seen].sort(), ['apixaban', 'rivaroxaban']);
  // Same drug as the file keeps the file's dose (Harold's atorvastatin 20 mg).
  const harold = casesById['p3-harold-thompson'];
  for (let i = 0; i < 20; i++) {
    const m = instantiate(harold, { seed: `h${i}`, catalogs }).homeMeds.find((x) => x.medClass === 'statin');
    if (m.name === 'Atorvastatin') assert.equal(m.dose, '20 mg');
  }
  // Allergy: never pick a drug the patient is allergic to; exclusions per case.
  const allergic = { ...structuredClone(dorothy), allergies: [{ agent: 'Rivaroxaban', reaction: 'Rash' }] };
  assert.deepEqual(allowedDrugs(allergic, 'doac', catalogs).map((d) => d.id), ['apixaban']);
  const excl = structuredClone(dorothy); excl.case.excludeDrugs = ['apixaban'];
  for (let i = 0; i < 10; i++) assert.equal(instantiate(excl, { seed: `x${i}`, catalogs }).instance.meds.doac, 'rivaroxaban');
  const none = structuredClone(excl); none.allergies = [{ agent: 'Rivaroxaban' }];
  assert.ok(rangeWarnings(none, catalogs).some((w) => w.level === 'error' && /No drug left in "doac"/.test(w.message)));
});

test('a sim: same case twice → different instance ids, names, rooms and variants; seeds stored and reused', () => {
  const sc = { ...scenario, seed: 'abc', groups: [{ id: 'g1', name: 'A', patients: ['p4-linda-garcia', 'p1-robert-miller'], rooms: ['301', '302'] }, { id: 'g2', name: 'B', patients: ['p4-linda-garcia'] }] };
  const a = instantiateScenario(sc, library, catalogs);
  assert.deepEqual(a.scenario.groups.map((g) => g.patients), [['p4-linda-garcia', 'p1-robert-miller'], ['p4-linda-garcia~2']]);
  const [l1, l2] = [a.templatesById['p4-linda-garcia'], a.templatesById['p4-linda-garcia~2']];
  assert.notEqual(l1.demographics.name, l2.demographics.name);
  assert.equal(l1.demographics.room, '301');
  assert.notEqual(l2.demographics.room, l1.demographics.room);
  assert.deepEqual(instantiateScenario(sc, library, catalogs).templatesById, a.templatesById, 'reload = same patients');
  // Locked variant on the case is used for its first instance; a per-sim variant seed wins.
  const locked = library.map((t) => (t.id === 'p4-linda-garcia' ? { ...t, case: { ...t.case, locked: [{ seed: 'keep-me', label: 'Favorite' }] } } : t));
  const b = instantiateScenario(sc, locked, catalogs);
  assert.equal(b.templatesById['p4-linda-garcia'].instance.seed, 'keep-me');
  const c = instantiateScenario({ ...sc, variants: { 'p4-linda-garcia': { seed: 'rerolled' } } }, locked, catalogs);
  assert.equal(c.templatesById['p4-linda-garcia'].instance.seed, 'rerolled');
});

test('case label for the instructor: title, name, age/sex, class drugs; students never get the title', () => {
  const v = instantiate(dorothy, { seed: 'label', catalogs, identity: fileIdentity(dorothy), nominal: true });
  assert.equal(caseLabel(v), 'Neuro 1 — Dorothy Evans, 82F, apixaban, metoprolol');
  const studentView = readFileSync(new URL('../js/engine/student-view.js', import.meta.url), 'utf8');
  assert.ok(!/instance|caseTitle|\bcase\b/.test(studentView.replace(/\/\/.*$/gm, '')), 'student view does not copy instance or case');
});

test('variant integrity: every starter case keeps its triggers, thresholds and teaching points across many variants', () => {
  for (const t of library) {
    const problems = variantProblems(t, { catalogs, settings: scenario.settings, samples: 24 });
    assert.deepEqual(problems, [], `${t.id}: ${problems.map((p) => p.message).join(' | ')}`);
  }
});

test('variant integrity catches a range or a relative change that breaks the script', () => {
  const t = structuredClone(linda);
  t.vitals.ranges.sbp = [85, 106];
  const w = rangeWarnings(t, catalogs);
  assert.ok(w.some((x) => /SBP range 85–106 crosses SBP < 90/.test(x.message)));
  assert.ok(variantProblems(t, { catalogs, settings: scenario.settings, samples: 24 }).some((x) => x.level === 'error' && /SBP is past < 90/.test(x.message)));
  const r = structuredClone(linda);
  delete r.vitals.keyframes[0].values.bp;
  r.vitals.keyframes[0].valuesRel = { sbp: -14 };
  assert.ok(rangeWarnings(r, catalogs).some((x) => /doesn’t always cross SBP < 90/.test(x.message)));
  const lab = structuredClone(linda);
  lab.labs.find((l) => l.code === 'na').range = [132, 137];
  assert.ok(rangeWarnings(lab, catalogs).some((x) => /na range 132–137 crosses the reference range/.test(x.message)));
});

test('variation toggles: names / values / meds off = that part exactly as written; codes "(C1) Robert Miller"', async () => {
  const { varyFrom, codeName, suggestCode } = await import('../js/engine/cases.js');
  const all = { names: false, values: false, meds: false };
  const asWritten = instantiate(dorothy, { seed: 'v1', catalogs, vary: all });
  assert.equal(asWritten.demographics.name, 'Dorothy Evans');
  assert.equal(asWritten.vitals.baseline.bp, '142/80');
  assert.equal(asWritten.instance.meds.doac, 'apixaban');
  for (let i = 0; i < 12; i++) {
    const n = instantiate(dorothy, { seed: `v${i}`, catalogs, vary: { names: true, values: false, meds: false } });
    assert.equal(n.vitals.baseline.bp, '142/80'); assert.equal(n.instance.meds.doac, 'apixaban');
    const v = instantiate(dorothy, { seed: `v${i}`, catalogs, vary: { names: false, values: true, meds: false } });
    assert.equal(v.demographics.name, 'Dorothy Evans'); assert.equal(v.instance.meds.doac, 'apixaban');
    const m = instantiate(dorothy, { seed: `v${i}`, catalogs, vary: { names: false, values: false, meds: true } });
    assert.equal(m.demographics.name, 'Dorothy Evans'); assert.equal(m.vitals.baseline.bp, '142/80');
  }
  assert.deepEqual(varyFrom({ randomizeNames: false }), { names: false, values: true, meds: true });
  // Scenario settings drive instantiateScenario.
  const sc = { ...scenario, settings: { ...scenario.settings, randomizeNames: false, randomizeValues: false, randomizeMeds: false } };
  const out = instantiateScenario(sc, library, catalogs);
  assert.equal(out.templatesById['p1-robert-miller'].demographics.name, 'Robert Miller');
  assert.equal(codeName(out.templatesById['p1-robert-miller']), '(C1) Robert Miller');
  assert.equal(codeName(out.templatesById['p4-linda-garcia']), '(S1) Linda Garcia');
  assert.equal(suggestCode('Cardiac 1'), 'C1');
  assert.equal(suggestCode('Heart failure 1'), 'HF1');
  assert.equal(suggestCode('Cardiac 1', ['C1', 'C2']), 'C3');
  assert.equal(new Set(library.map((t) => t.case.code)).size, library.length, 'starter codes are unique');
});
