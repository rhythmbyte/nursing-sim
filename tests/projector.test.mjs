// Projector page: join code and who has joined by group; never patient or case information.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { templatesById, catalogs, scenario } from './fixtures.mjs';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';
import { projectorView } from '../js/screens/projector.js';

test('projector view: code, joined count by group, status note; null without a matching session', () => {
  const sc = { ...scenario, groups: scenario.groups.map((g) => ({ ...g, studentCount: 2 })) };
  const runner = createRunner({ store: createStore(), scenario: sc, templatesById, catalogs, now: () => 0 });
  runner.join('s1', 'Ben', runner.state.joinCode);
  runner.join('s2', 'Ana', runner.state.joinCode);
  const v = projectorView(runner.state, sc);
  assert.equal(v.code, runner.state.joinCode);
  assert.equal(v.joined, 2);
  assert.equal(v.groups[0].name, sc.groups[0].name);
  assert.deepEqual(v.groups.flatMap((g) => g.students).sort(), ['Ana', 'Ben']);
  assert.match(v.note, /Waiting for the instructor/);
  assert.equal(projectorView(null, sc), null);
  assert.equal(projectorView({ ...runner.state, scenarioId: 'other' }, sc), null);
  // Students see the projector: nothing about patients, cases or tags in what it renders.
  const json = JSON.stringify(v);
  for (const t of Object.values(templatesById)) assert.ok(!json.includes(t.demographics.name) && !json.includes(t.case?.code ?? '§'), t.id);
  const src = readFileSync(new URL('../js/screens/projector.js', import.meta.url), 'utf8');
  assert.ok(!/patients|templates|caseLabel|codeName|tag/.test(src.replace(/\/\/.*$/gm, '').replace(/projector-[a-z]+/g, '')), 'projector code never touches patient data');
});
