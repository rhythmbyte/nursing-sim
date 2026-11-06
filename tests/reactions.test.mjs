import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { adjustVitals } from '../js/engine/vitals-control.js';
import { dryRun } from '../js/engine/reactions/dry-run.js';
import { forceState, fireReactionNow, setReactionEnabled, skipArmed, setScriptPaused } from '../js/engine/reactions/control.js';
import { armedTimers } from '../js/engine/reactions.js';
import { fieldTest, whereMatches, crossed } from '../js/engine/reactions/match.js';
import { patientReferenceProblems } from '../js/engine/integrity.js';
import { reactionText, names } from '../js/engine/reactions/describe.js';

const LG = 'p4-linda-garcia';
const linda = templatesById[LG];
const settings = scenarioWith().settings;
const S1 = { userId: 'student-1', role: 'student' };
const INS = { userId: 'instructor', role: 'instructor' };
const run = (steps, t = linda, s = settings) => dryRun(t, { catalogs, settings: s, steps });
const o2 = (lpm, device = 'NC') => ({ kind: 'chart', interventionId: 'o2-apply', fields: { device, lpm: String(lpm) } });
const wait = (min) => ({ kind: 'wait', min });

/** A copy of Linda with a different script (keeps her events and orders). */
const withScript = (script) => ({ ...structuredClone(linda), script });

function live(extra = {}) {
  const scenario = scenarioWith(extra);
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  let s = session.controlClock(session.createSession(scenario, templatesById, catalogs), 'start', { now: 0, user: INS });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById, catalogs }).state;
  const ctx = (min, user = INS) => ({ now: min * MIN, user, templatesById, catalogs, refs });
  return { s, tick, ctx };
}

test('field tests and where (AND within, OR across a list)', () => {
  assert.ok(fieldTest('2', { min: 1, max: 4 }));
  assert.ok(fieldTest('10 L', { min: 10 }));
  assert.ok(!fieldTest('', { min: 1 }));
  assert.ok(fieldTest('Non-rebreather', { matches: ['NRB', 'non-rebreather'] }));
  assert.ok(!fieldTest('NRB 15', { excludes: ['nrb'] }));
  assert.ok(whereMatches({ lpm: '3', device: 'NC' }, { lpm: { min: 1, max: 4 }, device: { excludes: ['NRB'] } }));
  assert.ok(whereMatches({ lpm: '4', device: 'NRB' }, [{ lpm: { min: 10 } }, { device: { matches: ['NRB'] } }]));
  assert.ok(crossed({ spo2: 84 }, { spo2: 82 }, { field: 'spo2', op: '<=', value: 82 }));
  assert.ok(!crossed({ spo2: 82 }, { spo2: 80 }, { field: 'spo2', op: '<=', value: 82 }), 'already below: not a new crossing');
  assert.ok(crossed({ bp: '95/60' }, { bp: '88/50' }, { field: 'sbp', op: '<', value: 90 }));
});

test('Linda: no O2 → hypoxic at 5 min (SpO2 82, RR 32) → crashing 10 min later; CNA message and call light chain', () => {
  const f = run([wait(60), wait(5), wait(10)]);
  assert.equal(f[1].state, 'desaturating');
  assert.deepEqual(f[1].transitions.map((x) => x.cause.kind), ['event'], 'the 08:00 worsening event started it');
  assert.equal(f[2].state, 'hypoxic');
  assert.deepEqual([f[2].vitals.spo2, f[2].vitals.rr], [82, 32]);
  assert.equal(f[2].transitions[0].cause.kind, 'timeout');
  assert.ok(f[2].alerts.some((a) => /sat just dropped to 82%/.test(a)), 'threshold SpO2 ≤ 82 → CNA message');
  assert.equal(f[3].state, 'crashing');
  assert.equal(f[3].transitions[0].cause.kind, 'timeout');
  assert.ok(f[3].fired.some((x) => x.reactionId === 'r-p4-crash-light' && x.cause.kind === 'chain'));
  assert.ok(f[3].alerts.some((a) => /isn't making sense/.test(a)), 'call light from the chained reaction');
});

test('Linda: O2 responses by flow and device; O2 cancels the hypoxia countdown', () => {
  const f = run([wait(61), o2(2), wait(5), o2(6), wait(5), o2(4, 'NRB'), wait(6), o2(12)]);
  assert.equal(f[2].state, 'low-flow');
  assert.equal(f[3].vitals.spo2, 86, '2 L → about 86%');
  assert.notEqual(f[3].state, 'hypoxic', 'charted O2 within 5 min');
  assert.equal(f[4].state, 'in-target');
  assert.equal(f[5].vitals.spo2, 90);
  assert.equal(f[6].state, 'over-oxygenated', 'NRB at any flow');
  assert.equal(f[7].vitals.spo2, 96, 'above the COPD target, so it shows in the debrief');
  assert.equal(f[8].fired.length, 0, 'already over-oxygenated: 12 L does not re-fire');
});

/** A live session where Linda has `script` instead of her own. */
function liveWith(script) {
  const tmpl = { ...templatesById, [LG]: withScript(script) };
  const scenario = scenarioWith();
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), tmpl, scenario);
  const s = session.controlClock(session.createSession(scenario, tmpl, catalogs), 'start', { now: 0, user: INS });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById: tmpl, catalogs }).state;
  return { s, tick, ctx: (min) => ({ now: min * MIN, user: INS, templatesById: tmpl, catalogs, refs }) };
}
const A = { initialState: 'a', states: [{ id: 'a', label: 'A' }] };

