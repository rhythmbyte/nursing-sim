// Plain-language text for reaction scripts ("When … If … Then …"), shared by Live control, the builder,
// the state diagram and the debrief. Pure; names come from the template and catalogs.

const range = (t = {}) => [
  t.min != null && t.max != null ? `${t.min}–${t.max}` : t.min != null ? `≥ ${t.min}` : t.max != null ? `≤ ${t.max}` : '',
  t.equals != null ? `= ${t.equals}` : '',
  t.matches?.length ? `contains ${t.matches.join(' or ')}` : '',
  t.excludes?.length ? `not ${t.excludes.join('/')}` : '',
].filter(Boolean).join(', ');

const whereText = (where) => {
  if (!where) return '';
  const alts = (Array.isArray(where) ? where : [where]).map((w) => Object.entries(w).map(([k, t]) => `${k} ${range(t)}`).join(' and '));
  return alts.length ? ` (${alts.join(' or ')})` : '';
};

export function names(template, catalogs) {
  const iv = (id) => catalogs?.interventions?.interventions.find((i) => i.id === id)?.label || id;
  const order = (id) => template.orders.find((o) => o.id === id)?.text || id;
  const state = (id) => template.script?.states.find((s) => s.id === id)?.label || id;
  const reaction = (id) => template.script?.reactions.find((r) => r.id === id)?.label || id;
  return { iv, order, state, reaction };
}

/** An action matcher ("Apply / titrate oxygen (lpm 1–4)"). */
export function matcherText(m, n) {
  if (m.kind === 'intervention') return `${n.iv(m.interventionId)}${whereText(m.where)}`;
  if (m.kind === 'order') return `work on "${n.order(m.orderId)}"`;
  if (m.kind === 'med') return `${m.result && m.result !== 'given' ? `${m.result} ` : ''}${m.orderId ? n.order(m.orderId) : m.med || 'a med'}${m.dose ? ` (dose ${range(m.dose)})` : ''}`;
  return m.kind;
}

export function triggerText(w, n) {
  if (w.kind === 'vitals') return `${w.field} ${w.op} ${w.value}`;
  if (w.kind === 'duration') return `${w.field} ${w.op} ${w.value} for ${w.forMin}+ min`;
  if (w.kind === 'penalty') return `recovery penalty reaches ${w.atLeastPercent}%`;
  if (w.kind === 'elapsed') {
    const since = w.since === 'state' ? `in "${n.state(w.state)}"` : w.since === 'event' ? `after event ${w.eventId}` : w.since === 'reaction' ? `after "${n.reaction(w.reactionId)}"` : 'from the start';
    return `${w.afterMin} min ${since}${w.without?.length ? ` without ${w.without.map((m) => matcherText(m, n)).join(' or ')}` : ''}`;
  }
  if (w.kind === 'fired') return w.eventId ? `event ${w.eventId} fires` : `"${n.reaction(w.reactionId)}" fires`;
  return `${matcherText(w, n)} charted`;
}

export function conditionText(c, n) {
  if (!c) return '';
  const parts = [];
  if (c.inState?.length) parts.push(`in ${c.inState.map((s) => `"${n.state(s)}"`).join(' or ')}`);
  if (c.notInState?.length) parts.push(`not in ${c.notInState.map((s) => `"${n.state(s)}"`).join(' or ')}`);
  for (const [k, r] of Object.entries(c.vitals || {})) parts.push(`${k} ${range(r)}`);
  if (c.done?.length) parts.push(`after ${c.done.map((m) => matcherText(m, n)).join(' and ')}`);
  if (c.notDone?.length) parts.push(`no ${c.notDone.map((m) => matcherText(m, n)).join(' or ')} yet`);
  if (c.betweenMin) parts.push(`between minute ${c.betweenMin[0]} and ${c.betweenMin[1]}`);
  return parts.join(', ');
}

const vitalsText = (v) => Object.entries(v.values || {}).map(([k, x]) => `${k} ${x}`).join(', ') + (v.overMin ? ` over ${v.overMin} min` : '');

export function effectText(e, n) {
  if (e.type === 'state') return `go to "${n.state(e.to)}"`;
  if (e.type === 'vitals') return `vitals ${vitalsText(e)}`;
  if (e.type === 'findings') return `new findings (${e.change})`;
  if (e.type === 'event') return `${e.event?.type}${e.event?.payload?.message ? `: "${e.event.payload.message}"` : e.event?.payload?.orderSet ? ` ${e.event.payload.orderSet}` : ''}`;
  if (e.type === 'fire') return `fire event ${e.eventId}`;
  if (e.type === 'penalty') return penaltyText(e);
  return e.type;
}

