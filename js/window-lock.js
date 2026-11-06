// One window writes the sim. A lock in browser storage ({ id, at }) is refreshed by the writer every
// heartbeat; another window that sees a fresh lock it doesn't own is read-only (it doesn't tick, save or
// pause-on-close) until the user takes over there. A writer that closes releases the lock; one that
// crashes leaves a lock that goes stale after STALE_MS. Persistence goes through storage.js.
// Full build: the server decides who controls a sim (SPEC §13).

import { load, save, remove, loadSession, saveSession } from './storage.js';

export const LOCK_KEY = 'writer';
export const STALE_MS = 6000;

/** Pure: 'mine' | 'other' | 'free' for a stored lock. */
export function lockState(lock, myId, now, staleMs = STALE_MS) {
  if (!lock || !lock.id || now - lock.at > staleMs) return 'free';
  return lock.id === myId ? 'mine' : 'other';
}

/**
 * createWindowLock({ onChange(state) }) → { id, check(), takeOver(), release(), isWriter() }.
 * check() claims a free lock, refreshes our own, and reports 'writer' | 'other' | 'stale-other'.
 */
export function createWindowLock({ now = () => Date.now(), id = null, onChange = () => {} } = {}) {
  let myId = id || loadSession('windowId', null);
  if (!myId) { myId = `w${Math.random().toString(36).slice(2, 10)}`; saveSession('windowId', myId); }
  let state = null;
  let keepOnUnload = false; // set by takeOver: the reload that follows must not release the lock it just took
  const set = (s) => { if (s !== state) { state = s; onChange(s); } return s; };
  const lock = {
    id: myId,
    check() {
      const st = lockState(load(LOCK_KEY), myId, now());
      if (st === 'other') return set('other');
      if (st === 'free' && state === 'other') return set('stale-other'); // the other window went away: offer to continue
      save(LOCK_KEY, { id: myId, at: now() });
      return set('writer');
    },
    takeOver() { save(LOCK_KEY, { id: myId, at: now() }); keepOnUnload = true; set('writer'); },
    release() { if (!keepOnUnload && lockState(load(LOCK_KEY), myId, now()) === 'mine') remove(LOCK_KEY); },
    isWriter: () => state === 'writer',
  };
  return lock;
}
