// The ONLY persistence layer. Nothing else touches localStorage.
// Full build: swap this file's internals for a backend client; keep the API.

const PREFIX = 'nursing-sim:';
const STAMP = 'nursing-sim-at:'; // when each key was last saved here (to compare with the IndexedDB copy)

// Crash safety: Chromium writes localStorage to disk in batches (about every 5 s), so a killed browser or a crashed
// tablet can lose the last seconds (the soak/crash tests showed it). Every save is also written to IndexedDB, which
// reaches disk at once; restoreBackup() puts any newer IndexedDB copy back into localStorage before the app loads.
let dbp = null;
function db() {
  if (dbp || typeof indexedDB === 'undefined') return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('nursing-sim', 1);
      // Never let the backup hold up the app: no answer in 4 s (e.g. a pending delete) → run without it.
      const giveUp = setTimeout(() => { console.warn('IndexedDB backup unavailable (no answer in 4 s); running without it.'); dbp = Promise.resolve(null); resolve(null); }, 4000);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => {
        clearTimeout(giveUp);
        const d = req.result;
        d.onversionchange = () => { d.close(); dbp = null; }; // Reset demo / another tab deleting it: let it go
        resolve(d);
      };
      req.onerror = () => { clearTimeout(giveUp); resolve(null); };
      req.onblocked = () => { /* the timeout covers it */ };
    } catch { resolve(null); }
  });
  return dbp;
}
function mirror(key, json, at) {
  db()?.then((d) => { if (!d) return; try { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv')[json == null ? 'delete' : 'put'](json == null ? key : { json, at }, json == null ? undefined : key); } catch { /* best effort */ } });
}
/** Boot: copy IndexedDB entries newer than localStorage's back into it. Resolves to how many were restored. */
export async function restoreBackup() {
  const d = await db();
  const a = area();
  if (!d || !a) return 0;
  return new Promise((resolve) => {
    let n = 0;
    try {
      const tx = d.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(n); return; }
        const at = Number(a.getItem(STAMP + cur.key) || 0);
        if (cur.value.at > at) { try { a.setItem(PREFIX + cur.key, cur.value.json); a.setItem(STAMP + cur.key, String(cur.value.at)); n++; } catch { /* full */ } }
        cur.continue();
      };
      req.onerror = () => resolve(n);
    } catch { resolve(n); }
  });
}

function area() {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage: app still runs, nothing persists
  }
}

export function load(key, fallback = null) {
  try {
    const raw = area()?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn(`storage.load(${key}) failed:`, err);
    return fallback;
  }
}

// Save failures (storage full or blocked) are reported to listeners so the UI can warn the user visibly.
const failureListeners = new Set();
export function onSaveFailure(fn) {
  failureListeners.add(fn);
  return () => failureListeners.delete(fn);
}
function reportFailure(key, err) {
  console.warn(`storage.save(${key}) failed:`, err);
  for (const fn of failureListeners) {
    try { fn({ key, error: err }); } catch (e) { console.error(e); }
  }
}

export function save(key, value) {
  const a = area();
  if (!a) {
    reportFailure(key, new Error('Browser storage is not available (blocked or private mode).'));
    return false;
  }
  try {
    const json = JSON.stringify(value);
    const at = Date.now();
    a.setItem(PREFIX + key, json);
    a.setItem(STAMP + key, String(at));
    mirror(key, json, at);
    return true;
  } catch (err) {
    reportFailure(key, err);
    return false;
  }
}

export function remove(key) {
  try {
    area()?.removeItem(PREFIX + key);
    area()?.removeItem(STAMP + key);
    mirror(key, null);
  } catch (err) {
    console.warn(`storage.remove(${key}) failed:`, err);
  }
}

/** Removes this app's keys for which pred(key, value) is true (e.g. one user on a shared computer). Returns how many. */
export function removeMatching(pred) {
  const a = area();
  if (!a) return 0;
  const keys = [];
  for (let i = 0; i < a.length; i++) { const k = a.key(i); if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length)); }
  let n = 0;
  for (const k of keys) {
    let v = null;
    try { v = JSON.parse(a.getItem(PREFIX + k)); } catch { /* not JSON */ }
    if (pred(k, v)) { remove(k); n++; }
  }
  return n;
}

/** Removes every key this app stored (Reset demo). Resolves when the IndexedDB copy is cleared too. */
export function clearAll() {
  let done = Promise.resolve();
  try {
    const a = area();
    if (!a) return done;
    // Standard Storage API (length/key) rather than Object.keys, so it works in every implementation.
    const keys = [];
    for (let i = 0; i < a.length; i++) keys.push(a.key(i));
    for (const k of keys) if (k?.startsWith(PREFIX) || k?.startsWith(STAMP)) a.removeItem(k);
    done = Promise.resolve(db()).then((d) => new Promise((resolve) => {
      try { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = resolve; tx.onerror = resolve; } catch { resolve(); }
    }));
  } catch (err) {
    console.warn('storage.clearAll failed:', err);
  }
  return done;
}

// Per-browser-session values (cleared when the browser session ends; survive reloads), e.g. "welcome shown".
function sessionArea() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSession(key, fallback = null) {
  try {
    const raw = sessionArea()?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveSession(key, value) {
  try {
    sessionArea()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn(`storage.saveSession(${key}) failed:`, err);
  }
}

/** Calls fn() when another tab of this browser changes `key` (the window "storage" event). Returns unsubscribe. */
export function onExternalChange(key, fn) {
  const handler = (e) => { if (e.key === PREFIX + key) fn(); };
  try { window.addEventListener('storage', handler); } catch { return () => {}; }
  return () => window.removeEventListener('storage', handler);
}
