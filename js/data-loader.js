// Fetches data/**/*.json via data/manifest.json and validates each file against its schema.
// No DOM. Invalid files are reported in `problems` and left out of the results.

import { validate } from './validate.js';
import { eventGroupProblems } from './engine/scheduler.js';

// Checks JSON Schema can't express (cross-field rules), per kind of file.
const EXTRA_CHECKS = {
  patient: (d) => eventGroupProblems(d.events, '$.events'),
  scenario: (d) => eventGroupProblems(d.events, '$.events'),
};

const SCHEMAS = {
  patient: 'schemas/patient.schema.json',
  scenario: 'schemas/scenario.schema.json',
  interventions: 'schemas/interventions.schema.json',
  labs: 'schemas/labs.schema.json',
  staff: 'schemas/staff.schema.json',
};

async function fetchJson(base, rel) {
  const res = await fetch(base + rel);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{patients: object[], scenarios: object[], catalogs: object, problems: {file: string, errors: string[]}[]}>}
 */
export async function loadAll(base = 'data/') {
  const manifest = await fetchJson(base, 'manifest.json');
  const schemaEntries = await Promise.all(
    Object.entries(SCHEMAS).map(async ([k, rel]) => [k, await fetchJson(base, rel)]),
  );
  const schemas = Object.fromEntries(schemaEntries);
  const problems = [];

  async function loadChecked(rel, schema, kind) {
    try {
      const data = await fetchJson(base, rel);
      let errors = validate(data, schema);
      if (!errors.length && EXTRA_CHECKS[kind]) errors = EXTRA_CHECKS[kind](data);
      if (errors.length) {
        problems.push({ file: rel, errors });
        return null;
      }
      return data;
    } catch (err) {
      problems.push({ file: rel, errors: [String(err.message || err)] });
      return null;
    }
  }

  const [patients, scenarios, catalogEntries] = await Promise.all([
    Promise.all(manifest.patients.map((rel) => loadChecked(rel, schemas.patient, 'patient'))),
    Promise.all(manifest.scenarios.map((rel) => loadChecked(rel, schemas.scenario, 'scenario'))),
    Promise.all(
      Object.entries(manifest.catalogs).map(async ([k, rel]) => [k, await loadChecked(rel, schemas[k])]),
    ),
  ]);

  return {
    patients: patients.filter(Boolean),
    scenarios: scenarios.filter(Boolean),
    catalogs: Object.fromEntries(catalogEntries.map(([k, v]) => [k, v || null])),
    problems,
  };
}
