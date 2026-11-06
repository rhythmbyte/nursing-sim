// parameter-breach: a parameter order's condition came true (a vital/lab crossed its threshold, or its
// watched event fired) and the required action wasn't charted within withinMin.
// watch: "vitals.<field>" (sbp, dbp, hr, rr, spo2, tempF) | "labs.<code>" | watchEvent: "<eventId>".
// watch: "instructor" is judged by the instructor, so it's never flagged automatically.
import { flag, ruleConfig, responsible, compare, mins } from './helpers.js';
import { vitalsTimeline, vitalNumber } from '../vitals.js';

/** Sim minute the order's condition first became true, or null. Exported for the debrief. */
export function conditionMetAt(state, pid, order, template) {
  const p = order.parameter;
  if (p.watchEvent) {
    const fired = state.log.find((l) => l.patientId === pid && l.action === 'event-fired' && l.details.eventId === p.watchEvent);
    return fired ? fired.simMin : null;
  }
  if (p.watch?.startsWith('vitals.')) {
    const field = p.watch.slice(7);
    const hit = vitalsTimeline(state, pid).find((t) => {
      const v = vitalNumber(t.values, field);
      return v != null && compare(v, p.op, p.value);
    });
    return hit ? hit.atMin : null;
  }
  if (p.watch?.startsWith('labs.')) {
    const code = p.watch.slice(5);
    const hit = state.patients[pid].labs.filter((l) => l.code === code && l.status === 'resulted')
      .find((l) => compare(parseFloat(l.value), p.op, p.value));
    return hit ? (hit.resultedAtMin ?? 0) : null;
  }
  return null;
}

/** First charting of the required action at/after `from`. */
export function requiredActionAt(state, pid, order, from) {
  return state.log.find((l) => l.patientId === pid && l.action === 'intervention' && !l.details.delegatedTo
    && l.details.interventionId === order.parameter.requires && l.simMin >= from) || null;
}

export default {
  id: 'parameter-breach',
  label: 'Parameter order not acted on in time',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'parameter-breach');
    const flags = [];
    for (const [pid, ps] of Object.entries(state.patients)) {
      const t = ctx.templatesById[pid];
      for (const o of t.orders) {
        if (o.type !== 'parameter' || !o.parameter || !ps.orders[o.id]) continue;
        const met = conditionMetAt(state, pid, o, t);
        if (met == null || met < ps.orders[o.id].activeAtMin) continue;
        const deadline = met + o.parameter.withinMin;
        const done = requiredActionAt(state, pid, o, met);
        if (done && done.simMin <= deadline) continue;
        if (!done && ctx.simMin <= deadline) continue;
        flags.push(flag('parameter-breach', cfg.severity || 'red', {
          patientId: pid,
          userIds: done ? [done.userId] : responsible(state, ctx, pid),
          atMin: met,
          logIds: done ? [done.id] : [],
          message: done
            ? `"${o.text}": condition met; action charted after ${mins(done.simMin - met)} (window ${o.parameter.withinMin} min).`
            : `"${o.text}": condition met; required action not charted (${mins(ctx.simMin - met)} so far, window ${o.parameter.withinMin} min).`,
        }));
      }
    }
    return flags;
  },
};