test('repeat, maxFires and threshold crossings on the way down', () => {
  const L = liveWith({ ...A, reactions: [{ id: 'r-low', when: { kind: 'vitals', field: 'spo2', op: '<', value: 88 }, then: [{ type: 'event', event: { type: 'staff-message', payload: { message: 'low' } } }], repeat: true, maxFires: 2 }] });
  let s = L.s;
  for (const [min, spo2] of [[1, 85], [2, 84], [3, 92], [4, 80], [5, 95], [6, 80]]) s = L.tick(adjustVitals(s, LG, { values: { spo2 } }, { now: min * MIN, user: INS }), min);
  assert.deepEqual(s.log.filter((l) => l.action === 'reaction-fired').map((l) => l.simMin), [1, 4], 'down-crossings only, at most maxFires');
});

test('loop protection: no same-instant cycles, and a per-instant cap', () => {
  const hr = (v) => [{ type: 'vitals', values: { hr: v } }];
  const L = liveWith({ ...A, reactions: [
    { id: 'r-a', when: { kind: 'fired', reactionId: 'r-b' }, then: hr(90), repeat: true },
    { id: 'r-b', when: { kind: 'fired', reactionId: 'r-a' }, then: hr(95), repeat: true },
  ] });
  let s = fireReactionNow(L.s, LG, 'r-a', L.ctx(1));
  s = L.tick(s, 2);
  assert.deepEqual(s.log.filter((l) => l.action === 'reaction-fired').map((l) => l.details.reactionId), ['r-a', 'r-b'], 'r-a does not fire again at the same instant');
  const chain = Array.from({ length: 6 }, (_, i) => ({ id: `r-${i}`, when: i ? { kind: 'fired', reactionId: `r-${i - 1}` } : { kind: 'elapsed', since: 'start', afterMin: 1 }, then: hr(80 + i) }));
  const f = run([wait(2)], withScript({ ...A, reactions: chain }), { ...settings, reactionMaxPerInstant: 3 });
  assert.equal(f[1].fired.length, 3);
  assert.ok(f[1].alerts.some((x) => /Reaction loop stopped/.test(x)));
});

