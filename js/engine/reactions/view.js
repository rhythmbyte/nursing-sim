// What Live control (and the builder) show about a patient's script right now. Pure, no DOM.

import { entriesFor } from '../log.js';
import { armedTimers, maxFires } from '../reactions.js';
import { names, triggerText, effectText, matcherText, reactionText, causeText } from './describe.js';
import { strength, totalPercent } from '../penalties.js';

const LISTENS = ['intervention', 'order', 'med', 'vitals', 'fired'];

/** Could this reaction fire from the current state (state conditions only; the rest is checked when it triggers)? */
function stateAllows(r, sc) {
  return (!r.if?.inState?.length || r.if.inState.includes(sc.state)) && !r.if?.notInState?.includes(sc.state);
}

/**
 * { stateId, stateLabel, since, paused, states, timers: [{ id, label, deadline, without, then }],
 *   listening: [{ id, label, when, then }], reactions: [{ id, label, text, fires, max, disabled }] } or null.
 */
export function scriptView(state, pid, template, catalogs, simMin = 0) {
  const sc = state.patients[pid]?.script;
  if (!sc || !template?.script) return null;
  const n = names(template, catalogs);
  const ps = state.patients[pid];
  const maxPercent = state.settings.recoveryPenaltyMaxPercent ?? 60;
  const thenText = (r) => r.then.map((e) => effectText(e, n)).join('; ');
  const usable = (r) => !sc.disabled[r.id] && (sc.fires[r.id] || 0) < maxFires(r, state.settings);
  return {
    stateId: sc.state, stateLabel: n.state(sc.state), since: sc.enteredAt, paused: sc.paused,
    penaltiesOn: state.settings.recoveryPenalties !== false, maxPercent,
    penaltyTotal: totalPercent(ps.penalties, simMin, maxPercent),
    penalties: (ps.penalties || []).filter((p) => strength(p, simMin) > 0).map((p) => ({
      id: p.id, label: p.label, percent: Math.round((p.percent || 0) * strength(p, simMin) * 10) / 10, basePercent: p.percent, caps: p.caps, vitals: p.vitals,
      earnedAt: p.earnedAt, why: causeText(p.cause, n), wearing: p.wearOffMin ? (p.treatedAt != null ? `wearing off (gone ${p.treatedAt + p.wearOffMin} min)` : `wears off over ${p.wearOffMin} min once treated`) : 'stays for the rest of the sim',
    })),
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

/**
 * Debrief: a patient's state timeline from the log. Rows { atMin, from, fromLabel, to, label, cause, causeText,
 * by, nothingDone, note }. nothingDone = a countdown fired because none of its "without" actions happened.
 */
export function stateTimeline(state, pid, template, catalogs) {
  if (!template?.script) return [];
  const n = names(template, catalogs);
  const start = { atMin: 0, from: null, fromLabel: '', to: template.script.initialState, label: n.state(template.script.initialState), cause: { kind: 'start' }, causeText: 'start of the sim', by: 'system', nothingDone: false, note: '' };
  return [start, ...entriesFor(state.log, pid).filter((l) => l.action === 'script-state').map((l) => {
    const d = l.details;
    return {
      atMin: l.simMin, from: d.from, fromLabel: n.state(d.from), to: d.to, label: d.label || n.state(d.to), cause: d.cause,
      causeText: causeText(d.cause, n), by: l.userId,
      nothingDone: d.cause?.kind === 'timeout' && (d.cause.without || []).length > 0,
      note: template.script.states.find((s) => s.id === d.to)?.note || '',
    };
  })];
}

/**
 * Debrief: recovery penalties for a patient, from the log. Rows { atMin, kind: earned|limited|changed|cleared|worn-off|skipped, text, why }.
 */
export function penaltyTimeline(state, pid, template, catalogs) {
  const n = template?.script ? names(template, catalogs) : null;
  const KIND = { 'penalty-earned': 'earned', 'recovery-limited': 'limited', 'penalty-changed': 'changed', 'penalty-cleared': 'cleared', 'penalty-worn-off': 'worn-off', 'penalty-skipped': 'skipped' };
  return entriesFor(state.log, pid).filter((l) => KIND[l.action]).map((l) => {
    const d = l.details;
    const kind = KIND[l.action];
    const text = kind === 'earned' ? `${d.label}${d.percent ? `: recovery −${d.percent}%` : ''}${d.caps ? ` (caps ${Object.entries(d.caps).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}${d.wearOffMin ? `, wears off over ${d.wearOffMin} min once treated` : ''}`
      : kind === 'limited' ? `Recovery limited: ${d.limited.map((x) => `${x.k} ${x.effective} instead of ${x.target}`).join(', ')} (${Math.round(d.percent)}% penalty${d.slowedTo ? `, recovery takes ${d.slowedTo} min` : ''})`
        : kind === 'changed' ? `Instructor set ${d.penaltyId} to ${d.percent}%` : kind === 'cleared' ? `Instructor cleared ${d.penaltyId || 'all penalties'}`
          : kind === 'worn-off' ? `${d.label} wore off` : 'Not applied: penalties are off in this sim';
    return { atMin: l.simMin, kind, text, why: kind === 'earned' && n ? causeText(d.cause, n) : '', by: l.userId };
  });
}
