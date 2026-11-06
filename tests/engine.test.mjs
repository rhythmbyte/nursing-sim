import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenario, scenarioWith, MIN } from './fixtures.mjs';
import * as clock from '../js/engine/clock.js';
import { dueEvents, occurrenceAt, eventKey, collectEvents, firstScheduled, eventGroupProblems } from '../js/engine/scheduler.js';
import * as session from '../js/engine/session.js';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';
import { studentSlots } from '../js/engine/assignment.js';

const instructor = { userId: 'instructor', role: 'instructor' };
const student = { userId: 'student-1', role: 'student' };

test('clock: speed, pause, and re-anchoring', () => {
  let c = clock.createClock(1);
  c = clock.start(c, 0);
  assert.equal(clock.simMinutes(c, 10 * MIN), 10);
  c = clock.setSpeed(c, 4, 10 * MIN);          // 10 min at 1x, then 4x
  assert.equal(clock.simMinutes(c, 15 * MIN), 30);
  c = clock.pause(c, 15 * MIN);
  assert.equal(clock.simMinutes(c, 99 * MIN), 30); // paused time doesn't count
  c = clock.resume(c, 100 * MIN);
  assert.equal(clock.simMinutes(c, 101 * MIN), 34);
  assert.equal(clock.setSpeed(c, 3, 0), c, 'unsupported speed is ignored');
  assert.equal(clock.start(c, 0), c, 'start only works from ready');
});

test('scheduler: repeats, repeatCount, and manual triggers', () => {
  const ev = { id: 'e-x', atMin: 10, repeatEveryMin: 4, repeatCount: 2 };
  assert.deepEqual([0, 1, 2, 3].map((n) => occurrenceAt(ev, n)), [10, 14, 18, null]);
  const refs = [
    { key: 'p:e-x', patientId: 'p', event: ev },
    { key: 'p:e-m', patientId: 'p', event: { id: 'e-m', trigger: 'manual' } },
  ];
  assert.deepEqual(dueEvents(refs, {}, 15).map((d) => d.at), [10, 14]);
  assert.deepEqual(dueEvents(refs, { 'p:e-x': 2 }, 100).map((d) => d.at), [18]);
  assert.equal(firstScheduled([{ atMin: 90 }, { trigger: 'manual' }, { atMin: 60 }]).atMin, 60);
});

function startedSession() {
  const ids = session.scenarioPatients(scenario).map((p) => p.id);
  const refs = collectEvents(ids, templatesById, scenario);
  let s = session.createSession(scenario, templatesById, catalogs);
  s = session.controlClock(s, 'start', { now: 0, user: instructor });
  return { s, refs };
}

test('session: Robert\'s 08:15 events fire and activate the ECG order', () => {
  let { s, refs } = startedSession();
  assert.equal(s.patients['p1-robert-miller'].orders['o-p1-ecg'], undefined);
  assert.equal(s.patients['p6-james-carter'].present, false, 'admission starts off the unit');

  ({ state: s } = session.tick(s, { now: 76 * MIN, refs, templatesById }));
  const robert = s.patients['p1-robert-miller'];
  assert.equal(robert.callLight.since, 75);
  assert.equal(robert.vitals.hr, 108);
  assert.deepEqual(robert.findingChanges, ['e-p1-pain-returns']);
  assert.deepEqual(robert.orders['o-p1-ecg'], { status: 'new', activeAtMin: 75 });
  assert.equal(s.log.filter((l) => l.action === 'event-fired').every((l) => l.userId === 'system' && l.role === 'system'), true);

  s = session.answerCallLight(s, 'p1-robert-miller', { now: 79 * MIN, user: student });
  const entry = s.log.at(-1);
  assert.equal(entry.action, 'call-light-answered');
  assert.equal(entry.details.responseMin, 4);
  assert.equal(entry.role, 'student');
  assert.equal(s.patients['p1-robert-miller'].callLight, null);
});

test('session: ticking twice never re-fires an event', () => {
  let { s, refs } = startedSession();
  ({ state: s } = session.tick(s, { now: 80 * MIN, refs, templatesById }));
  const { fired } = session.tick(s, { now: 81 * MIN, refs, templatesById });
  assert.equal(fired, 0);
});

test('session: manual sepsis orders activate the whole order set', () => {
  let { s, refs } = startedSession();
  const ref = refs.find((r) => r.key === eventKey('p4-linda-garcia', 'e-p4-sepsis-orders'));
  s = session.fireNow(s, ref, { now: 30 * MIN, templatesById, user: instructor });
  const sepsis = templatesById['p4-linda-garcia'].orders.filter((o) => o.orderSet === 'os-p4-sepsis');
  for (const o of sepsis) assert.equal(s.patients['p4-linda-garcia'].orders[o.id].status, 'new', o.id);
  assert.equal(s.log.at(-1).details.source, 'manual');
  assert.equal(s.alerts.at(-1).kind, 'new-orders');
});

