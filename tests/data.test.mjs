// Dev-only check: every data file listed in the manifest validates against its schema,
// and the manifest lists every patient/scenario on disk.
// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validate } from '../js/validate.js';

const root = new URL('../data/', import.meta.url);
const load = (rel) => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
const manifest = load('manifest.json');

const schemaFor = {
  patients: load('schemas/patient.schema.json'),
  scenarios: load('schemas/scenario.schema.json'),
  interventions: load('schemas/interventions.schema.json'),
  labs: load('schemas/labs.schema.json'),
  staff: load('schemas/staff.schema.json'),
  rules: load('schemas/rules.schema.json'),
  vitals: load('schemas/vitals.schema.json'),
  scenarioDefaults: load('schemas/scenario-defaults.schema.json'),
  priorityScales: load('schemas/priority-scales.schema.json'),
  ui: load('schemas/ui.schema.json'),
  vitalsPresets: load('schemas/vitals-presets.schema.json'),
  rhythms: load('schemas/rhythms.schema.json'),
  help: load('schemas/help.schema.json'),
  reflection: load('schemas/reflection.schema.json'),
  reactionTemplates: load('schemas/reaction-templates.schema.json'),
};

for (const [name, rel] of Object.entries(manifest.catalogs)) {
  test(`catalog ${name} is valid`, () => {
    assert.deepEqual(validate(load(rel), schemaFor[name]), []);
  });
}

for (const kind of ['patients', 'scenarios']) {
  for (const rel of manifest[kind]) {
    test(`${rel} is valid`, () => {
      assert.deepEqual(validate(load(rel), schemaFor[kind]), []);
    });
  }

  test(`manifest lists every file in data/${kind}`, () => {
    const onDisk = readdirSync(new URL(`${kind}/`, root)).filter((f) => f.endsWith('.json')).map((f) => `${kind}/${f}`);
    assert.deepEqual([...onDisk].sort(), [...manifest[kind]].sort());
  });
}

test('validator catches bad data', () => {
  const errs = validate({ id: 'x', tag: 'purple' }, schemaFor.patients);
  assert.ok(errs.some((e) => e.includes('missing required "demographics"')));
  assert.ok(errs.some((e) => e.includes('"purple" is not one of')));
});

test('no broken references in any starter file', async () => {
  const { patientReferenceProblems, scenarioReferenceProblems } = await import('../js/engine/integrity.js');
  const catalogs = Object.fromEntries(Object.entries(manifest.catalogs).map(([k, rel]) => [k, load(rel)]));
  const patients = manifest.patients.map(load);
  for (const t of patients) assert.deepEqual(patientReferenceProblems(t, catalogs), [], t.id);
  const ids = new Set(patients.map((t) => t.id));
  for (const rel of manifest.scenarios) assert.deepEqual(scenarioReferenceProblems(load(rel), ids), [], rel);
});

test('broken references are reported clearly', async () => {
  const { patientReferenceProblems, scenarioReferenceProblems } = await import('../js/engine/integrity.js');
  const catalogs = Object.fromEntries(Object.entries(manifest.catalogs).map(([k, rel]) => [k, load(rel)]));
  const t = structuredClone(load('patients/p1-robert-miller.json'));
  t.orders[0].interventionIds = ['teleport'];
  t.orders[0].labCodes = ['unobtainium'];
  t.events.find((e) => e.type === 'vitals-change').payload.keyframe = 'e-missing';
  t.labs[0].code = 'zz';
  t.orders[1].activeOnEvent = 'e-nope';
  const p = patientReferenceProblems(t, catalogs);
  for (const re of [/intervention "teleport" is not in data\/catalogs\/interventions.json/, /lab "unobtainium"/, /no vitals keyframe "e-missing"/, /labs\[0\]: lab "zz"/, /activeOnEvent: no event "e-nope"/]) {
    assert.ok(p.some((x) => re.test(x)), re.source);
  }
  const sc = { groups: [{ id: 'g1', patients: ['p-ghost'] }], manualStudents: { g9: [] } };
  assert.equal(scenarioReferenceProblems(sc, new Set()).length, 2);
});

test('C14: the demo scenario named in ui.json exists', () => {
  const ui = load(manifest.catalogs.ui);
  assert.ok(manifest.scenarios.map(load).some((s) => s.id === ui.demo.scenarioId));
});

test('C15: every literal field label in setup/editor/builder has help text in help.json', async () => {
  const { helpSlug } = await import('../js/screens/shared/help.js');
  const help = load(manifest.catalogs.help);
  const { readFileSync: read } = await import('node:fs');
  for (const [file, screen] of [['sim-setup', 'setup'], ['patient-editor', 'editor'], ['change-builder', 'change']]) {
    const src = read(new URL(`../js/screens/instructor/${file}.js`, import.meta.url), 'utf8');
    for (const [, label] of src.matchAll(/field\('([^']+)'/g)) assert.ok(help[`${screen}.${helpSlug(label)}`], `${screen}: "${label}"`);
    for (const [, key] of src.matchAll(/helpTip\('([^']+)'\)/g)) assert.ok(help[key], key);
  }
});

test('Suggestion 6: rhythms and help catalogs pass per-entry checks; mistakes are caught', async () => {
  const { rhythmCatalogProblems, helpCatalogProblems } = await import('../js/engine/integrity.js');
  const rhythms = load(manifest.catalogs.rhythms);
  const help = load(manifest.catalogs.help);
  assert.deepEqual(rhythmCatalogProblems(rhythms), []);
  assert.deepEqual(helpCatalogProblems(help), []);
  const { reactionTemplateProblems } = await import('../js/engine/integrity.js');
  const all = Object.fromEntries(Object.entries(manifest.catalogs).map(([k, rel]) => [k, load(rel)]));
  assert.deepEqual(reactionTemplateProblems(all.reactionTemplates, all), []);
  assert.match(reactionTemplateProblems({ templates: [{ id: 'x', label: 'X', states: [{ id: 'a', label: 'A' }], reactions: [{ id: 'r-x', when: { kind: 'fired', eventId: 'e-p1' }, then: [{ type: 'state', to: 'zz' }] }] }] }, all).join('\n'), /templates cannot use a patient's own orders or events[\s\S]*no state "zz"/);
  const bad = structuredClone(rhythms);
  bad.rhythms.sinus.draw.shape = 'zigzag';
  bad.rhythms.afib.draw.irregular = 2;
  bad.rhythms.vf.pulseless = 'yes';
  bad.rhythms.vt.aliases = ['PEA'];
  const p = rhythmCatalogProblems(bad);
  for (const re of [/sinus: draw.shape/, /afib: draw.irregular/, /vf: pulseless must be true or false/, /name "PEA" also belongs/]) assert.ok(p.some((x) => re.test(x)), re.source);
  assert.equal(helpCatalogProblems({ 'Setup Name': 'x', 'setup.ok': ' ', _comment: 'skip' }).length, 2);
});
