// Timeliness: how long each piece of work took from active/due to done, and its tag. Pure, no DOM.
// ONE source for the command center, the debrief and the tier-timeout / call-light-response /
// alarm-response rules (thresholds: rules.json rules.timeliness; scenario overrides: settings.rules.timeliness).
//
// Item: { kind: 'order'|'med'|'callLight'|'alarm', patientId, label, tier?, startAt, doneAt|null, doneBy,
//         minutes, tag, logId? }
// Tags: on-time | late | very-late (done) · open | open-late | open-very-late (not done yet).

import { firstWork } from './orders.js';
import { withoutStruck } from './struck.js';
import { alarmEpisodes } from './monitor-alarms.js';
import { round2 } from './time.js';

const merge = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k], v) : v;
  return out;
};

/** Catalog timeliness config deep-merged with the scenario's settings.rules.timeliness. */
export function timelinessConfig(state, catalogs) {
  return merge(catalogs?.rules?.rules?.timeliness, state.settings?.rules?.timeliness);
}

/** Pure: tag for minutes taken against { lateMin, veryLateMin }. */
export function tagFor(minutes, done, th) {
  const level = minutes > th.veryLateMin ? 'very-late' : minutes > th.lateMin ? 'late' : 'on-time';
  if (done) return level;
  return level === 'on-time' ? 'open' : `open-${level}`;
}

const SEVERITY = { 'on-time': 0, open: 1, late: 2, 'open-late': 3, 'very-late': 4, 'open-very-late': 5, never: 5 };
/** Higher = needs attention more (for sorting). */
export const tagRank = (tag) => SEVERITY[tag] ?? 0;
export const isLate = (tag) => tag === 'late' || tag === 'open-late';
export const isVeryLate = (tag) => tag === 'very-late' || tag === 'open-very-late';

/** Orders the timing applies to (shared with tier-timeout; priority-order keeps its own setting). */
export function isTimedOrder(order, os, tracking) {
  if (!os) return false;
  if (os.activeAtMin === 0 && !tracking.includeShiftStartOrders) return false;
  if ((tracking.trackedOrderTypes || ['once']).includes(order.type)) return true;
  return tracking.trackEventTriggeredPrn !== false && order.type === 'prn' && Boolean(order.activeOnEvent);
}

function item(base, startAt, doneAt, simMin, th) {
  const done = doneAt != null;
  const minutes = round2((done ? doneAt : simMin) - startAt);
  return { ...base, startAt, doneAt: done ? doneAt : null, minutes, tag: tagFor(minutes, done, th) };
}

function orderItems(state, ctx, cfg) {
  const out = [];
  for (const [pid, ps] of Object.entries(state.patients)) {
    for (const o of ctx.templatesById[pid]?.orders || []) {
      const os = ps.orders[o.id];
      const th = cfg.orders?.[o.tier];
      if (!th || !isTimedOrder(o, os, cfg.tracking || {})) continue;
      const w = firstWork(state, pid, o);
      out.push(item({ kind: 'order', patientId: pid, label: o.text, tier: o.tier, orderId: o.id, doneBy: w?.userId ?? null, logId: w?.id }, os.activeAtMin, w?.simMin ?? null, ctx.simMin, th));
    }
  }
  return out;
}

/** Due times of a scheduled med up to simMin: dueAtMin, else every frequencyMin from activation, else at activation. */
export function medDueTimes(order, os, simMin) {
  if (order.dueAtMin != null) return order.dueAtMin <= simMin ? [order.dueAtMin] : [];
  const start = Math.max(os.activeAtMin, order.activeFromMin ?? os.activeAtMin);
  if (!order.frequencyMin) return [start];
  const times = [];
  for (let t = start; t <= simMin; t += order.frequencyMin) times.push(t);
  return times;
}

function medItems(state, ctx, cfg) {
  const out = [];
  const th = cfg.scheduledMeds;
  for (const [pid, ps] of Object.entries(state.patients)) {
    for (const o of ctx.templatesById[pid]?.orders || []) {
      const os = ps.orders[o.id];
      if (!o.med || o.type !== 'scheduled' || !os || !th) continue;
      // Each due dose is answered by the next MAR action (given / held / not given) from earlyWindowMin before it.
      const actions = state.log.filter((l) => l.patientId === pid && l.action === 'med' && l.details.orderId === o.id);
      let next = 0;
      for (const due of medDueTimes(o, os, ctx.simMin)) {
        while (next < actions.length && actions[next].simMin < due - (th.earlyWindowMin ?? 60)) next++;
        const a = actions[next];
        if (a) next++;
        out.push(item({ kind: 'med', patientId: pid, label: o.med, tier: o.tier, orderId: o.id, doneBy: a?.userId ?? null, logId: a?.id, result: a?.details.result }, due, a?.simMin ?? null, ctx.simMin, th));
      }
    }
  }
  return out;
}

function callLightItems(state, ctx, cfg) {
  const out = [];
  for (const l of state.log) {
    if (l.action !== 'call-light-answered') continue;
    out.push(item({ kind: 'callLight', patientId: l.patientId, label: 'Call light', doneBy: l.userId, logId: l.id }, l.details.litAtMin, l.simMin, ctx.simMin, cfg.callLights));
  }
  for (const [pid, ps] of Object.entries(state.patients)) {
    if (ps.callLight) out.push(item({ kind: 'callLight', patientId: pid, label: 'Call light', doneBy: null }, ps.callLight.since, null, ctx.simMin, cfg.callLights));
  }
  return out;
}

function alarmItems(state, ctx, cfg) {
  const out = [];
  for (const pid of Object.keys(state.patients)) {
    for (const ep of alarmEpisodes(state.log, pid)) {
      // An alarm that cleared on its own counts as closed at that time (not as acknowledged).
      const closedAt = ep.ack ?? ep.end;
      out.push({ ...item({ kind: 'alarm', patientId: pid, label: `Monitor alarm (${ep.alarms.join(', ')})`, doneBy: ep.ackBy, alarms: ep.alarms }, ep.start, closedAt, ctx.simMin, cfg.alarms), acknowledged: ep.ack != null, selfCleared: ep.ack == null && ep.end != null });
    }
  }
  return out;
}

/** All timeliness items for the session at ctx.simMin. ctx: { templatesById, catalogs, simMin }. */
export function timelinessItems(fullState, ctx) {
  const state = withoutStruck(fullState); // "entered in error" work doesn't count as done
  const cfg = timelinessConfig(state, ctx.catalogs);
  return [...orderItems(state, ctx, cfg), ...medItems(state, ctx, cfg), ...callLightItems(state, ctx, cfg), ...alarmItems(state, ctx, cfg)];
}

/** Counts used by the command center and debrief summaries. */
export function timelinessCounts(items) {
  const c = { onTime: 0, late: 0, veryLate: 0, open: 0 };
  for (const i of items) {
    if (i.tag === 'on-time') c.onTime++;
    else if (isLate(i.tag)) c.late++;
    else if (isVeryLate(i.tag)) c.veryLate++;
    if (i.doneAt == null) c.open++;
  }
  return c;
}
