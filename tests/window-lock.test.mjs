// Two "windows" sharing one browser storage (in-memory stub), with injected ids and clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i], get length() { return mem.size; } },
  sessionStorage: { getItem: () => null, setItem: () => {} } };
const { lockState, createWindowLock, STALE_MS } = await import('../js/window-lock.js');

test('lockState: free when missing or stale, mine/other otherwise', () => {
  assert.equal(lockState(null, 'a', 0), 'free');
  assert.equal(lockState({ id: 'a', at: 0 }, 'a', 100), 'mine');
  assert.equal(lockState({ id: 'b', at: 0 }, 'a', 100), 'other');
  assert.equal(lockState({ id: 'b', at: 0 }, 'a', STALE_MS + 1), 'free');
});

test('one writer: the second window is read-only; take over flips it; a closed writer frees the lock', () => {
  mem.clear();
  let t = 0;
  const seenA = []; const seenB = [];
  const A = createWindowLock({ id: 'A', now: () => t, onChange: (s) => seenA.push(s) });
  const B = createWindowLock({ id: 'B', now: () => t, onChange: (s) => seenB.push(s) });
  assert.equal(A.check(), 'writer');
  t = 1000; assert.equal(B.check(), 'other');
  assert.equal(B.isWriter(), false);
  t = 2000; A.check(); B.check();
  assert.equal(A.isWriter(), true, 'A keeps writing while it heartbeats');
  B.takeOver(); // in the app this reloads B; the reloaded window is a new lock instance
  const B2 = createWindowLock({ id: 'B', now: () => t });
  t = 3000; assert.equal(A.check(), 'other', 'A becomes read-only after B takes over');
  assert.equal(B2.check(), 'writer');
  B2.release(); // B closes
  t = 4000; assert.equal(A.check(), 'stale-other', 'A offers to continue once B is gone');
  assert.deepEqual(seenA, ['writer', 'other', 'stale-other']);
  assert.deepEqual(seenB, ['other', 'writer']);
});

test('a crashed writer goes stale and the next window can continue', () => {
  mem.clear();
  let t = 0;
  const A = createWindowLock({ id: 'A', now: () => t });
  const B = createWindowLock({ id: 'B', now: () => t });
  A.check(); t = 100; B.check();
  t = 100 + STALE_MS + 10; // A stopped heartbeating
  assert.equal(B.check(), 'stale-other');
});

test('taking over survives the reload that follows (release is skipped)', () => {
  mem.clear();
  let t = 0;
  const A = createWindowLock({ id: 'A', now: () => t });
  const B = createWindowLock({ id: 'B', now: () => t });
  A.check(); t = 100; B.check();
  B.takeOver();
  B.release(); // pagehide during the take-over reload
  t = 200; assert.equal(A.check(), 'other', 'A does not get the lock back');
  const B2 = createWindowLock({ id: 'B', now: () => t }); // B after reload
  assert.equal(B2.check(), 'writer');
});
