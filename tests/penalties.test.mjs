import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { limitOne, limitTarget, penaltyFor, strength, totalPercent, isRecovery } from '../js/engine/penalties.js';
import { addPenalty, setPenalty } from '../js/engine/reactions/control.js';
import { dryRun } from '../js/engine/reactions/dry-run.js';
import { penaltyPreview } from '../js/engine/reactions/describe.js';

const LG = 'p4-linda-garcia';
const linda = templatesById[LG];
const normal = catalogs.vitals.recovery.normal;
const INS = { userId: 'instructor', role: 'instructor' };
const S1 = { userId: 'student-1', role: 'student' };
const pen = (percent, caps = []) => ({ percent, caps, slow: 1 });

function live(extra = {}, tmpl = templatesById) {
  const scenario = scenarioWith(extra);
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), tmpl, scenario);
  const s = session.controlClock(session.createSession(scenario, tmpl, catalogs), 'start', { now: 0, user: INS });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById: tmpl, catalogs }).state;
  const ctx = (min, user = INS) => ({ now: min * MIN, user, templatesById: tmpl, catalogs, refs });
  return { s, tick, ctx };
}
const o2 = (s, L, min, lpm, device = 'NC') => chart.chartIntervention(s, LG, { interventionId: 'o2-apply', fields: { device, lpm: String(lpm) } }, { ...L.ctx(min), user: S1 });

test('percent and cap math; only recovery is limited; no penalty = full recovery', () => {
  assert.equal(limitOne('spo2', 70, 99, pen(20), normal), 93, '20% of the 70→99 range: ~93');
  assert.equal(limitOne('spo2', 70, 99, pen(0, [94]), normal), 94, 'cap');
  assert.equal(limitOne('spo2', 70, 99, pen(20, [92]), normal), 92, 'tightest wins');
  assert.equal(limitOne('hr', 140, 80, pen(20), normal), 92, 'downward recovery (HR) too');
  assert.equal(limitOne('spo2', 95, 85, pen(50), normal), 85, 'worsening is never limited');
  assert.equal(limitOne('spo2', 70, 99, pen(0), normal), 99, 'no penalty: full recovery');
  assert.ok(isRecovery('sbp', 80, 110, normal) && !isRecovery('sbp', 120, 130, normal));
  const out = limitTarget({ spo2: 70, bp: '78/40', rhythm: 'sinus' }, { spo2: 99, bp: '118/70', rhythm: 'sinus-tach' }, 10, { penalties: [{ percent: 20, slowFactor: 2 }], t: 0, maxPercent: 60, normal });
  assert.deepEqual(out.values, { spo2: 93, bp: '110/64', rhythm: 'sinus-tach' });
  assert.equal(out.overMin, 20, 'slower recovery');
  assert.deepEqual(limitTarget({ spo2: 70 }, { spo2: 99 }, 5, { penalties: [], t: 0, maxPercent: 60, normal }).values, { spo2: 99 });
});

test('stacking with a maximum, per-vital penalties, and wearing off', () => {
  const ps = [{ percent: 30 }, { percent: 30 }, { percent: 30, vitals: ['hr'] }];
  assert.equal(penaltyFor(ps, 'spo2', 0, 60).percent, 60);
  assert.equal(penaltyFor(ps, 'hr', 0, 60).percent, 60, 'capped at the maximum');
  assert.equal(penaltyFor(ps, 'spo2', 0, 100).percent, 60, 'per-vital: the hr one does not count for spo2');
  const w = { percent: 20, wearOffMin: 30, treatedAt: 10 };
  assert.deepEqual([strength(w, 10), strength(w, 25), strength(w, 40), strength({ ...w, treatedAt: null }, 99)], [1, 0.5, 0, 1]);
  assert.equal(totalPercent([w], 25, 60), 10);
});

