// Central store + pub/sub. No DOM.
// - get(): current state snapshot
// - set(patch): shallow-merge a patch, then notify subscribers
// - subscribe(fn): fn(state) on every set; returns an unsubscribe function
// - on(name, fn) / emit(name, data): named events (e.g. "log:append", "clock:tick")

export function createStore(initial = {}) {
  let state = { ...initial };
  const subscribers = new Set();
  const handlers = new Map();

  return {
    get: () => state,

    set(patch) {
      state = { ...state, ...patch };
      for (const fn of subscribers) fn(state);
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name).delete(fn);
    },

    emit(name, data) {
      for (const fn of handlers.get(name) || []) fn(data);
    },
  };
}
