import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as GM from '../js/screens/instructor/guided-model.js';
import { geToLiveCalls } from '../js/screens/instructor/guided-live.js';
import { instantiate } from '../js/engine/cases.js';

const G = { ...GM, geToLiveCalls };
import { changeToForm, formToChange } from '../js/screens/instructor/change-model.js';
import { projectedVitals, stateVitals } from '../js/engine/reactions/dry-run.js';
import { normalFor } from '../js/engine/penalties.js';
import { setVitalsTarget } from '../js/engine/vitals-control.js';
import { patientReferenceProblems } from '../js/engine/integrity.js';

const linda = templatesById['p4-linda-garcia'];
const robert = templatesById['p1-robert-miller'];
const normal = normalFor(linda, catalogs);
const settings = scenarioWith().settings;

test('durations, direction, O₂ text and the plain-English preview', () => {
  assert.equal(G.overToMin(90, 'seconds'), 1.5);
  assert.equal(G.overToMin(2, 'hours'), 120);
  assert.equal(G.overToMin(5, 'instant'), 0);
  assert.deepEqual([G.minToOver(0), G.minToOver(0.5), G.minToOver(120), G.minToOver(5)], [{ overN: '', overUnit: 'instant' }, { overN: 30, overUnit: 'seconds' }, { overN: 2, overUnit: 'hours' }, { overN: 5, overUnit: 'minutes' }]);
  assert.equal(G.directionOf('spo2', 91, 82, normal), 'worsen');
  assert.equal(G.directionOf('spo2', 96, 90, normal), 'improve', "Linda's COPD range 88–92");
  assert.deepEqual(G.parseO2('4 L NC'), { device: 'NC', lpm: 4 });
  assert.equal(G.rowText({ vital: 'spo2', direction: 'worsen', from: 91, to: 82, overN: 5, overUnit: 'minutes' }, normal), 'SpO₂ worsens from 91% to 82% over 5 minutes.');
  assert.match(G.rowText({ vital: 'spo2', direction: 'improve', from: 91, to: 82, overN: '', overUnit: 'instant' }, normal), /instantly\. \(note: that moves away from normal\)/);
});

test('rows ⇄ values: BP halves combine, pain and O₂ text, per-vital durations', () => {
  const rows = [{ vital: 'sbp', to: 88, overN: 10, overUnit: 'minutes' }, { vital: 'spo2', to: 85, overN: 5, overUnit: 'minutes' }, { vital: 'pain', to: 7, overUnit: 'instant' }, { vital: 'o2', to: 'NRB', lpm: 15 }];
  const v = G.rowsToValues(rows, { bp: '102/64' });
  assert.deepEqual(v.values, { bp: '88/64', spo2: 85, pain: '7/10', o2: '15 L NRB' });
  assert.deepEqual(v.overMinBy, { bp: 10, spo2: 5, pain: 0, o2: 0 });
  const back = G.valuesToRows(v.values, v.overMin, v.overMinBy, { bp: '102/64', spo2: 91, pain: '2/10', o2: '2 L NC' }, normal);
  assert.deepEqual(back.map((r) => [r.vital, r.to, r.from, r.overN, r.overUnit]).sort(), [['dbp', 64, 64, 10, 'minutes'], ['o2', 'NRB', '2 L NC', '', 'instant'], ['pain', 7, 2, '', 'instant'], ['sbp', 88, 102, 10, 'minutes'], ['spo2', 85, 91, 5, 'minutes']]);
  assert.deepEqual(G.rowsToValues(G.valuesToRows({ pain: '7/10 radiating to L arm' }, 0)).values, { pain: '7/10 radiating to L arm' }, 'pain text kept');
});

test('engine: per-vital trend durations', () => {
  const ps = { vitals: { spo2: 90, hr: 100 }, vitalsHistory: [] };
  setVitalsTarget(ps, { spo2: 80, hr: 140 }, 0, 0, { spo2: 10, hr: 2 });
  assert.deepEqual([ps.vitalsTrend.toMin, ps.vitalsTrend.toMinBy], [10, { spo2: 10, hr: 2 }]);
});

