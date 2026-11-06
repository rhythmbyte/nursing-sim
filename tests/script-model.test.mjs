import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs } from './fixtures.mjs';
import { patientReferenceProblems } from '../js/engine/integrity.js';
import {
  stateToForm, formToState, renameState, deleteState, duplicateState, stateUsedBy,
  reactionToForm, formToReaction, duplicateReaction, deleteReaction, applyTemplate, templateFrom, withScript,
} from '../js/screens/instructor/script-model.js';

const linda = templatesById['p4-linda-garcia'];
const robert = templatesById['p1-robert-miller'];
const clean = (t) => assert.deepEqual(patientReferenceProblems(t, catalogs), []);

test('every starter state and reaction round-trips through the form unchanged', () => {
  for (const s of linda.script.states) {
    const t = formToState(linda, stateToForm(linda, s.id), s.id);
    assert.deepEqual(t.script.states.find((x) => x.id === s.id), s, s.id);
    assert.deepEqual(t.findings, linda.findings, `${s.id}: findings changes untouched`);
  }
  for (const r of linda.script.reactions) {
    const t = formToReaction(linda, reactionToForm(linda, r.id), r.id);
    assert.deepEqual(t.script.reactions.find((x) => x.id === r.id), r, r.id);
  }
});

test('new state from the form: id from the label, vitals typed, findings become a findings change', () => {
  const t = formToState(linda, { label: 'Very drowsy (CO₂ retention)', values: { spo2: '97', rr: '12', bp: '' }, overMin: '10', rhythm: '', findingsText: 'Hard to wake\nHeadache', note: 'Too much O₂' });
  const s = t.script.states.at(-1);
  assert.deepEqual([s.id, s.vitals, s.findings, s.note], ['very-drowsy-co-retention', { values: { spo2: 97, rr: 12 }, overMin: 10 }, 'state-very-drowsy-co-retention', 'Too much O₂']);
  assert.deepEqual(t.findings.changes.at(-1).findings, ['Hard to wake', 'Headache']);
  assert.throws(() => formToState(t, { id: 'hypoxic', label: 'dup' }), /already a state "hypoxic"/);
  clean(t);
});

test('renaming, deleting and duplicating states keeps references valid', () => {
  const t = formToState(linda, { ...stateToForm(linda, 'hypoxic'), id: 'very-hypoxic' }, 'hypoxic');
  assert.equal(t.script.reactions.find((r) => r.id === 'r-p4-no-o2').then[0].to, 'very-hypoxic');
  assert.equal(t.script.reactions.find((r) => r.id === 'r-p4-no-response').when.state, 'very-hypoxic');
  clean(t);
  assert.throws(() => deleteState(linda, 'hypoxic'), /Used by r-p4-no-o2, r-p4-no-response/);
  assert.throws(() => deleteState(linda, 'baseline'), /starting state/);
  assert.deepEqual(stateUsedBy(linda, 'crashing'), ['r-p4-no-response']);
  const d = duplicateState(linda, 'crashing');
  assert.equal(d.id, 'crashing-copy');
  assert.notEqual(d.template.script.states.find((s) => s.id === 'crashing-copy').findings, 'state-p4-crashing', 'own findings change');
  clean(d.template);
  clean(deleteState(d.template, 'crashing-copy'));
  assert.equal(renameState(linda, 'baseline', 'start').script.initialState, 'start');
});

