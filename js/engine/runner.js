// Stateful controller: owns the live session, drives ticks, pushes state to the store, persists.
// No DOM. Timers live in main.js; wall time comes from the injected `now`.
// Store events: 'tick' (simMin) on every tick; store.set({ session }) whenever state changes.

import * as session from './session.js';
import * as chart from './chart.js';
import { releaseLab } from './labs.js';
import { measureManual } from './vitals.js';
import { markLeftUnattended, pushOrder, startCode, setCodeOutcome, setCallLight } from './instructor.js';
import { joinSim } from './roster.js';
import { assignAdmission, holdAdmission } from './admissions.js';
import { assignPriority } from './priority.js';
import { adjustVitals } from './vitals-control.js';
import { submitReflection } from './reflection.js';
import { effectiveTemplates } from './templates.js';
import { evaluateRules } from './rules/index.js';
import { buildDebrief } from './debrief.js';
import { studentIdsForGroup, groupOfStudent, generateJoinCode } from './assignment.js';
import { collectEvents, groupMembers } from './scheduler.js';

// `scenario` must have merged settings (engine/settings.js withDefaults).
export function createRunner({ store, scenario, templatesById, catalogs = null, now = () => Date.now(), persist = () => {}, saved = null, rng = Math.random }) {
  const ids = session.scenarioPatients(scenario).map((p) => p.id).filter((id) => templatesById[id]);
  const refs = collectEvents(ids, templatesById, scenario);
  const fresh = () => session.createSession(scenario, templatesById, catalogs, { joinCode: generateJoinCode(rng) });
  const usable = saved && saved.version === session.SESSION_VERSION && saved.scenarioId === scenario.id
    && Object.keys(saved.patients || {}).every((id) => templatesById[id]);
  if (saved && !usable) console.warn('Saved session discarded (different scenario, older format, or a patient is missing).');
  let state = usable ? saved : fresh();

  function commit(next) {
    if (next === state) return;
    state = next;
    persist(state); // persist first: a screen error while notifying must never lose the action
    store.set({ session: state });
  }

  // Effective templates (file + ad-hoc orders), recomputed only when state.adhoc changes.
  let effFor = null;
  let effCache = templatesById;
  const eff = () => {
    if (effFor !== state.adhoc) { effFor = state.adhoc; effCache = effectiveTemplates(templatesById, state); }
    return effCache;
  };
  const ctx = () => ({ now: now(), templatesById: eff(), catalogs });

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
      commit(session.pauseForClose(state, { atWall, now: now() }));
    },

    answerCallLight(patientId, user) {
      commit(session.answerCallLight(state, patientId, { now: now(), user }));
    },

    /**
     * Student chart actions: runner.chart(name, patientId, args, user).
     * name ∈ openPatient, openHandoff, closeHandoff, saveHandoffNotes, acknowledgeOrder, completeOrder,
     *        chartIntervention, flowsheetEntry, setMonitor, takeBpNow, connectMonitor, medAction, addNote, escalate (see engine/chart.js).
     */
    chart(name, patientId, args, user) {
      if (typeof chart[name] !== 'function') throw new Error(`Unknown chart action ${name}`);
      commit(chart[name](state, patientId, args || {}, { now: now(), user, templatesById: eff(), catalogs }));
    },

    /** Manual vitals a student would measure now ({} when settings.revealManualVitals is false). */
    measure: (patientId) => measureManual(state, patientId, catalogs.vitals),

    releaseLab(patientId, uid, value, user) {
      commit(releaseLab(state, patientId, { uid, value }, { now: now(), user, simMin: runner.simMin() }));
    },

    markLeftUnattended(patientId, studentIds, note, user) {
      commit(markLeftUnattended(state, patientId, { studentIds, note }, { now: now(), user }));
    },

    /** Templates including instructor ad-hoc orders (screens that show orders use this). */
    templates: () => eff(),

    /** Student joins with the code. Returns an error message or null. */
    join(userId, name, code) {
      const r = joinSim(state, { userId, name, code }, { scenario, now: now(), rng });
      commit(r.state);
      return r.error;
    },

    pushOrder(patientId, order, user) {
      commit(pushOrder(state, patientId, order, { now: now(), user }));
    },
    assignAdmission(patientId, groupId, user) { commit(assignAdmission(state, patientId, { groupId }, { now: now(), user, scenario })); },
    holdAdmission(patientId, reason, user) { commit(holdAdmission(state, patientId, { reason }, { now: now(), user })); },
    assignPriority(patientId, levelId, user) { commit(assignPriority(state, patientId, { levelId }, { now: now(), user, catalogs })); },
    adjustVitals(patientId, args, user) { commit(adjustVitals(state, patientId, args, { now: now(), user })); runner.tick(); },
    submitReflection(userId, answers, user) { commit(submitReflection(state, { userId, answers }, { now: now(), user, catalogs })); },
    startCode(patientId, args, user) { commit(startCode(state, patientId, args || {}, { now: now(), user })); },
    setCodeOutcome(patientId, outcome, user) { commit(setCodeOutcome(state, patientId, outcome, { now: now(), user })); },
    setCallLight(patientId, on, message, user) { commit(setCallLight(state, patientId, { on, message }, { now: now(), user })); },

    /** Context the rules and the debrief need (responsibility comes from the joined roster). */
    rulesCtx: () => ({
      templatesById: eff(), catalogs, simMin: runner.simMin(),
      studentIdsForGroup: (g) => studentIdsForGroup(state.roster, g),
      groupOfStudent: (u) => groupOfStudent(state.roster, u),
    }),
    flags: () => evaluateRules(state, runner.rulesCtx()),
    debrief: (userId) => buildDebrief(state, userId, runner.rulesCtx()),

    reset() {
      commit(fresh());
      store.emit('tick', 0);
    },
  };

  store.set({ session: state });
  return runner;
}
