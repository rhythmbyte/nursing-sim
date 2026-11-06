import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import { generateJoinCode, placeStudent, fillByTagCounts, studentIdsForGroup } from '../js/engine/assignment.js';
import { joinSim } from '../js/engine/roster.js';
import { pushOrder, startCode, setCodeOutcome, setCallLight } from '../js/engine/instructor.js';
import { effectiveTemplates } from '../js/engine/templates.js';
import { evaluateRules } from '../js/engine/rules/index.js';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';

const INS = { userId: 'instructor', role: 'instructor' };
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const twoGroups = (extra = {}) => ({
  ...scenarioWith(), assignment: 'random',
  groups: [{ id: 'g1', name: 'A', studentCount: 1, patients: ['p1-robert-miller'] }, { id: 'g2', name: 'B', studentCount: 2, patients: ['p2-margaret-wilson'] }],
  ...extra,
});

test('join codes: 6 chars, no ambiguous letters', () => {
  const code = generateJoinCode(seq(0, 0.5, 0.99));
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});

test('random placement fills open slots and never over-fills', () => {
  const sc = twoGroups();
  const roster = {};
  for (const [i, name] of ['Ana', 'Ben', 'Cy'].entries()) {
    const r = placeStudent(roster, sc, name, () => 0);
    roster[`student-${i + 1}`] = { name, groupId: r.groupId };
  }
  assert.deepEqual(Object.values(roster).map((r) => r.groupId), ['g1', 'g2', 'g2']);
  assert.deepEqual(placeStudent(roster, sc, 'Dee'), { error: 'All groups are full.', overflow: true });
  assert.match(placeStudent(roster, sc, 'ana').error, /already joined/);
});

test('manual placement uses the instructor roster', () => {
  const sc = twoGroups({ assignment: 'manual', manualStudents: { g1: ['Ana Lopez'], g2: ['Ben Wu'] } });
  assert.deepEqual(placeStudent({}, sc, 'ben wu'), { groupId: 'g2' });
  assert.match(placeStudent({}, sc, 'Zed').error, /isn't on this sim's roster/);
});

test('joinSim: wrong code refused; overflow alerts the instructor', () => {
  const sc = twoGroups({ groups: [{ id: 'g1', name: 'A', studentCount: 1, patients: ['p1-robert-miller'] }] });
  let s = session.createSession(sc, templatesById, catalogs, { joinCode: 'K7Q2ZP' });
  assert.match(joinSim(s, { userId: 'student-1', name: 'Ana', code: 'nope' }, { scenario: sc, now: 0 }).error, /join code/);
  s = joinSim(s, { userId: 'student-1', name: 'Ana', code: 'k7q2zp' }, { scenario: sc, now: 0 }).state;
  assert.equal(s.roster['student-1'].groupId, 'g1');
  const over = joinSim(s, { userId: 'student-2', name: 'Ben', code: 'K7Q2ZP' }, { scenario: sc, now: 0 });
  assert.equal(over.error, 'All groups are full.');
  assert.deepEqual(over.state.alerts.at(-1).audience, ['instructor']);
  assert.deepEqual(studentIdsForGroup(s.roster, 'g1'), ['student-1']);
});

test('tag-count fill: no patient reused across groups; warns when the library runs short', () => {
  const library = Object.values(templatesById);
  const { groups, warnings } = fillByTagCounts([
    { id: 'g1', name: 'A', studentCount: 1, tagCounts: { red: 2, green: 1 } },
    { id: 'g2', name: 'B', studentCount: 1, patients: ['p1-robert-miller'], tagCounts: { red: 3 } },
  ], library, () => 0.3);
  const all = groups.flatMap((g) => g.patients);
  assert.equal(new Set(all).size, all.length, 'no reuse');
  assert.ok(!groups[0].patients.includes('p1-robert-miller'), 'explicit picks are reserved');
  assert.equal(groups[0].patients.length, 3);
  assert.match(warnings[0], /B: wanted 3 red, library only had 1 unused/);
});

test('ad-hoc order: arrives new, shows in effective templates, and the rules see it', () => {
  const sc = scenarioWith();
  let s = session.createSession(sc, templatesById, catalogs, { joinCode: 'X' });
  s = session.controlClock(s, 'start', { now: 0, user: INS });
  s = pushOrder(s, 'p3-harold-thompson', { text: 'Obtain 12-lead ECG now', type: 'once', tier: 1, interventionIds: ['ecg-12lead'] }, { now: 10 * MIN, user: INS });
  const eff = effectiveTemplates(templatesById, s);
  const o = eff['p3-harold-thompson'].orders.at(-1);
  assert.equal(o.text, 'Obtain 12-lead ECG now');
  assert.equal(s.patients['p3-harold-thompson'].orders[o.id].status, 'new');
  assert.equal(templatesById['p3-harold-thompson'].orders.includes(o), false, 'file templates untouched');
  const flags = evaluateRules(s, { templatesById: eff, catalogs, simMin: 20, studentIdsForGroup: () => [], groupOfStudent: () => null });
  assert.ok(flags.some((f) => f.ruleId === 'tier-timeout' && /12-lead ECG now/.test(f.message)));
  assert.throws(() => pushOrder(s, 'p3-harold-thompson', { text: 'x', type: 'bogus', tier: 1 }, { now: 0, user: INS }));
});

test('code controls: start, ROSC sets the scenario roscTag; no ROSC = not alive', () => {
  const sc = scenarioWith();
  let s = session.createSession(sc, templatesById, catalogs, { joinCode: 'X' });
  s = session.controlClock(s, 'start', { now: 0, user: INS });
  s = startCode(s, 'p4-linda-garcia', { rhythm: 'PEA' }, { now: 30 * MIN, user: INS });
  assert.equal(s.patients['p4-linda-garcia'].tag, 'black');
  const rosc = setCodeOutcome(s, 'p4-linda-garcia', 'rosc', { now: 38 * MIN, user: INS });
  assert.deepEqual([rosc.patients['p4-linda-garcia'].tag, rosc.log.at(-1).details.durationMin], ['red', 8]);
  const dead = setCodeOutcome(s, 'p4-linda-garcia', 'no-rosc', { now: 50 * MIN, user: INS });
  assert.equal(dead.patients['p4-linda-garcia'].alive, false);
  assert.equal(setCodeOutcome(dead, 'p4-linda-garcia', 'rosc', { now: 51 * MIN, user: INS }), dead, 'outcome is final');
});

test('instructor call light on/off', () => {
  const sc = scenarioWith();
  let s = session.createSession(sc, templatesById, catalogs, { joinCode: 'X' });
  s = setCallLight(s, 'p2-margaret-wilson', { on: true, message: 'Needs bedpan' }, { now: 0, user: INS });
  assert.equal(s.patients['p2-margaret-wilson'].callLight.message, 'Needs bedpan');
  s = setCallLight(s, 'p2-margaret-wilson', { on: false }, { now: MIN, user: INS });
  assert.equal(s.patients['p2-margaret-wilson'].callLight, null);
});

test('runner: join code generated, join + roster drives flag responsibility', () => {
  const store = createStore();
  const r = createRunner({ store, scenario: scenarioWith(), templatesById, catalogs, now: () => 0, rng: () => 0 });
  assert.equal(r.state.joinCode, 'AAAAAA');
  assert.match(r.join('student-1', 'Ana', 'zzz'), /join code/);
  assert.equal(r.join('student-1', 'Ana', 'aaaaaa'), null);
  assert.deepEqual(r.rulesCtx().studentIdsForGroup('g1'), ['student-1']);
});
