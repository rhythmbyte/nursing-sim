// What Live control (and the builder) show about a patient's script right now. Pure, no DOM.

import { armedTimers, maxFires } from '../reactions.js';
import { names, triggerText, effectText, matcherText, reactionText } from './describe.js';

const LISTENS = ['intervention', 'order', 'med', 'vitals', 'fired'];

/** Could this reaction fire from the current state (state conditions only; the rest is checked when it triggers)? */
function stateAllows(r, sc) {
  return (!r.if?.inState?.length || r.if.inState.includes(sc.state)) && !r.if?.notInState?.includes(sc.state);
}

/**
 * { stateId, stateLabel, since, paused, states, timers: [{ id, label, deadline, without, then }],
 *   listening: [{ id, label, when, then }], reactions: [{ id, label, text, fires, max, disabled }] } or null.
 */
export function scriptView(state, pid, template, catalogs) {
  const sc = state.patients[pid]?.script;
  if (!sc || !template?.script) return null;
  const n = names(template, catalogs);
  const thenText = (r) => r.then.map((e) => effectText(e, n)).join('; ');
  const usable = (r) => !sc.disabled[r.id] && (sc.fires[r.id] || 0) < maxFires(r, state.settings);
  return {
    stateId: sc.state, stateLabel: n.state(sc.state), since: sc.enteredAt, paused: sc.paused,
    states: template.script.states.map((s) => ({ id: s.id, label: s.label })),
    timers: armedTimers(sc, template, state.settings).filter((a) => stateAllows(a.reaction, sc)).sort((a, b) => a.deadline - b.deadline).map((a) => ({
      id: a.reaction.id, label: a.reaction.label || a.reaction.id, deadline: a.deadline,
      without: (a.reaction.when.without || []).map((m) => matcherText(m, n)), then: thenText(a.reaction),
    })),
    listening: sc.paused ? [] : template.script.reactions.filter((r) => LISTENS.includes(r.when.kind) && usable(r) && stateAllows(r, sc)).map((r) => ({
      id: r.id, label: r.label || r.id, when: triggerText(r.when, n), then: thenText(r),
    })),
    reactions: template.script.reactions.map((r) => ({
      id: r.id, label: r.label || r.id, text: reactionText(r, n), fires: sc.fires[r.id] || 0, max: maxFires(r, state.settings), disabled: Boolean(sc.disabled[r.id]),
    })),
  };
}
