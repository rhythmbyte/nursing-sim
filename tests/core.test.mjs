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