test('reaction form: When/If/Then with OR fields, without-lists, effects; readable errors', () => {
  const form = reactionToForm(linda, null);
  Object.assign(form, { label: 'Bolus helps', when: { ...form.when, kind: 'intervention', interventionId: 'iv-fluids', where: { mode: 'any', rows: [{ field: 'volumeMl', min: '500', max: '', matches: '', excludes: '' }] } },
    cond: { ...form.cond, inState: ['crashing'], done: ['intervention:rapid-response'] },
    then: [{ type: 'vitals', values: { bp: '96/58', hr: '120' }, overMin: '5' }, { type: 'findings', findingsText: 'Warmer hands' }, { type: 'event', eventType: 'staff-message', payload: { from: 'RT', message: 'Looks a bit better' } }] });
  const t = formToReaction(linda, form);
  const r = t.script.reactions.at(-1);
  assert.deepEqual(r.when, { kind: 'intervention', interventionId: 'iv-fluids', where: [{ volumeMl: { min: 500 } }] });
  assert.deepEqual(r.if, { inState: ['crashing'], done: [{ kind: 'intervention', interventionId: 'rapid-response' }] });
  assert.deepEqual(r.then[0], { type: 'vitals', values: { bp: '96/58', hr: 120 }, overMin: 5 });
  assert.equal(r.then[1].change, 'r-bolus-helps-findings');
  assert.deepEqual(r.then[2].event, { type: 'staff-message', payload: { from: 'RT', message: 'Looks a bit better' } });
  clean(t);
  const bad = reactionToForm(linda, null);
  assert.throws(() => formToReaction(linda, { ...bad, then: [{ type: 'state', to: 'hypoxic' }] }), /Pick the intervention/);
  assert.throws(() => formToReaction(linda, { ...bad, when: { ...bad.when, interventionId: 'o2-apply' } }), /at least one "Then"/);
  assert.throws(() => formToReaction(linda, { ...bad, when: { ...bad.when, kind: 'elapsed', since: 'state', state: '' }, then: [{ type: 'state', to: 'hypoxic' }] }), /state the countdown starts in/);
});

test('duplicate and delete reactions; chained reactions are protected', () => {
  const d = duplicateReaction(linda, 'r-p4-o2-low');
  assert.equal(d.id, 'r-p4-o2-low-copy');
  clean(d.template);
  assert.throws(() => deleteReaction(linda, 'r-p4-no-response'), /r-p4-crash-light start\(s\) from this reaction/);
  clean(deleteReaction(linda, 'r-p4-crash-light'));
});

test('templates: apply renames clashing ids; a template saved from Linda applies cleanly to Robert', () => {
  const o2 = catalogs.reactionTemplates.templates.find((x) => x.id === 'o2-response');
  const once = applyTemplate(robert, o2);
  clean(once.template);
  const twice = applyTemplate(once.template, o2);
  assert.deepEqual(twice.states, ['o2-partial-2', 'o2-good-2']);
  assert.deepEqual(twice.template.script.reactions.find((r) => r.id === 'r-o2-low-2').then[0].to, 'o2-partial-2');
  clean(twice.template);
  assert.equal(withScript(robert).script.initialState, 'baseline', 'a patient without a script gets a baseline start');
  const tpl = templateFrom(linda, ['r-p4-no-o2', 'r-p4-o2-low'], { label: 'Hypoxia countdown' });
  assert.deepEqual(tpl.states.map((s) => s.id), ['low-flow', 'hypoxic']);
  assert.ok(tpl.states.find((s) => s.id === 'hypoxic').findingsText.length, 'findings travel as text');
  const onRobert = applyTemplate(robert, { ...tpl, states: [...tpl.states, { id: 'desaturating', label: 'Desaturating' }] }).template;
  clean(onRobert);
});

test('state diagram layout: columns by distance from the start; arrows from inState or the countdown state', async () => {
  const { diagramLayout } = await import('../js/screens/instructor/script-diagram.js');
  const L = diagramLayout(linda.script);
  assert.equal(L.pos.baseline.col, 0);
  assert.equal(L.pos.desaturating.col, 1);
  assert.equal(L.pos.hypoxic.col, 2, 'reached from desaturating by the 5-min countdown');
  assert.equal(L.pos.crashing.col, 3);
  assert.ok(L.edges.some((e) => e.from === 'desaturating' && e.to === 'hypoxic' && e.reactionId === 'r-p4-no-o2'));
  assert.ok(L.hasAny, 'O₂ reactions use notInState, so they come from "any state"');
  assert.deepEqual(L.other, ['r-p4-spo2-82', 'r-p4-crash-light']);
});
