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