/** One line: "When … · If … · Then …". */
export function reactionText(r, n) {
  const c = conditionText(r.if, n);
  return `When ${triggerText(r.when, n)}${c ? ` · if ${c}` : ''} · then ${r.then.map((e) => effectText(e, n)).join('; ')}`;
}

const CAUSE = { duration: 'vitals held too long', penalty: 'penalty threshold', student: 'student action', timeout: 'nothing done in time', threshold: 'vitals threshold', instructor: 'instructor', event: 'scheduled event', chain: 'another reaction', staff: 'staff report', system: 'system' };

/** Cause of a transition, in words. */
export function causeText(cause, n) {
  if (!cause) return '';
  const base = CAUSE[cause.kind] || cause.kind;
  if (cause.kind === 'timeout') return `${base}: ${cause.afterMin} min${cause.without?.length ? ` without ${cause.without.map((m) => matcherText(m, n)).join(' or ')}` : ''}`;
  if (cause.kind === 'threshold') return `${base}: ${cause.field} ${cause.op} ${cause.value}`;
  if (cause.kind === 'event') return `${base}: ${cause.eventId}`;
  if (cause.kind === 'duration') return `${cause.field} ${cause.op} ${cause.value} for ${cause.forMin} min`;
  if (cause.kind === 'penalty') return `recovery penalty reached ${cause.atLeastPercent}%`;
  if (cause.kind === 'chain') return `${base}: "${n.reaction(cause.fromReaction)}"`;
  return base;
}

/** "recovery reduced 20% (SpO₂, wears off over 30 min after treatment)". */
export function penaltyText(e) {
  const parts = [];
  if (e.percent) parts.push(`recovery reduced ${e.percent}%`);
  for (const [k, v] of Object.entries(e.caps || {})) parts.push(`${k} recovers no further than ${v}`);
  const extra = [e.vitals?.length ? e.vitals.join(', ') : 'all vitals', e.wearOffMin ? `wears off over ${e.wearOffMin} min after treatment` : 'for the rest of the sim', e.slowFactor > 1 ? `recovery ${e.slowFactor}× slower` : ''].filter(Boolean);
  return `${parts.join('; ') || 'recovery penalty'} (${extra.join(', ')})`;
}

/**
 * Plain preview for the editor: "If spo2 < 80 for 5+ min: recovery reduced 20% (SpO₂ target 96 from 80 → ~93 instead)".
 * The example uses the best scripted target for the first limited vital and the trigger value as the starting point.
 */
export function penaltyPreview(when, e, template, limitOne, normal) {
  const k = e.vitals?.[0] || (when?.field && ['spo2', 'hr', 'rr', 'sbp', 'dbp', 'tempF'].includes(when.field) ? when.field : 'spo2');
  const from = typeof when?.value === 'number' && when.field === k ? when.value : { spo2: 80, hr: 130, rr: 30, sbp: 80, dbp: 45, tempF: 102 }[k];
  const targets = (template.script?.states || []).map((s) => s.vitals?.values?.[k]).filter((v) => typeof v === 'number');
  const range = normal?.[k];
  const best = targets.length && range ? targets.reduce((a, b) => (Math.abs(b - (range[0] + range[1]) / 2) < Math.abs(a - (range[0] + range[1]) / 2) ? b : a)) : range ? Math.round((range[0] + range[1]) / 2) : null;
  const head = when ? `If ${triggerTextShort(when)}: ` : '';
  if (best == null || from == null) return `${head}${penaltyText(e)}`;
  const caps = e.caps?.[k] != null ? [e.caps[k]] : [];
  const eff = limitOne(k, from, best, { percent: e.percent || 0, caps, slow: 1 }, normal);
  return `${head}${penaltyText(e)}. Example: ${k} target ${best} from ${from} → ~${eff} instead of ${best}.`;
}
const triggerTextShort = (w) => (w.kind === 'duration' ? `${w.field} ${w.op} ${w.value} for ${w.forMin}+ min` : w.kind === 'vitals' ? `${w.field} ${w.op} ${w.value}` : w.kind === 'elapsed' ? `${w.afterMin} min${w.without?.length ? ' without the action' : ''}` : 'triggered');
