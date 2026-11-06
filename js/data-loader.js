// Fetches data/**/*.json via data/manifest.json and validates each file against its schema.
// No DOM. Invalid files are reported in `problems` and left out of the results.

import { validate } from './validate.js';
import { eventGroupProblems } from './engine/scheduler.js';
import { load, save } from './storage.js';
import { scaleProblems } from './engine/priority.js';
import { patientReferenceProblems, scenarioReferenceProblems } from './engine/integrity.js';

// Checks JSON Schema can't express (cross-field rules), per kind of file.
const EXTRA_CHECKS = {
  patient: (d) => eventGroupProblems(d.events, '$.events'),
  scenario: (d) => eventGroupProblems(d.events, '$.events'),
  priorityScales: (d) => scaleProblems(d),
};

const SCHEMAS = {
  patient: 'schemas/patient.schema.json',
  scenario: 'schemas/scenario.schema.json',
  interventions: 'schemas/interventions.schema.json',
  labs: 'schemas/labs.schema.json',
  staff: 'schemas/staff.schema.json',
  rules: 'schemas/rules.schema.json',
  vitals: 'schemas/vitals.schema.json',
  scenarioDefaults: 'schemas/scenario-defaults.schema.json',
  priorityScales: 'schemas/priority-scales.schema.json',
  ui: 'schemas/ui.schema.json',
  vitalsPresets: 'schemas/vitals-presets.schema.json',
  rhythms: 'schemas/rhythms.schema.json',
  help: 'schemas/help.schema.json',
};

async function fetchJson(base, rel) {
  const res = await fetch(base + rel);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

// Instructor edits made in the browser (patient editor, review approvals, sim setup) overlay the files.
// Prototype: they live in this browser via storage.js; publish by exporting JSON and committing it.
// Full build: these become API writes (SPEC §13).
const LOCAL_KEYS = { patient: 'library.patients', scenario: 'library.scenarios', catalog: 'library.catalogs' };

/** Validate a patient or scenario object: schema + cross-field checks. Returns error strings. */
export function validateItem(kind, data, schemas) {
  const errors = validate(data, schemas[kind]);
  return errors.length || !EXTRA_CHECKS[kind] ? errors : EXTRA_CHECKS[kind](data);
}

/** Save an edited catalog (e.g. review approval) by name. Returns error strings. */
export function saveLocalCatalog(name, data, schemas) {
  const errors = validate(data, schemas[name]);
  if (errors.length) return errors;
  const all = load(LOCAL_KEYS.catalog, {});
  all[name] = data;
  return save(LOCAL_KEYS.catalog, all) ? [] : ['Could not save (browser storage is full or blocked).'];
}

export function removeLocalCatalog(name) {
  const all = load(LOCAL_KEYS.catalog, {});
  delete all[name];
  save(LOCAL_KEYS.catalog, all);
}

/** Save a local edit/new item. Returns error strings (nothing saved if any). */
export function saveLocal(kind, data, schemas) {
  const errors = validateItem(kind, data, schemas);
  if (errors.length) return errors;
  const all = load(LOCAL_KEYS[kind], {});
  all[data.id] = data;
  if (!save(LOCAL_KEYS[kind], all)) return ['Could not save (browser storage is full or blocked).'];
  return [];
}

/** Drop a local edit (patient goes back to its file version; a local-only item disappears). */
export function removeLocal(kind, id) {
  const all = load(LOCAL_KEYS[kind], {});
  delete all[id];
  save(LOCAL_KEYS[kind], all);
}

function overlay(kind, fileItems, schemas, problems, extraCheck = () => []) {
  const local = load(LOCAL_KEYS[kind], {});
  const byId = new Map(fileItems.map((x) => [x.id, x]));
  const localIds = new Set();
  for (const [id, item] of Object.entries(local)) {
    const errors = validateItem(kind, item, schemas);
    if (!errors.length) errors.push(...extraCheck(item));
    if (errors.length) {
      const kept = byId.has(id) ? ' (the file version is used instead)' : '';
      problems.push({ file: `browser edit: ${id}${kept}`, errors });
      continue;
    }
    byId.set(id, item);
    localIds.add(id);
  }
  return { items: [...byId.values()], localIds, fileIds: new Set(fileItems.map((x) => x.id)) };
}

/**
 * @returns {Promise<{patients, scenarios, catalogs, problems, schemas, local: { patients: Set, scenarios: Set }, fileIds: { patients: Set, scenarios: Set }}>}
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
      Object.entries(manifest.catalogs).map(async ([k, rel]) => [k, await loadChecked(rel, schemas[k], k)]),
    ),
  ]);

  // Catalog edits from this browser (review approvals) replace the file version when valid.
  const localCatalogs = load(LOCAL_KEYS.catalog, {});
  const catalogsOut = Object.fromEntries(catalogEntries.map(([k, v]) => [k, v || null]));
  const localCatalogNames = new Set();
  for (const [name, cat] of Object.entries(localCatalogs)) {
    const errors = schemas[name] ? validate(cat, schemas[name]) : [`Unknown catalog ${name}`];
    if (errors.length) { problems.push({ file: `browser edit: catalog ${name}`, errors }); continue; }
    catalogsOut[name] = cat;
    localCatalogNames.add(name);
  }
  // Broken references (ids pointing at nothing) would fail mid-sim. A broken browser edit is skipped (the
  // file version stays); a broken file patient is left out. Either way the reason is shown to the instructor.
  const refCheck = (t) => patientReferenceProblems(t, catalogsOut);
  const pts = overlay('patient', patients.filter(Boolean), schemas, problems, refCheck);
  pts.items = pts.items.filter((t) => {
    const refs = pts.localIds.has(t.id) ? [] : refCheck(t);
    if (refs.length) problems.push({ file: `patient ${t.id} (left out)`, errors: refs });
    return !refs.length;
  });
  const scs = overlay('scenario', scenarios.filter(Boolean), schemas, problems);
  const libraryIds = new Set(pts.items.map((t) => t.id));
  // A scenario still loads without a missing patient (the session skips it); only one with no patients left is dropped.
  scs.items = scs.items.filter((sc) => {
    const refs = scenarioReferenceProblems(sc, libraryIds);
    const anyLeft = sc.groups.some((g) => [...(g.patients || []), ...(g.admissions || [])].some((id) => libraryIds.has(id)));
    if (refs.length) problems.push({ file: `scenario ${sc.id}${anyLeft ? ' (runs without the missing patients)' : ' (left out: no patients left)'}`, errors: refs });
    return anyLeft;
  });
  return {
    patients: pts.items,
    scenarios: scs.items,
    schemas,
    local: { patients: pts.localIds, scenarios: scs.localIds, catalogs: localCatalogNames },
    fileIds: { patients: pts.fileIds, scenarios: scs.fileIds },
    catalogs: catalogsOut,
    problems,
  };
}