test('session: admission brings James onto the unit, then his orders arrive (no charge nurse)', () => {
  const sc = scenarioWith({ chargeNurse: 'off' });
  const refs = collectEvents(session.scenarioPatients(sc).map((p) => p.id), templatesById, sc);
  let s = session.controlClock(session.createSession(sc, templatesById, catalogs), 'start', { now: 0, user: instructor });
  ({ state: s } = session.tick(s, { now: 151 * MIN, refs, templatesById }));
  assert.equal(s.patients['p6-james-carter'].present, true);
  assert.equal(s.patients['p6-james-carter'].orders['o-p6-lasix'], undefined);
  ({ state: s } = session.tick(s, { now: 156 * MIN, refs, templatesById }));
  assert.equal(s.patients['p6-james-carter'].orders['o-p6-lasix'].status, 'new');
});

test('session: paused clock fires nothing', () => {
  let { s, refs } = startedSession();
  s = session.controlClock(s, 'pause', { now: 10 * MIN, user: instructor });
  const { fired } = session.tick(s, { now: 500 * MIN, refs, templatesById });
  assert.equal(fired, 0);
});

test('runner: pushes state to the store, persists, and resumes a saved session', () => {
  const store = createStore();
  let wall = 0;
  let persisted = null;
  const r = createRunner({ store, scenario, templatesById, now: () => wall, persist: (s) => { persisted = s; } });
  r.clock('start', instructor);
  wall = 76 * MIN;
  r.tick();
  assert.ok(store.get().session.patients['p1-robert-miller'].callLight);
  assert.equal(persisted, store.get().session);

  const r2 = createRunner({ store: createStore(), scenario, templatesById, now: () => wall, saved: persisted });
  assert.ok(r2.state.patients['p1-robert-miller'].callLight, 'resumes saved state');
  const r3 = createRunner({ store: createStore(), scenario, templatesById, saved: { ...persisted, scenarioId: 'sc-other' } });
  assert.equal(r3.state.log.length, 0, 'ignores a session saved for another scenario');
});

test('assignment: one student tab per slot across groups', () => {
  assert.deepEqual(studentSlots({ groups: [{ id: 'a', studentCount: 2 }, { id: 'b', studentCount: 1 }] }).map((s) => s.userId), ['student-1', 'student-2', 'student-3']);
});

test('groups: Fire now fires the whole group, and the scheduled time does not re-fire it', () => {
  let { s, refs } = startedSession();
  const ref = refs.find((r) => r.key === eventKey('p1-robert-miller', 'e-p1-pain-returns'));
  s = session.fireNow(s, ref, { now: 5 * MIN, refs, templatesById, user: instructor });
  const robert = s.patients['p1-robert-miller'];
  assert.ok(robert.callLight);
  assert.equal(robert.vitals.hr, 108, 'linked vitals change fired too');
  assert.deepEqual(robert.findingChanges, ['e-p1-pain-returns'], 'linked findings fired too');
  assert.equal(s.log.filter((l) => l.action === 'event-fired').length, 3);
  ({ state: s } = session.tick(s, { now: 76 * MIN, refs, templatesById }));
  const robertFired = s.log.filter((l) => l.action === 'event-fired' && l.patientId === 'p1-robert-miller');
  assert.equal(robertFired.length, 3, 'nothing for Robert re-fires at 08:15');
});

test('groups: members must share timing', () => {
  for (const t of Object.values(templatesById)) assert.deepEqual(eventGroupProblems(t.events), [], t.id);
  const bad = eventGroupProblems([{ id: 'e-a', group: 'g', atMin: 5 }, { id: 'e-b', group: 'g', atMin: 6 }]);
  assert.equal(bad.length, 1);
});

test('skip to next event: jumps to 08:00 and fires Linda\'s linked events; paused stays paused', () => {
  let { s, refs } = startedSession();
  s = session.controlClock(s, 'pause', { now: 1 * MIN, user: instructor });
  assert.equal(session.nextEventMin(s, refs, 1 * MIN), 60);
  s = session.skipToNext(s, { now: 2 * MIN, refs, templatesById, user: instructor });
  assert.equal(session.simMinOf(s, 50 * MIN), 60);
  assert.equal(s.clock.status, 'paused');
  const fired = s.log.filter((l) => l.action === 'event-fired').map((l) => l.details.eventId);
  assert.deepEqual(fired, ['e-p4-worsens', 'e-p4-worsens-findings']);
  assert.equal(s.log.find((l) => l.action === 'clock-skip').details.toMin, 60);
  assert.equal(session.nextEventMin(s, refs, 50 * MIN), 75);
});

test('skip to next event: does nothing before start', () => {
  const ids = session.scenarioPatients(scenario).map((p) => p.id);
  const refs = collectEvents(ids, templatesById, scenario);
  const s = session.createSession(scenario, templatesById, catalogs);
  assert.equal(session.skipToNext(s, { now: 0, refs, templatesById, user: instructor }), s);
});

test('pause on close: pauses at the close time; respects pauseOnClose=false', () => {
  const { s } = startedSession();
  const paused = session.pauseForClose(s, { atWall: 10 * MIN, now: 30 * MIN });
  assert.equal(paused.clock.status, 'paused');
  assert.equal(session.simMinOf(paused, 99 * MIN), 10, 'time after the close does not count');
  assert.equal(paused.log.at(-1).details.reason, 'page-closed');
  const noPause = { ...s, settings: { ...s.settings, pauseOnClose: false } };
  assert.equal(session.pauseForClose(noPause, { atWall: 10 * MIN, now: 30 * MIN }), noPause);
  assert.equal(session.pauseForClose(paused, { atWall: 40 * MIN, now: 50 * MIN }), paused, 'already paused: no-op');
});
