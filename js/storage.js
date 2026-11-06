// The ONLY persistence layer. Nothing else touches localStorage.
// Full build: swap this file's internals for a backend client; keep the API.

const PREFIX = 'nursing-sim:';

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
    a.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    reportFailure(key, err);
    return false;
  }
}

export function remove(key) {
  try {
    area()?.removeItem(PREFIX + key);
  } catch (err) {
    console.warn(`storage.remove(${key}) failed:`, err);
  }
}

/** Removes every key this app stored (Reset demo). */
export function clearAll() {
  try {
    const a = area();
    if (!a) return;
    // Standard Storage API (length/key) rather than Object.keys, so it works in every implementation.
    const keys = [];
    for (let i = 0; i < a.length; i++) keys.push(a.key(i));
    for (const k of keys) if (k?.startsWith(PREFIX)) a.removeItem(k);
  } catch (err) {
    console.warn('storage.clearAll failed:', err);
  }
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