test('every starter reaction effect round-trips through the guided form', () => {
  for (const t of Object.values(templatesById)) for (const r of t.script?.reactions || []) for (const e of r.then) {
    const from = stateVitals(t, r.if?.inState?.[0] || r.when.state);
    const ge = G.effectToGe(e, from, normalFor(t, catalogs));
    const back = G.geToEffects(ge, from)[0];
    if (e.type === 'findings') continue;
    assert.deepEqual(back, e, `${t.id} ${r.id}`);
  }
});

test('scenario changes: guided list ⇄ change form keeps every starter change identical', () => {
  for (const t of Object.values(templatesById)) {
    const keys = [...new Set(t.events.map((e) => e.group || e.id))];
    for (const key of keys) {
      const f = changeToForm(t, key, '07:00');
      const back = G.gesToChangeForm(G.changeFormToGes(f, t.vitals.baseline, normalFor(t, catalogs)), f, t.vitals.baseline);
      const a = formToChange(t, f, '07:00').template; const b = formToChange(t, back, '07:00').template;
      assert.deepEqual(b.events, a.events, `${t.id} ${key} events`);
      assert.deepEqual(b.vitals, a.vitals, `${t.id} ${key} keyframes`);
    }
  }
});

test('a new guided scenario change: trend keyframe, rhythm, code with outcome, state change; integrity clean', () => {
  const f = changeToForm(linda, null, '07:00');
  const ges = [{ type: 'staff-message', from: 'CNA', message: 'She looks gray' }, { type: 'vitals', rows: [{ vital: 'spo2', to: 80, overN: 3, overUnit: 'minutes' }, { vital: 'hr', to: 130, overUnit: 'instant' }] },
    { type: 'rhythm', rhythm: 'sinus-tach' }, { type: 'state', to: 'crashing' }, { type: 'code', rhythm: 'pea', outcome: 'survive', roscRhythm: 'sinus-tach', message: '' }];
  const out = formToChange(linda, G.gesToChangeForm(ges, { ...f, time: '09:30' }, linda.vitals.baseline), '07:00').template;
  clean(out);
  const kf = out.vitals.keyframes.at(-1);
  assert.deepEqual([kf.values.spo2, kf.values.rhythm, kf.overMin, kf.overMinBy], [80, 'sinus-tach', 3, { spo2: 3, hr: 0 }]);
  const evs = out.events.filter((e) => e.atMin === 150);
  assert.deepEqual(evs.map((e) => e.type).sort(), ['code', 'script-state', 'staff-message', 'vitals-change']);
  assert.deepEqual(evs.find((e) => e.type === 'code').payload, { rhythm: 'pea', outcome: 'survive', roscRhythm: 'sinus-tach' });
});
function clean(t) { assert.deepEqual(patientReferenceProblems(t, catalogs), []); }

test('From auto-fill: projected vitals at a minute; Live calls', () => {
  const at65 = projectedVitals(linda, { catalogs, settings, atMin: 65 });
  assert.equal(at65.spo2, 82, 'by 08:05 untreated Linda is hypoxic');
  assert.equal(projectedVitals(linda, { catalogs, settings, atMin: 65, excludeGroup: 'p4-worsens' }).spo2, 91, 'without the 08:00 change she stays at baseline');
  assert.equal(stateVitals(linda, 'hypoxic').spo2, 82);
  assert.deepEqual(G.geToLiveCalls({ type: 'staff-message', from: 'Family', message: 'Help' }), [{ method: 'liveEvent', args: [{ type: 'staff-message', payload: { from: 'Family', message: 'Help' } }] }]);
  assert.equal(G.geToLiveCalls({ type: 'vitals', rows: [{ vital: 'spo2', to: 85, overN: 2, overUnit: 'minutes' }] })[0].args[0].overMin, 2);
  assert.throws(() => G.geToLiveCalls({ type: 'rhythm' }), /Pick a rhythm/);
});

