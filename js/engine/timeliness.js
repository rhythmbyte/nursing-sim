// Timeliness: how long each piece of work took from active/due to done, and its tag. Pure, no DOM.
// ONE source for the command center, the debrief and the tier-timeout / call-light-response /
// alarm-response rules (thresholds: rules.json rules.timeliness; scenario overrides: settings.rules.timeliness).
//
// Item: { kind: 'order'|'med'|'assessment'|'delegation'|'callLight'|'alarm', patientId, label, tier?, startAt, doneAt|null, doneBy,
//         minutes, tag, logId? }
// Tags: on-time | late | very-late (done) · open | open-late | open-very-late (not done yet).

import { entriesFor } from './log.js';
import { firstWork } from './orders.js';
import { withoutStruck } from './struck.js';
import { alarmEpisodes } from './monitor-alarms.js';
import { round2 } from './time.js';
import { availableTools } from './assessment-score.js';

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

/**
 * Due times of a scheduled med up to simMin: dueAtMin, else every frequencyMin from the first due time, else once.
 * First due time: activation, except meds already active at shift start, which are first due at
 * shiftStartDueMin (data: rules.timeliness.scheduledMeds; e.g. 120 = 09:00 morning meds; SPEC §14).
 */
export function medDueTimes(order, os, simMin, shiftStartDueMin = 0) {
  if (order.dueAtMin != null) return order.dueAtMin <= simMin ? [order.dueAtMin] : [];
  const start = os.activeAtMin === 0 ? shiftStartDueMin : Math.max(os.activeAtMin, order.activeFromMin ?? os.activeAtMin);
  if (!order.frequencyMin) return start <= simMin ? [start] : [];
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
      const actions = entriesFor(state.log, pid).filter((l) => l.action === 'med' && l.details.orderId === o.id);
      let next = 0;
      for (const due of medDueTimes(o, os, ctx.simMin, th.shiftStartDueMin ?? 0)) {
        while (next < actions.length && actions[next].simMin < due - (th.earlyWindowMin ?? 60)) next++;
        const a = actions[next];
        if (a) next++;
        out.push(item({ kind: 'med', patientId: pid, label: o.med, tier: o.tier, orderId: o.id, doneBy: a?.userId ?? null, logId: a?.id, result: a?.details.result }, due, a?.simMin ?? null, ctx.simMin, th));
      }
    }
  }
  return out;
}

/**
 * Assessments an order requires (order.assessment = { tools, everyMin?, once? }): first due at activation (orders
 * active at shift start: at assessments.shiftStartDueMin), then every everyMin. Each due time is answered by the first
 * charted assessment with one of the tools from earlyWindowMin before it. afterDoseMin: due that long after each dose given. Item label: "GCS / NIHSS (Neuro checks…)".
 */
export function assessmentDueTimes(order, os, simMin, th, doses = []) {
  const a = order.assessment;
  if (a.afterDoseMin != null) return doses.map((d) => d + a.afterDoseMin).filter((t) => t <= simMin); // e.g. POSS 30 min after each opioid dose
  const start = os.activeAtMin === 0 ? th.shiftStartDueMin ?? 0 : os.activeAtMin;
  if (a.once || !a.everyMin) return start <= simMin ? [start] : [];
  const times = [];
  for (let t = start; t <= simMin; t += a.everyMin) times.push(t);
  return times;
}

function assessmentItems(state, ctx, cfg) {
  const out = [];
  const th = cfg.assessments;
  if (!th) return out;
  const offered = new Set(availableTools(state.settings, ctx.catalogs).map((t) => t.id)); // tools the sim doesn't offer aren't timed
  const name = (id) => ctx.catalogs?.assessmentTools?.tools.find((t) => t.id === id)?.name.replace(/ \(.*\)$/, '') || id;
  for (const [pid, ps] of Object.entries(state.patients)) {
    for (const o of ctx.templatesById[pid]?.orders || []) {
      const os = ps.orders[o.id];
      const tools = (o.assessment?.tools || []).filter((id) => offered.has(id));
      if (!tools.length || !os) continue;
      const done = entriesFor(state.log, pid).filter((l) => l.action === 'assessment' && tools.includes(l.details.toolId));
      let next = 0;
      const doses = entriesFor(state.log, pid).filter((l) => l.action === 'med' && l.details.orderId === o.id && l.details.result === 'given').map((l) => l.simMin);
      for (const due of assessmentDueTimes(o, os, ctx.simMin, th, doses)) {
        while (next < done.length && done[next].simMin < due - (th.earlyWindowMin ?? 30)) next++;
        const a = done[next];
        if (a) next++;
        out.push(item({ kind: 'assessment', patientId: pid, label: `${tools.map(name).join(' / ')} (${o.text})`, tier: o.tier, orderId: o.id, tools, doneBy: a?.userId ?? null, logId: a?.id }, due, a?.simMin ?? null, ctx.simMin, th));
      }
    }
  }
  return out;
}

