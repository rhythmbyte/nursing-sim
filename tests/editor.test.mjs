import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, scenario, load } from './fixtures.mjs';
import { listChanges, changeToForm, formToChange, retimeChange, duplicateChange, deleteChange, clockToMin, minToClock } from '../js/screens/instructor/change-model.js';
import { validate } from '../js/validate.js';
import { eventGroupProblems } from '../js/engine/scheduler.js';

const schema = load('schemas/patient.schema.json');
const SC = scenario.startClock;
const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id ?? x.eventId, x]));
const norm = (t) => ({
  events: byId(t.events.map(({ group, ...e }) => e)), // group may be added to formerly ungrouped events
  keyframes: byId(t.vitals.keyframes || []), changes: byId(t.findings.changes || []), orders: byId(t.orders),
});

test('clock helpers', () => {
  assert.equal(clockToMin('07:00', '08:15'), 75);
  assert.equal(clockToMin('19:00', '01:30'), 390, 'overnight shift');
  assert.equal(minToClock('07:00', 75), '08:15');
});

test('every change in every starter patient round-trips through the builder unchanged', () => {
  for (const t of Object.values(templatesById)) {
    for (const c of listChanges(t)) {
      const f = changeToForm(t, c.key, SC);
      const { template } = formToChange(t, f, SC);
      assert.deepEqual(validate(template, schema), [], `${t.id} ${c.key}`);
      assert.deepEqual(eventGroupProblems(template.events), [], `${t.id} ${c.key} groups`);
      const a = norm(t); const b = norm(template);
      assert.deepEqual(Object.keys(b.events).sort(), Object.keys(a.events).sort(), `${t.id} ${c.key} event ids`);
      for (const id of Object.keys(a.events)) {
        const { review: _r1, ...x } = a.events[id]; const { review: _r2, ...y } = b.events[id];
        assert.deepEqual(y, x, `${t.id} event ${id}`);
      }
      assert.deepEqual(Object.keys(b.keyframes).sort(), Object.keys(a.keyframes).sort());
      for (const id of Object.keys(a.keyframes)) assert.deepEqual(b.keyframes[id].values, a.keyframes[id].values, `${t.id} keyframe ${id}`);
      assert.deepEqual(b.changes, a.changes, `${t.id} findings`);
      assert.deepEqual(Object.keys(b.orders).sort(), Object.keys(a.orders).sort(), `${t.id} orders`);
      for (const id of Object.keys(a.orders)) {
        assert.deepEqual([b.orders[id].text, b.orders[id].tier, b.orders[id].orderSet], [a.orders[id].text, a.orders[id].tier, a.orders[id].orderSet], `${t.id} order ${id}`);
      }
    }
  }
});

test('builder: new change creates linked events, keyframe, findings, order set, recognize notes', () => {
  const t = templatesById['p3-harold-thompson'];
  const f = { ...changeToForm(t, null, SC), time: '10:30', start: 'call-light', message: 'Harold says he feels short of breath.',
    vitals: { hr: '112', spo2: '88', rr: '26' }, findings: 'Crackles right base\nUsing accessory muscles',
    orders: [{ text: 'Chest x-ray now', type: 'once', tier: 1, interventionId: 'imaging-request' }], recognize: 'Recognize hypoxia' };
  const { template, key } = formToChange(t, f, SC);
  assert.deepEqual(validate(template, schema), []);
  const evs = template.events.filter((e) => e.group === key);
  assert.deepEqual(evs.map((e) => e.type).sort(), ['call-light', 'findings-change', 'new-orders', 'vitals-change']);
  assert.ok(evs.every((e) => e.atMin === 210));
  assert.equal(template.vitals.keyframes.at(-1).values.spo2, 88);
  assert.equal(template.orders.at(-1).tier, 1);
  assert.deepEqual(template.debrief.byChange[key], ['Recognize hypoxia']);
  const reopened = changeToForm(template, key, SC);
  assert.deepEqual([reopened.time, reopened.start, reopened.vitals.hr, reopened.orders.length], ['10:30', 'call-light', 112, 1]);
  const moved = retimeChange(template, key, 240);
  assert.ok(moved.events.filter((e) => e.group === key).every((e) => e.atMin === 240));
  assert.equal(moved.vitals.keyframes.find((k) => k.eventId === key).atMin, 240);
  const dup = duplicateChange(template, key, SC);
  assert.equal(dup.template.events.filter((e) => e.group === dup.key).length, 4);
  assert.notEqual(dup.key, key);
  assert.deepEqual(validate(dup.template, schema), []);
  const gone = deleteChange(template, key, SC);
  assert.equal(gone.events.length, t.events.length);
  assert.equal(gone.orders.length, t.orders.length);
});