test('Linda neglected: two penalties stack to 40%, RRT is called, and O₂ recovers her only partway', () => {
  const L = live();
  let s = L.tick(L.s, 84); // hypoxic at 65, crashing at 75 (SpO₂ → 76)
  const ps = () => s.patients[LG];
  assert.deepEqual(ps().penalties.map((p) => [p.label, p.earnedAt]), [['Hypoxic 5+ min before O₂', 70], ['Severe hypoxia 3+ min', 81]]);
  assert.ok(s.alerts.some((a) => /calling the rapid response team/.test(a.message)), 'penalty reached 40% → reaction');
  s = o2(s, L, 85, 6);
  s = L.tick(s, 86);
  assert.equal(ps().script.state, 'in-target');
  assert.equal(ps().vitalsTrend.to.spo2, 84, '76 → 90 with 40% off: ~84');
  assert.equal(ps().vitalsTrend.toMin - 85, 7.5, '1.5× slower');
  const limited = s.log.find((l) => l.action === 'recovery-limited');
  assert.deepEqual(limited.details.limited.find((x) => x.k === 'spo2'), { k: 'spo2', target: 90, effective: 84 });
  s = L.tick(s, 130);
  assert.ok(ps().vitals.spo2 > 84, 'the 30-min penalty wears off after treatment: she keeps improving');
  assert.ok(s.log.some((l) => l.action === 'penalty-worn-off'));
  assert.ok(ps().vitals.spo2 <= 92, 'the permanent cap stays');
});

test('treated in time: no penalty, full recovery; penalties can be switched off per sim', () => {
  const L = live();
  let s = L.tick(L.s, 61);
  s = o2(s, L, 62, 6);
  s = L.tick(s, 70);
  assert.deepEqual([s.patients[LG].penalties.length, s.patients[LG].vitals.spo2], [0, 90]);
  const off = live({ recoveryPenalties: false });
  let t = off.tick(off.s, 84);
  assert.equal(t.patients[LG].penalties.length, 0);
  assert.ok(t.log.some((l) => l.action === 'penalty-skipped'));
  t = o2(t, off, 85, 6); t = off.tick(t, 95);
  assert.equal(t.patients[LG].vitals.spo2, 90);
});

test('instructor adds, reduces and clears penalties (logged); clearing lets the patient recover fully', () => {
  const L = live();
  let s = L.tick(L.s, 61);
  s = addPenalty(s, LG, { percent: 50, vitals: ['spo2'] }, L.ctx(62));
  s = o2(s, L, 63, 6);
  s = L.tick(s, 70);
  const partial = s.patients[LG].vitals.spo2;
  assert.ok(partial > 86 && partial < 90, `50% off: partway to 90 (got ${partial})`);
  const id = s.patients[LG].penalties[0].id;
  s = setPenalty(s, LG, id, 10, L.ctx(71));
  s = setPenalty(s, LG, null, null, L.ctx(72));
  assert.equal(s.patients[LG].vitals.spo2, 90, 'cleared: full target');
  assert.deepEqual(s.log.filter((l) => l.role === 'instructor' && l.action.startsWith('penalty')).map((l) => l.action), ['penalty-earned', 'penalty-changed', 'penalty-cleared']);
});

test('dry run with and without penalties, and the editor preview', () => {
  const steps = [{ kind: 'wait', min: 84 }, { kind: 'chart', interventionId: 'o2-apply', fields: { device: 'NC', lpm: '6' } }, { kind: 'wait', min: 10 }];
  const withP = dryRun(linda, { catalogs, settings: scenarioWith().settings, steps });
  const without = dryRun(linda, { catalogs, settings: { ...scenarioWith().settings, recoveryPenalties: false }, steps });
  assert.ok(withP.at(-1).vitals.spo2 < without.at(-1).vitals.spo2);
  assert.equal(without.at(-1).vitals.spo2, 90);
  const r = linda.script.reactions.find((x) => x.id === 'r-p4-penalty-hypoxia');
  assert.match(penaltyPreview(r.when, r.then[0], linda, limitOne, normal), /^If spo2 <= 82 for 5\+ min: recovery reduced 20% .*Example: spo2 target 96 from 82 → ~93 instead of 96\./);
});
