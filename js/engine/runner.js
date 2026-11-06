// Stateful controller: owns the live session, drives ticks, pushes state to the store, persists.
// No DOM. Timers live in main.js; wall time comes from the injected `now`.
// Store events: 'tick' (simMin) on every tick; store.set({ session }) whenever state changes.

import * as session from './session.js';
import * as chart from './chart.js';
import { releaseLab } from './labs.js';
import { measureManual } from './vitals.js';
import { collectEvents, groupMembers } from './scheduler.js';

export function createRunner({ store, scenario, templatesById, catalogs = null, now = () => Date.now(), persist = () => {}, saved = null }) {
  const ids = session.scenarioPatients(scenario).map((p) => p.id).filter((id) => templatesById[id]);
  const refs = collectEvents(ids, templatesById, scenario);
  const fresh = () => session.createSession(scenario, templatesById);
  let state = saved && saved.version === session.SESSION_VERSION && saved.scenarioId === scenario.id ? saved : fresh();

  function commit(next) {
    if (next === state) return;
    state = next;
    persist(state); // persist first: a screen error while notifying must never lose the action
    store.set({ session: state });
  }

  const ctx = () => ({ now: now(), templatesById, catalogs });

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

    /**
     * Student chart actions: runner.chart(name, patientId, args, user).
     * name ∈ openPatient, openHandoff, closeHandoff, saveHandoffNotes, acknowledgeOrder, completeOrder,
     *        chartIntervention, flowsheetEntry, setMonitor, medAction, addNote, escalate (see engine/chart.js).
     */
    chart(name, patientId, args, user) {
      if (typeof chart[name] !== 'function') throw new Error(`Unknown chart action ${name}`);
      commit(chart[name](state, patientId, args || {}, { now: now(), user, templatesById, catalogs }));
    },

    /** Temp/RR/pain a student would measure now ({} when settings.revealManualVitals is false). */
    measure: (patientId) => measureManual(state, patientId),

    releaseLab(patientId, uid, value, user) {
      commit(releaseLab(state, patientId, { uid, value }, { now: now(), user, simMin: runner.simMin() }));
    },

    reset() {
      commit(fresh());
      store.emit('tick', 0);
    },
  };

  store.set({ session: state });
  return runner;
}