test('B9: intervention search uses catalog synonyms; recent = last distinct for this user', async () => {
  const { searchInterventions, recentInterventions } = await import('../js/screens/chart/search.js');
  const { catalogs } = await import('./fixtures.mjs');
  const cat = catalogs.interventions;
  assert.equal(searchInterventions(cat, 'foley')[0].id, 'foley');
  assert.equal(searchInterventions(cat, 'indwelling')[0].id, 'foley');
  assert.equal(searchInterventions(cat, 'EKG')[0].id, 'ecg-12lead');
  assert.equal(searchInterventions(cat, 'fingerstick')[0].id, 'glucose-poc');
  assert.deepEqual(searchInterventions(cat, '   '), []);
  const log = ['vs-bp', 'foley', 'vs-bp', 'ecg-12lead'].map((id, i) => ({ userId: i === 1 ? 'student-2' : 'student-1', action: 'intervention', details: { interventionId: id } }));
  assert.deepEqual(recentInterventions(log, 'student-1', cat).map((i) => i.id), ['ecg-12lead', 'vs-bp']);
});

test('C16: shortcut keys map to actions; ignored while typing, in dialogs, or with modifiers', async () => {
  const { shortcutAction } = await import('../js/screens/instructor/shortcuts.js');
  const body = { tagName: 'BODY' };
  assert.equal(shortcutAction({ key: ' ', target: body }), 'toggle');
  assert.equal(shortcutAction({ key: 'n', target: body }), 'skip');
  assert.equal(shortcutAction({ key: 'N', target: body }), 'skip');
  assert.equal(shortcutAction({ key: '?', target: body }), 'help');
  assert.equal(shortcutAction({ key: ' ', target: { tagName: 'INPUT' } }), null);
  assert.equal(shortcutAction({ key: 'n', target: { tagName: 'TEXTAREA' } }), null);
  assert.equal(shortcutAction({ key: 'n', target: { tagName: 'DIV', isContentEditable: true } }), null);
  assert.equal(shortcutAction({ key: 'n', target: body, ctrlKey: true }), null);
  assert.equal(shortcutAction({ key: ' ', target: body }, { dialogOpen: true }), null);
  assert.equal(shortcutAction({ key: 'x', target: body }), null);
});

test('Suggestion 3: a silent rhythm-only change is a monitor-only event', async () => {
  const { catalogs } = await import('./fixtures.mjs');
  const { patientReferenceProblems } = await import('../js/engine/integrity.js');
  const t = templatesById['p2-margaret-wilson'];
  const blank = changeToForm(t, null, SC);
  assert.equal(blank.vitals.rhythm, '', 'rhythm field in the builder');
  const { template, key } = formToChange(t, { ...blank, time: '10:00', start: 'silent', message: '', vitals: { ...blank.vitals, rhythm: 'afib', hr: '128' } }, SC);
  const evs = template.events.filter((e) => e.group === key);
  assert.deepEqual(evs.map((e) => e.type), ['vitals-change'], 'no call light or message: monitor only');
  assert.deepEqual(template.vitals.keyframes.find((k) => k.eventId === key).values, { rhythm: 'afib', hr: 128 });
  assert.deepEqual(patientReferenceProblems(template, catalogs), []);
  assert.equal(changeToForm(template, key, SC).vitals.rhythm, 'afib', 'reopens with the rhythm');
});
