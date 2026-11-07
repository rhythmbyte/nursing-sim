// Readiness (cases and sims) and Generate.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/engine/runner.js'; // engine first (import cycle through timeliness.js)
import { catalogs, casesById, load } from './fixtures.mjs';
import { applyProgram } from '../js/engine/program.js';
import { caseReadiness, simReadiness } from '../js/engine/readiness.js';
import { generateSim, mixCounts } from '../js/engine/generate.js';
import { validateItem } from '../js/data-loader.js';
import { instantiateScenario } from '../js/engine/cases.js';
import { seededRandom } from '../js/engine/cases.js';

const library = Object.values(casesById);
const rn = applyProgram({ catalogs, patients: library, scenarios: [] }, 'rn');
const lpn = applyProgram({ catalogs, patients: library, scenarios: [] }, 'lpn');

test('case readiness: blocking reasons vs notes, from data', () => {
  const r = caseReadiness(casesById['p4-linda-garcia'], { catalogs: rn.catalogs, program: rn.program });
  assert.equal(r.status, 'ready');
  assert.ok(r.notes.some((n) => n.code === 'proposed-items'));
  const james = caseReadiness(casesById['p6-james-carter'], { catalogs: rn.catalogs, program: rn.program });
  assert.equal(james.status, 'needs-work');
  assert.ok(james.blocking.some((b) => b.code === 'unreviewed-case'));
  assert.ok(james.notes.some((b) => b.code === 'no-script'), 'no script is a note, not blocking');
  // Tools: Margaret's POSS order needs a tool the default (public tools only) doesn't offer.
  const m = caseReadiness(casesById['p2-margaret-wilson'], { catalogs: rn.catalogs, program: rn.program });
  assert.ok(m.blocking.some((b) => b.code === 'tools-unavailable' && /poss/.test(b.message)));
  assert.equal(caseReadiness(casesById['p2-margaret-wilson'], { catalogs: rn.catalogs, program: rn.program, settings: { ...rn.catalogs.scenarioDefaults.settings, assessmentTools: 'all' } }).status, 'ready');
  // A broken range blocks.
  const broken = structuredClone(casesById['p4-linda-garcia']); broken.vitals.ranges.sbp = [85, 106];
  const b = caseReadiness(broken, { catalogs: rn.catalogs, program: rn.program });
  assert.equal(b.status, 'needs-work');
  assert.ok(b.blocking.some((x) => x.code === 'range-warnings'));
  // Which codes block is data.
  const lenient = { ...rn.catalogs, readiness: { ...rn.catalogs.readiness, blocking: [] } };
  assert.equal(caseReadiness(structuredClone(casesById['p6-james-carter']), { catalogs: lenient, program: rn.program }).status, 'ready');
});

test('sim readiness: every case must be ready; missing cases and empty groups block', () => {
  const sc = load('scenarios/busy-medsurg-shift.json');
  const r = simReadiness(sc, library, { catalogs: rn.catalogs, program: rn.program });
  assert.equal(r.status, 'needs-work');
  assert.ok(r.blocking.some((b) => b.caseId === 'p6-james-carter'));
  const ok = { ...sc, settings: { assessmentTools: 'all' }, groups: [{ id: 'g1', name: 'G', studentCount: 1, patients: ['p1-robert-miller', 'p4-linda-garcia'] }] };
  assert.equal(simReadiness(ok, library, { catalogs: rn.catalogs, program: rn.program }).status, 'ready');
  const bad = { ...ok, groups: [{ id: 'g1', name: 'Empty', studentCount: 1, patients: [] }, { id: 'g2', name: 'G2', studentCount: 1, patients: ['p-nope'] }] };
  const codes = simReadiness(bad, library, { catalogs: rn.catalogs, program: rn.program }).blocking.map((b) => b.code);
  assert.ok(codes.includes('empty-group') && codes.includes('missing-case'));
});

test('generate: groups of one student, triage mix, no repeats within a group, spread across groups, valid scenario', () => {
  assert.deepEqual(mixCounts(4, { red: 1, yellow: 1, green: 1 }), { red: 2, yellow: 1, green: 1 });
  assert.deepEqual(mixCounts(3, { red: 0, yellow: 1, green: 2 }), { red: 0, yellow: 1, green: 2 });
  const { scenario, warnings } = generateSim({ students: 10, perStudent: 4, difficulty: 'standard', presetId: 'beginner', program: rn.program, rng: seededRandom('g'), now: 1 }, library, rn.catalogs);
  assert.equal(scenario.groups.length, 10);
  for (const g of scenario.groups) { assert.equal(g.patients.length, 4); assert.equal(new Set(g.patients).size, 4); assert.equal(g.studentCount, 1); }
  assert.equal(scenario.preset, 'beginner');
  assert.equal(scenario.program, 'rn');
  assert.equal(scenario.settings.recoveryPenalties, false);
  assert.deepEqual(validateItem('scenario', scenario, Object.fromEntries(Object.entries({ scenario: 'schemas/scenario.schema.json' }).map(([k, f]) => [k, load(f)]))), []);
  assert.ok(warnings.some((w) => /more than one group/.test(w)));
  // Cases of the same triage color are used about equally (least-used first). (There's one yellow and one green
  // starter case, so those two are in every group; the four red cases share the red slots.)
  const uses = {}; for (const g of scenario.groups) for (const id of g.patients) uses[id] = (uses[id] || 0) + 1;
  const red = library.filter((t) => t.tag === 'red').map((t) => uses[t.id] || 0);
  assert.ok(Math.max(...red) - Math.min(...red) <= 1, JSON.stringify(uses));
  // It instantiates: 40 patients, the same case in 7 groups gets 7 different patients.
  const inst = instantiateScenario(scenario, library, rn.catalogs);
  assert.equal(Object.keys(inst.templatesById).length, 40);
  const robertNames = Object.entries(inst.templatesById).filter(([id]) => id.startsWith('p1-robert-miller')).map(([, t]) => t.demographics.name);
  assert.equal(new Set(robertNames).size, robertNames.length);
  // Program and tags limit the pool; asking for more than there are caps with a warning.
  const g2 = generateSim({ students: 2, perStudent: 6, program: lpn.program, rng: seededRandom('l') }, library, lpn.catalogs);
  const lpnCases = library.filter((t) => t.patientTags?.license?.includes('lpn')).map((t) => t.id);
  assert.ok(g2.scenario.groups.every((g) => g.patients.every((id) => lpnCases.includes(id))));
  assert.ok(g2.warnings.some((w) => /Only \d matching case/.test(w)));
  assert.equal(generateSim({ students: 2, perStudent: 2, tags: { unit: ['icu'] }, program: rn.program }, library, rn.catalogs).scenario, null);
});
