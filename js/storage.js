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

export function save(key, value) {
  try {
    area()?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`storage.save(${key}) failed:`, err);
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
    for (const k of Object.keys(a)) if (k.startsWith(PREFIX)) a.removeItem(k);
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