test('Command center shows script state and penalty; diagram uses short labels', async () => {
  const { commandCenter } = await import('../js/engine/command-center.js');
  const session = await import('../js/engine/session.js');
  const { collectEvents } = await import('../js/engine/scheduler.js');
  const { diagramLayout } = await import('../js/screens/instructor/script-diagram.js');
  const scenario = scenarioWith();
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  let s = session.controlClock(session.createSession(scenario, templatesById, catalogs), 'start', { now: 0, user: { userId: 'i', role: 'instructor' } });
  s = session.tick(s, { now: 84 * MIN, refs, templatesById, catalogs }).state;
  const ctx = { templatesById, catalogs, simMin: 84, studentIdsForGroup: () => [], groupOfStudent: () => null };
  const p = commandCenter(s, ctx, scenario).flatMap((g) => g.patients).find((x) => x.patientId === 'p4-linda-garcia');
  assert.deepEqual([p.script.state, p.script.penalty], ['crashing', 40]);
  assert.equal(commandCenter(s, ctx, scenario).flatMap((g) => g.patients).find((x) => x.patientId === 'p1-robert-miller').script, null);
  assert.ok(diagramLayout(linda.script).edges.length, 'layout unaffected by short labels');
});

test('relative to baseline: guided rows ⇄ valuesRel on reactions, states and scenario changes; each variant resolves its own', () => {
  const rows = [{ vital: 'sbp', direction: 'rel', to: '-30', overN: 5, overUnit: 'minutes' }, { vital: 'hr', direction: 'rel', to: '20', overN: 5, overUnit: 'minutes' }, { vital: 'spo2', direction: 'worsen', from: 91, to: 85, overN: 5, overUnit: 'minutes' }];
  const [e] = G.geToEffects({ type: 'vitals', rows });
  assert.deepEqual(e.valuesRel, { sbp: -30, hr: 20 });
  assert.deepEqual(e.values, { spo2: 85 });
  assert.equal(e.overMin, 5);
  const back = G.effectToGe(e, {}, {});
  assert.deepEqual(back.rows.filter((r) => r.direction === 'rel').map((r) => [r.vital, Number(r.to)]), [['sbp', -30], ['hr', 20]]);
  assert.match(G.rowText(rows[0]), /changes by -30 mmHg from this patient's baseline/);
  assert.deepEqual(G.gesToState([{ type: 'vitals', rows }]).vitals.valuesRel, { sbp: -30, hr: 20 });
  // Scenario change: keyframe gets valuesRel; instantiating resolves it against each variant's baseline.
  const linda = structuredClone(templatesById['p4-linda-garcia']);
  const key = 'p4-worsens';
  const f = changeToForm(linda, key, '07:00');
  const f2 = G.gesToChangeForm([{ type: 'vitals', rows: [{ vital: 'sbp', direction: 'rel', to: '-20', overN: 0, overUnit: 'instant' }] }], f);
  assert.deepEqual(f2.vitalsRel, { sbp: -20 });
  const t2 = formToChange(linda, f2, '07:00').template;
  const kf = t2.vitals.keyframes.find((k) => k.eventId === 'e-p4-worsens');
  assert.deepEqual(kf.valuesRel, { sbp: -20 });
  t2.case = { title: 'Sepsis 1', sex: 'either', ageRange: [60, 66] };
  t2.vitals.ranges = { sbp: [98, 106] };
  for (let i = 0; i < 5; i++) {
    const v = instantiate(t2, { seed: `g${i}`, catalogs });
    const sb = Number(v.vitals.baseline.bp.split('/')[0]);
    assert.equal(Number(v.vitals.keyframes.find((k) => k.eventId === 'e-p4-worsens').values.bp.split('/')[0]), sb - 20);
  }
});