/** Delegated tasks that waited in the queue for a free helper: from queued to started (rules.timeliness.delegationQueue). */
function queueItems(state, ctx, cfg) {
  const th = cfg.delegationQueue;
  if (!th) return [];
  const label = (t) => (t.assessmentToolId ? ctx.catalogs?.assessmentTools?.tools.find((x) => x.id === t.assessmentToolId)?.name : ctx.catalogs?.interventions?.interventions.find((i) => i.id === t.interventionId)?.label) || t.interventionId;
  return Object.entries(state.patients).flatMap(([pid, ps]) => (ps.delegations || []).filter((t) => t.queuedAt != null)
    .map((t) => item({ kind: 'delegation', patientId: pid, label: `Waiting for a ${t.to}: ${label(t)}`, doneBy: t.helperId ?? null }, t.queuedAt, t.status === 'queued' ? null : t.startedAt, ctx.simMin, th)));
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
// Memo: the session state is immutable (every change makes a new object), so items for (state, minute) never change.
// One render calls this many times (several rules, the command center, the debrief); the soak test showed it adds up.
const memo = new WeakMap();
export function timelinessItems(fullState, ctx) {
  const hit = memo.get(fullState);
  if (hit && hit.simMin === ctx.simMin && hit.templates === ctx.templatesById && hit.catalogs === ctx.catalogs) return hit.items;
  const items = computeItems(fullState, ctx);
  memo.set(fullState, { simMin: ctx.simMin, templates: ctx.templatesById, catalogs: ctx.catalogs, items });
  return items;
}

function computeItems(fullState, ctx) {
  const state = withoutStruck(fullState); // "entered in error" work doesn't count as done
  const cfg = timelinessConfig(state, ctx.catalogs);
  return [...orderItems(state, ctx, cfg), ...medItems(state, ctx, cfg), ...assessmentItems(state, ctx, cfg), ...queueItems(state, ctx, cfg), ...callLightItems(state, ctx, cfg), ...alarmItems(state, ctx, cfg)];
}

/**
 * Required reassessments coming due for some patients (the student's busy banner): the same timeliness items, looked at
 * `horizonMin` ahead, that aren't done yet. [{ label, tools, patientId, dueAt, inMin (negative = overdue) }], soonest first.
 */
export function upcomingReassessments(fullState, ctx, pids, { horizonMin = 60, limit = 3 } = {}) {
  const ahead = timelinessItems(fullState, { ...ctx, simMin: ctx.simMin + horizonMin });
  return ahead.filter((i) => i.kind === 'assessment' && i.doneAt == null && pids.includes(i.patientId))
    .map((i) => ({ label: i.label.replace(/ \(.*$/, ''), tools: i.tools, patientId: i.patientId, dueAt: i.startAt, inMin: round2(i.startAt - ctx.simMin) }))
    .sort((a, b) => a.dueAt - b.dueAt).slice(0, limit);
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

/**
 * Debrief view for a set of patients: orders, scheduled meds and required reassessments, worst first. After the sim ends, anything
 * still open is "never". summary: { onTime, late, veryLate, never, open, medianTier1Min }.
 */
export function debriefTimeliness(state, pids, ctx) {
  const ended = state.clock.status === 'ended';
  const rows = timelinessItems(state, ctx)
    .filter((i) => (i.kind === 'order' || i.kind === 'med' || i.kind === 'assessment') && pids.includes(i.patientId))
    .map((i) => (ended && i.doneAt == null ? { ...i, tag: 'never' } : i))
    .sort((a, b) => tagRank(b.tag) - tagRank(a.tag) || b.minutes - a.minutes);
  const count = (pred) => rows.filter(pred).length;
  const tier1 = rows.filter((r) => r.kind === 'order' && r.tier === 1 && r.doneAt != null).map((r) => r.minutes).sort((a, b) => a - b);
  const mid = tier1.length ? (tier1.length % 2 ? tier1[(tier1.length - 1) / 2] : (tier1[tier1.length / 2 - 1] + tier1[tier1.length / 2]) / 2) : null;
  return {
    rows,
    summary: {
      onTime: count((r) => r.tag === 'on-time'), late: count((r) => r.tag === 'late'), veryLate: count((r) => r.tag === 'very-late'),
      never: count((r) => r.tag === 'never'), open: count((r) => r.doneAt == null && r.tag !== 'never'), medianTier1Min: mid == null ? null : round2(mid),
    },
  };
}
