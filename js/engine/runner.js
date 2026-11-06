// Stateful controller: owns the live session, drives ticks, pushes state to the store, persists.
// No DOM. Timers live in main.js; wall time comes from the injected `now`.
// Store events: 'tick' (simMin) on every tick; store.set({ session }) whenever state changes.

import * as session from './session.js';
import * as chart from './chart.js';
import { taskPlan, beginTask, interruptTask, endTaskNow, busyView } from './tasks.js';
import * as staffOps from './staff.js';
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
import * as script from './reactions/control.js';
import { scriptView } from './reactions/view.js';
import { availableTools, expectedResult, revealItem } from './assessments.js';
import { timelinessItems } from './timeliness.js';

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
     *        chartIntervention, flowsheetEntry, setMonitor, takeBpNow, connectMonitor, acknowledgeAlarm, medAction, addNote, escalate (see engine/chart.js).
     */
    chart(name, patientId, args, user) {
      if (typeof chart[name] !== 'function') throw new Error(`Unknown chart action ${name}`);
      // Timed tasks (engine/tasks.js): start the busy timer; the action is applied when it finishes. Returns { task } or { done }.
      const plan = taskPlan(state, name, patientId, args || {}, { catalogs, templatesById: eff() });
      if (plan) { commit(beginTask(state, patientId, name, args || {}, plan, { now: now(), user, templatesById: eff(), catalogs })); store.emit('tick', runner.simMin()); return { task: plan }; }
      commit(chart[name](state, patientId, args || {}, { now: now(), user, templatesById: eff(), catalogs }));
      return { done: true };
    },
    /** The student's current task: { label, patientId, endsAt, leftSec, fraction } or null. */
    busy: (userId) => busyView(state, userId, runner.simMin()),
    interruptTask(user) { commit(interruptTask(state, { now: now(), user })); },
    /** Delegation helpers of a group: { helpers, queued } (engine/staff.js). */
    staffView: (groupId) => staffOps.staffView(state, groupId, runner.simMin(), catalogs),
    /** Charge / instructor: name ∈ moveHelper(helperId, groupId), setOnBreak(helperId, on), setStaffCount(groupId, role, n). */
    staff(name, args, user) { commit(staffOps[name](state, ...args, { now: now(), user, templatesById: eff(), catalogs })); runner.tick(); },
    /** Instructor: end a student's task now (counts as done). */
    endTaskNow(userId, user) { commit(endTaskNow(state, userId, { now: now(), user, templatesById: eff(), catalogs })); runner.tick();
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

    /** Live control → Add event (guided builder): fire an inline event now. */
    liveEvent(patientId, event, user) { commit(session.fireLiveEvent(state, patientId, event, { ...ctx(), user })); runner.tick(); },

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

    /**
     * Instructor overrides for a patient's reaction script (engine/reactions/control.js), then a tick so
     * any chained reactions run straight away. name ∈ forceState(stateId), fireReactionNow(reactionId),
     * setReactionEnabled(reactionId, enabled), skipArmed(reactionId), setScriptPaused(paused),
     * addPenalty({ percent, caps, label }), setPenalty(penaltyId | null, percent | null).
     */
    script(name, patientId, args, user) {
      if (typeof script[name] !== 'function') throw new Error(`Unknown script action ${name}`);
      commit(script[name](state, patientId, ...args, { ...ctx(), user, refs }));
      runner.tick();
    },
    scriptView: (patientId) => scriptView(state, patientId, eff()[patientId], catalogs, runner.simMin()),

    /** Assessment tools offered in this sim (settings.assessmentTools). */
    assessmentTools: () => availableTools(state.settings, catalogs),
    /** Auto-calculated tools only (NEWS2 from current vitals): never returns another tool's answer key. */
    assessmentNow(patientId, toolId) {
      const tool = catalogs.assessmentTools?.tools.find((t) => t.id === toolId);
      if (tool?.scoring !== 'auto') throw new Error('Only auto-calculated tools can be read directly');
      return expectedResult(state, patientId, toolId, catalogs);
    },
    /** One item's scripted finding, only when settings.revealAssessmentFindings is on. */
    revealAssessment: (patientId, toolId, itemId) => revealItem(state, patientId, toolId, itemId),
    /** Reassessments the patient's orders require (timeliness items), for the chart's Due list. */
    assessmentsDue: (patientId) => timelinessItems(state, runner.rulesCtx()).filter((i) => i.kind === 'assessment' && i.patientId === patientId),
    /** Instructor only: what the patient would score now (answer key). */
    expectedAssessment: (patientId, toolId) => expectedResult(state, patientId, toolId, catalogs),

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
