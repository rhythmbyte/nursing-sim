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
