// Stateful controller: owns the live session, drives ticks, pushes state to the store, persists.
// No DOM. Timers live in main.js; wall time comes from the injected `now`.
// Store events: 'tick' (simMin) on every tick; store.set({ session }) whenever state changes.

import * as session from './session.js';
import { collectEvents, groupMembers } from './scheduler.js';

export function createRunner({ store, scenario, templatesById, now = () => Date.now(), persist = () => {}, saved = null }) {
  const ids = session.scenarioPatients(scenario).map((p) => p.id).filter((id) => templatesById[id]);
  const refs = collectEvents(ids, templatesById, scenario);
  const fresh = () => session.createSession(scenario, templatesById);
  let state = saved && saved.version === session.SESSION_VERSION && saved.scenarioId === scenario.id ? saved : fresh();

  function commit(next) {
    if (next === state) return;
    state = next;
    store.set({ session: state });
    persist(state);
  }

  const ctx = () => ({ now: now(), templatesById });

  const runner = {
    refs,
    get state() { return state; },
    simMin: () => session.simMinOf(state, now()),

    tick() {
      const { state: next } = session.tick(state, { ...ctx(), refs });
      commit(next);
      store.emit('tick', runner.simMin());
    },

    clock(action, user, speed) {
      commit(session.controlClock(state, action, { now: now(), user, speed }));
      runner.tick();
    },

    fireNow(key, user) {
      const ref = refs.find((r) => r.key === key);
      if (!ref) {
        console.warn(`fireNow: unknown event ${key}`);
        return;
      }
      commit(session.fireNow(state, ref, { ...ctx(), refs, user }));
    },

    /** Linked events that "Fire now" on this ref would fire (including itself). */
    groupOf: (ref) => groupMembers(refs, ref),

    nextEventMin: () => session.nextEventMin(state, refs, now()),

    skipToNext(user) {
      commit(session.skipToNext(state, { ...ctx(), refs, user }));
      store.emit('tick', runner.simMin());
    },

    /** Called when the page closes, and on boot with the last heartbeat (covers crashes). */
    pauseForClose(atWall) {
      commit(session.pauseForClose(state, { atWall, now: now(), pauseOnClose: scenario.settings.pauseOnClose }));
    },

    answerCallLight(patientId, user) {
      commit(session.answerCallLight(state, patientId, { now: now(), user }));
    },

    reset() {
      commit(fresh());
      store.emit('tick', 0);
    },
  };

  store.set({ session: state });
  return runner;
}
