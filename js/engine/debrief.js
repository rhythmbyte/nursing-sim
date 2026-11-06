// Builds the debrief for one student from the session. Pure, no DOM (the screen only renders it).
// ctx: { templatesById, catalogs, simMin, studentIdsForGroup(groupId), groupOfStudent(userId) }

import { round2 } from './time.js';
import { evaluateRules } from './rules/index.js';
import { isTracked, ruleConfig } from './rules/helpers.js';
import { conditionMetAt, requiredActionAt } from './rules/parameter-breach.js';
import { firstWork } from './orders.js';
import { vitalNumber } from './vitals.js';
import { activeScale, priorityTimeline } from './priority.js';
import { withoutStruck } from './struck.js';
import { alarmEpisodes } from './monitor-alarms.js';
import { debriefTimeliness } from './timeliness.js';
import { stateTimeline, penaltyTimeline } from './reactions/view.js';
import { assessmentRows } from './assessment-review.js';
import { taskReview } from './task-review.js';


// Words too common to count as a match between a reflection and a "should recognize" item.
const STOP = new Set(['should', 'their', 'there', 'about', 'which', 'would', 'could', 'patient', 'patients', 'student', 'students', 'before', 'after', 'while', 'these', 'those', 'other', 'appropriate', 'recognize', 'condition', 'change']);
const words = (text) => [...new Set(String(text).toLowerCase().match(/[a-z][a-z-]{4,}/g) || [])].filter((w) => !STOP.has(w));

/**
 * Which "should recognize" items the reflection may mention: keyword overlap (2+ words, or one word of 8+
 * letters). A reading aid for the instructor, NOT a grade.
 */
export function reflectionCoverage(answers, items) {
  const said = new Set(words(Object.values(answers || {}).join(' ')));
  return items.map((item) => {
    const hits = words(item).filter((w) => said.has(w));
    return { item, words: hits, mentioned: hits.length >= 2 || hits.some((w) => w.length >= 8) };
  });
}

function responseTimes(state, pids, ctx) {
  const lights = [];
  const params = [];
  const codes = [];
  for (const pid of pids) {
    const answered = state.log.filter((l) => l.patientId === pid && l.action === 'call-light-answered');
    // Repeats of a lit light ring the same light, so pair each answer with the light it closed.
    for (const a of answered) lights.push({ patientId: pid, litAtMin: a.details.litAtMin, answeredAtMin: a.simMin, responseMin: a.details.responseMin, by: a.userId });
    const light = state.patients[pid].callLight;
    if (light) lights.push({ patientId: pid, litAtMin: light.since, answeredAtMin: null, responseMin: null, openMin: round2(ctx.simMin - light.since) });

    const t = ctx.templatesById[pid];
    for (const o of t.orders) {
      if (o.type !== 'parameter' || !o.parameter || !state.patients[pid].orders[o.id]) continue;
      const met = conditionMetAt(state, pid, o, t);
      if (met == null) continue;
      const done = requiredActionAt(state, pid, o, met);
      params.push({ patientId: pid, order: o.text, metAtMin: met, actionAtMin: done?.simMin ?? null, responseMin: done ? round2(done.simMin - met) : null,
        windowMin: o.parameter.withinMin, pending: !done && ctx.simMin <= met + o.parameter.withinMin });
    }

    const code = state.patients[pid].code;
    if (code) {
      const ids = ctx.catalogs?.rules?.codeResponse?.interventionIds || [];
      const first = state.log.find((l) => l.patientId === pid && l.action === 'intervention' && ids.includes(l.details.interventionId) && l.simMin >= code.startedMin);
      codes.push({ patientId: pid, startedAtMin: code.startedMin, firstResponseAtMin: first?.simMin ?? null, responseMin: first ? round2(first.simMin - code.startedMin) : null });
    }
  }
  const alarms = pids.flatMap((pid) => alarmEpisodes(state.log, pid).map((e) => ({ patientId: pid, startedAtMin: e.start, ackAtMin: e.ack, clearedAtMin: e.end, alarms: e.alarms, responseMin: e.ack != null ? round2(e.ack - e.start) : null })));
  return { callLights: lights.sort((a, b) => a.litAtMin - b.litAtMin), parameters: params, codes, alarms };
}

function orderSequences(state, pids, ctx) {
  const cfg = ruleConfig(state, ctx, 'priority-order');
  const out = [];
  for (const pid of pids) {
    const ps = state.patients[pid];
    const tracked = ctx.templatesById[pid].orders.filter((o) => ps.orders[o.id] && isTracked(o, cfg));
    const sets = [...new Set(tracked.map((o) => o.orderSet))];
    for (const set of sets) {
      const orders = tracked.filter((o) => o.orderSet === set);
      if (orders.length < 2) continue;
      const correct = [...orders].sort((a, b) => a.tier - b.tier); // stable: data order within a tier
      const withWork = orders.map((o) => ({ o, work: firstWork(state, pid, o) }));
      const done = withWork.filter((x) => x.work).sort((a, b) => a.work.simMin - b.work.simMin)
        .map((x) => ({ id: x.o.id, text: x.o.text, tier: x.o.tier, atMin: x.work.simMin }));
      const open = withWork.filter((x) => !x.work).map((x) => ({ id: x.o.id, text: x.o.text, tier: x.o.tier }));
      out.push({ patientId: pid, orderSet: set, correct: correct.map((o) => ({ id: o.id, text: o.text, tier: o.tier })), done, open });
    }
  }
  return out;
}