test('integrity: broken script references are named clearly', () => {
  const bad = withScript({ initialState: 'nope', states: [{ id: 'a', label: 'A', findings: 'missing-change', rhythm: 'zigzag' }, { id: 'a', label: 'dup' }], reactions: [
    { id: 'r-1', when: { kind: 'intervention', interventionId: 'o2-apply', where: { flow: { min: 1 } } }, if: { inState: ['ghost'] }, then: [{ type: 'state', to: 'ghost2' }] },
    { id: 'r-2', when: { kind: 'elapsed', since: 'event', eventId: 'e-none', afterMin: 5, without: [{ kind: 'intervention', interventionId: 'fly' }] }, then: [{ type: 'fire', eventId: 'e-gone' }] },
    { id: 'r-3', when: { kind: 'fired', reactionId: 'r-3' }, then: [{ type: 'event', event: { type: 'new-orders', payload: { orderSet: 'os-none' } } }] },
    { id: 'r-4', when: { kind: 'med', orderId: 'o-p4-vs' }, then: [] },
  ] });
  const p = patientReferenceProblems(bad, catalogs).join('\n');
  for (const re of [/initialState: no state "nope"/, /state "a" is defined twice/, /no finding change "missing-change"/, /rhythm: "zigzag"/, /has no field "flow"/, /if.inState: no state "ghost"/,
    /then\[0\]: no state "ghost2"/, /no event "e-none"/, /intervention "fly"/, /no event "e-gone"/, /can't be triggered by itself/, /order set "os-none"/, /"o-p4-vs" is not a med order/, /needs at least one effect/]) {
    assert.match(p, re);
  }
  assert.deepEqual(patientReferenceProblems(linda, catalogs), [], 'starter script is clean');
});

test('instructor overrides: force state, fire now, disable, skip, pause/resume; all logged', () => {
  const L = live();
  let s = L.tick(L.s, 61); // desaturating since 60
  const sc = () => s.patients[LG].script;
  assert.equal(sc().state, 'desaturating');
  assert.deepEqual(armedTimers(sc(), linda, s.settings).map((a) => [a.reaction.id, a.deadline]), [['r-p4-no-o2', 65]]);
  s = skipArmed(s, LG, 'r-p4-no-o2', L.ctx(62));
  s = L.tick(s, 70);
  assert.equal(sc().state, 'desaturating', 'skipped countdown does not fire');
  s = forceState(s, LG, 'hypoxic', L.ctx(70));
  assert.equal(s.patients[LG].vitals.spo2, 82);
  s = setScriptPaused(s, LG, true, L.ctx(71));
  s = L.tick(s, 90);
  assert.equal(sc().state, 'hypoxic', 'paused: the 10-min countdown does nothing');
  s = setScriptPaused(s, LG, false, L.ctx(90));
  assert.deepEqual(armedTimers(sc(), linda, s.settings).map((a) => a.deadline), [100], 'resuming restarts countdowns');
  s = setReactionEnabled(s, LG, 'r-p4-no-response', false, L.ctx(91));
  s = L.tick(s, 105);
  assert.equal(sc().state, 'hypoxic', 'disabled');
  s = fireReactionNow(s, LG, 'r-p4-no-response', L.ctx(106));
  assert.equal(sc().state, 'crashing');
  s = L.tick(s, 107);
  const acts = s.log.filter((l) => l.patientId === LG && l.role === 'instructor').map((l) => l.action);
  assert.deepEqual(acts, ['reaction-skipped', 'script-state', 'script-paused', 'script-resumed', 'reaction-disabled', 'reaction-fired', 'script-state']);
  assert.ok(s.log.some((l) => l.action === 'reaction-fired' && l.details.reactionId === 'r-p4-crash-light'), 'instructor fire still chains');
});

test('scriptedVitalsAfterInstructor: skip keeps the instructor in control; apply lets the script take over', () => {
  for (const mode of ['skip', 'apply']) {
    const L = live({ scriptedVitalsAfterInstructor: mode });
    let s = L.tick(L.s, 61);
    s = adjustVitals(s, LG, { values: { spo2: 93 } }, { now: 62 * MIN, user: INS });
    s = L.tick(s, 66); // timeout → hypoxic (SpO2 82)
    assert.equal(s.patients[LG].script.state, 'hypoxic', `${mode}: state still changes`);
    if (mode === 'skip') {
      assert.equal(s.patients[LG].vitals.spo2, 93);
      assert.ok(s.log.some((l) => l.action === 'script-vitals-skipped'));
    } else {
      assert.equal(s.patients[LG].vitals.spo2, 82);
      assert.equal(s.patients[LG].vitalsOverride, false);
    }
  }
});

test('reactions answer charting while the clock is paused', () => {
  const L = live();
  let s = L.tick(L.s, 61);
  s = session.controlClock(s, 'pause', { now: 62 * MIN, user: INS });
  s = chart.chartIntervention(s, LG, { interventionId: 'o2-apply', fields: { device: 'NC', lpm: '6' } }, { ...L.ctx(70), user: S1 });
  s = L.tick(s, 70);
  assert.equal(s.patients[LG].script.state, 'in-target');
});

test('plain-language text for the builder and Live control', () => {
  const n = names(linda, catalogs);
  const txt = (id) => reactionText(linda.script.reactions.find((r) => r.id === id), n);
  assert.match(txt('r-p4-no-o2'), /When 5 min in "Desaturating \(SpO₂ falling\)" without Apply \/ titrate oxygen · then → "Hypoxic/);
  assert.match(txt('r-p4-o2-high'), /lpm ≥ 10 or device contains NRB or non-rebreather/);
});
