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
