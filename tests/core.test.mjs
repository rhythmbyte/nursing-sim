import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatShiftTime } from '../js/engine/time.js';
import { countNeedsReview, needsReview } from '../js/review.js';
import { createStore } from '../js/state.js';

test('formatShiftTime converts atMin to shift clock', () => {
  assert.equal(formatShiftTime('07:00', 0), '07:00');
  assert.equal(formatShiftTime('07:00', 75), '08:15');
  assert.equal(formatShiftTime('23:30', 45), '00:15');
});

test('countNeedsReview counts proposed and partial at any depth', () => {
  const p = { review: 'partial', orders: [{ review: 'proposed' }, { review: 'approved' }], handoff: { review: 'proposed' } };
  assert.equal(countNeedsReview(p), 3);
  assert.equal(needsReview({ review: 'approved' }), false);
  assert.equal(needsReview(null), false);
});

test('store merges patches, notifies subscribers, and routes named events', () => {
  const store = createStore({ a: 1 });
  const seen = [];
  const unsub = store.subscribe((s) => seen.push(s.b));
  store.set({ b: 2 });
  unsub();
  store.set({ b: 3 });
  assert.deepEqual(seen, [2]);
  assert.deepEqual(store.get(), { a: 1, b: 3 });

  let got;
  store.on('log:append', (d) => { got = d; });
  store.emit('log:append', { id: 1 });
  assert.deepEqual(got, { id: 1 });
});

test('store: a failing subscriber does not stop other subscribers', () => {
  const store = createStore();
  const seen = [];
  const origError = console.error;
  console.error = () => {};
  try {
    store.subscribe(() => { throw new Error('screen bug'); });
    store.subscribe((s) => seen.push(s.x));
    store.set({ x: 1 });
  } finally {
    console.error = origError;
  }
  assert.deepEqual(seen, [1]);
});

test('review items: lists proposed nodes with labels; approveAt marks one approved without touching the original', async () => {
  const { reviewItems, approveAt } = await import('../js/review.js');
  const { templatesById } = await import('./fixtures.mjs');
  const t = templatesById['p1-robert-miller'];
  const items = reviewItems(t);
  assert.equal(items.length, countNeedsReview(t));
  const ecg = items.find((i) => i.label.includes('12-lead ECG'));
  assert.deepEqual(ecg.path.slice(0, 1), ['orders']);
  const approved = approveAt(t, ecg.path);
  assert.equal(countNeedsReview(approved), countNeedsReview(t) - 1);
  assert.equal(t.orders[ecg.path[1]].review, 'proposed', 'original untouched');
});
