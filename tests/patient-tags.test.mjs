import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs } from './fixtures.mjs';
import { matchesTags, filterText, countByTriage, mergeFilters, patientTagProblems } from '../js/engine/patient-tags.js';
import { fillByTagCounts } from '../js/engine/assignment.js';

const lib = Object.values(templatesById);
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('within a group any tag matches, across groups all must; empty filter matches everything', () => {
  const rm = templatesById['p1-robert-miller'];
  assert.ok(matchesTags(rm, { license: ['rn'], unit: ['med-surg', 'surgical'] }));
  assert.ok(!matchesTags(rm, { license: ['lpn'] }));
  assert.ok(!matchesTags(rm, { unit: ['cardiology'], topic: ['sepsis'] }));
  assert.ok(matchesTags(rm, {}) && matchesTags(rm, { unit: [] }));
  assert.equal(filterText({ license: ['rn'], unit: ['med-surg', 'surgical'] }, catalogs.patientTags), 'RN AND (Med-surg OR Surgical)');
  assert.deepEqual(mergeFilters({ license: ['rn'], unit: ['med-surg'] }, { unit: ['cardiology'], topic: [] }), { license: ['rn'], unit: ['cardiology'] });
});

test('starter patients are tagged with real tags; unknown tags are named', () => {
  for (const t of lib) assert.deepEqual(patientTagProblems(t, catalogs.patientTags), [], t.id);
  assert.deepEqual(patientTagProblems({ patientTags: { unit: ['moon'], nope: ['x'] } }, catalogs.patientTags), ['patientTags.unit: no tag "moon" in group "Unit / location"', 'patientTags: no tag group "nope" in data/catalogs/patient-tags.json']);
});

test('randomizer: counts per triage color for a filter, fill respects sim and group filters, clear warnings', () => {
  const lpn = { license: ['lpn'] };
  assert.deepEqual(countByTriage(lib, lpn), { red: 0, yellow: 1, green: 1, black: 0 });
  const { groups, warnings } = fillByTagCounts([{ id: 'a', name: 'A', tagCounts: { yellow: 1, red: 1 } }], lib, seq([0.1, 0.5]), lpn);
  assert.deepEqual(groups[0].patients.map((id) => templatesById[id].tag), ['yellow']);
  assert.match(warnings[0], /A: wanted 1 red, only 0 unused patients match the patient tags/);
  const card = fillByTagCounts([{ id: 'b', name: 'B', tagCounts: { red: 2 }, tagFilter: { unit: ['cardiology'] } }], lib, seq([0.3]), { license: ['rn'] });
  assert.ok(card.groups[0].patients.every((id) => templatesById[id].patientTags.unit.includes('cardiology')));
});