function vitalsCompare(state, userId, ctx) {
  const tolerance = ctx.catalogs?.rules?.vitalsCompare?.tolerance || {};
  const rows = [];
  for (const l of state.log) {
    if (l.userId !== userId || !l.details?.scripted) continue;
    const charted = l.details.fields || l.details.values || {};
    for (const key of Object.keys(tolerance)) {
      if (charted[key] == null || l.details.scripted[key] == null) continue;
      const c = vitalNumber(charted, key);
      const s = vitalNumber(l.details.scripted, key);
      const differs = c == null || s == null ? String(charted[key]) !== String(l.details.scripted[key]) : Math.abs(c - s) > tolerance[key];
      rows.push({ patientId: l.patientId, atMin: l.simMin, field: key, charted: charted[key], scripted: l.details.scripted[key], differs });
    }
  }
  return rows;
}

function timeline(state, userId, pids, flags) {
  const mine = new Set(pids);
  const byLog = new Map();
  for (const f of flags) for (const id of f.logIds) byLog.set(id, [...(byLog.get(id) || []), f]);
  const items = state.log
    .filter((l) => l.userId === userId || (mine.has(l.patientId) && l.role !== 'student'))
    .map((l) => ({ kind: l.userId === userId ? 'action' : 'context', atMin: l.simMin, entry: l, flags: byLog.get(l.id) || [] }));
  for (const f of flags) if (!f.logIds.length) items.push({ kind: 'flag', atMin: f.atMin, entry: null, flags: [f] });
  return items.sort((a, b) => a.atMin - b.atMin);
}

export function buildDebrief(fullState, userId, ctx) {
  // Comparisons ignore struck entries; the timeline (below) still shows them, marked.
  const state = withoutStruck(fullState);
  const groupId = ctx.groupOfStudent(userId);
  const pids = Object.entries(state.patients).filter(([, ps]) => ps.groupId === groupId).map(([pid]) => pid);
  const flags = evaluateRules(state, ctx).filter((f) => f.userIds.includes(userId));
  const handoff = state.students[userId]?.handoff || {};
  return {
    userId,
    groupId,
    patientIds: pids,
    flags,
    counts: { red: flags.filter((f) => f.severity === 'red').length, amber: flags.filter((f) => f.severity === 'amber').length },
    responseTimes: responseTimes(state, pids, ctx),
    orderSequences: orderSequences(state, pids, ctx),
    vitalsCompare: vitalsCompare(state, userId, ctx),
    handoffs: pids.filter((pid) => handoff[pid]).map((pid) => ({ patientId: pid, ...handoff[pid],
      durationMin: handoff[pid].closedAt != null ? round2(handoff[pid].closedAt - handoff[pid].openedAt) : null })),
    timeliness: debriefTimeliness(fullState, pids, ctx),
    tasks: taskReview(fullState, userId, pids, ctx),
    assessments: (() => { const t = debriefTimeliness(fullState, pids, ctx); return { rows: assessmentRows(fullState, ctx, pids), reassess: t.rows.filter((r) => r.kind === 'assessment') }; })(),
    scripts: pids.filter((pid) => fullState.patients[pid].script && ctx.templatesById[pid]?.script).map((pid) => ({ patientId: pid, rows: stateTimeline(fullState, pid, ctx.templatesById[pid], ctx.catalogs), penalties: penaltyTimeline(fullState, pid, ctx.templatesById[pid], ctx.catalogs), ownRanges: ctx.templatesById[pid]?.normalRanges || null })),
    reflection: fullState.reflections?.[userId] || null,
    reflectionCoverage: fullState.reflections?.[userId] ? pids.map((pid) => {
      const d = ctx.templatesById[pid].debrief || {};
      return { patientId: pid, items: reflectionCoverage(fullState.reflections[userId].answers, [...(d.shouldRecognize || []), ...Object.values(d.byChange || {}).flat()]) };
    }).filter((p) => p.items.length) : [],
    priorities: pids.filter((pid) => state.patients[pid].present).map((pid) => ({
      patientId: pid, segments: priorityTimeline(state, userId, pid, activeScale(state.settings, ctx.catalogs), ctx.simMin),
    })),
    // Patient-level items plus each scenario change's notes (debrief.byChange, written in the change builder).
    shouldRecognize: pids.map((pid) => {
      const d = ctx.templatesById[pid].debrief || {};
      return { patientId: pid, items: [...(d.shouldRecognize || []), ...Object.values(d.byChange || {}).flat()] };
    }),
    timeline: timeline(fullState, userId, pids, flags).map((t) => (t.entry && fullState.struck?.[t.entry.id] ? { ...t, struck: fullState.struck[t.entry.id] } : t)),
  };
}
