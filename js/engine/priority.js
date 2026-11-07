// Student-assigned priorities and instructor tag history. Pure, no DOM.
//
// - Instructor tags (patient data `tag`, changed by codes/ROSC) are the answer key: patients[id].tag and
//   patients[id].tagHistory [{ atMin, tag }]. Who may SEE them is settings.showTagsTo (canSeeInstructorTags).
// - Students (and a student charge nurse) assign their own priority on the scale settings.priorityScale
//   (data/catalogs/priority-scales.json). History: state.priorities[userId][patientId] = [{ atMin, levelId }].
// - A level "matches" the instructor tag if the tag is in level.matchesTags (so non-color scales such as
//   ESI 1–5 can be added later as data only).

import { cloneState } from './clone.js';
import { simMinOf } from './session.js';
import { append } from './log.js';

/** Can a viewer in this role see the instructor's triage tags? ('instructor' | 'student' | 'charge') */
export function canSeeInstructorTags(settings, viewerRole) {
  return (settings?.showTagsTo || []).includes(viewerRole);
}

export function activeScale(settings, catalogs) {
  const scale = catalogs?.priorityScales?.scales?.[settings?.priorityScale];
  if (!scale) throw new Error(`Unknown priority scale "${settings?.priorityScale}" (data/catalogs/priority-scales.json)`);
  return scale;
}

/** Data check for the scales catalog (the generic validator can't check map values). */
export function scaleProblems(catalog) {
  const problems = [];
  for (const [id, sc] of Object.entries(catalog?.scales || {})) {
    if (!sc.label) problems.push(`scales.${id}: missing label`);
    if (!['levels', 'rank'].includes(sc.type)) problems.push(`scales.${id}: type must be levels or rank`);
    if (!Array.isArray(sc.levels) || !sc.levels.length) { problems.push(`scales.${id}: needs levels`); continue; }
    const ids = sc.levels.map((l) => l.id);
    if (new Set(ids).size !== ids.length) problems.push(`scales.${id}: duplicate level ids`);
    sc.levels.forEach((l, i) => {
      if (!l.id || !l.label) problems.push(`scales.${id}.levels[${i}]: needs id and label`);
      if (!Array.isArray(l.matchesTags) || l.matchesTags.some((t) => !['red', 'yellow', 'green', 'black'].includes(t))) problems.push(`scales.${id}.levels[${i}]: matchesTags must list instructor tags`);
      if (!l.symbol) problems.push(`scales.${id}.levels[${i}]: needs a symbol (color-blind safe)`);
    });
  }
  return problems;
}

/** Records an instructor tag change on a patient (draft). */
export function setInstructorTag(ps, tag, atMin) {
  if (ps.tag === tag) return;
  ps.tag = tag;
  ps.tagHistory.push({ atMin, tag });
}

/** A student (or student charge nurse) assigns their priority for a patient. Logged with sim time. */
export function assignPriority(state, patientId, { levelId }, { now, user, catalogs }) {
  const scale = activeScale(state.settings, catalogs);
  if (scale.type !== 'levels') throw new Error(`Scale type "${scale.type}" isn't supported yet`);
  if (!scale.levels.some((l) => l.id === levelId)) throw new Error(`Unknown level "${levelId}"`);
  if (!state.patients[patientId]) throw new Error(`Unknown patient ${patientId}`);
  const history = state.priorities?.[user.userId]?.[patientId] || [];
  if (history.at(-1)?.levelId === levelId) return state;
  const draft = cloneState(state);
  const simMin = simMinOf(state, now);
  draft.priorities[user.userId] ??= {};
  (draft.priorities[user.userId][patientId] ??= []).push({ atMin: simMin, levelId });
  append(draft, { simMin, wallTime: now, ...user, patientId, action: 'priority-assigned', details: { levelId, scale: state.settings.priorityScale } });
  return draft;
}

export function currentPriority(state, userId, patientId) {
  return state.priorities?.[userId]?.[patientId]?.at(-1)?.levelId ?? null;
}

/** Instructor tag at a sim minute (from tagHistory). */
export function tagAt(ps, simMin) {
  let tag = ps.tagHistory[0]?.tag ?? ps.tag;
  for (const h of ps.tagHistory) if (h.atMin <= simMin) tag = h.tag;
  return tag;
}

/**
 * Comparison timeline for one student and patient, up to simMin: segments where the student's level
 * matches or not: [{ fromMin, toMin, levelId, tag, match }] (levelId null = not yet assigned).
 */
export function priorityTimeline(state, userId, patientId, scale, simMin) {
  const ps = state.patients[patientId];
  const mine = state.priorities?.[userId]?.[patientId] || [];
  const start = ps.arrivedAtMin ?? 0;
  const points = [...new Set([start, ...ps.tagHistory.map((h) => h.atMin), ...mine.map((m) => m.atMin)])]
    .filter((t) => t >= start && t <= simMin).sort((a, b) => a - b);
  const levelAt = (t) => { let l = null; for (const m of mine) if (m.atMin <= t) l = m.levelId; return l; };
  const byId = Object.fromEntries(scale.levels.map((l) => [l.id, l]));
  return points.map((t, i) => {
    const levelId = levelAt(t);
    const tag = tagAt(ps, t);
    return { fromMin: t, toMin: points[i + 1] ?? simMin, levelId, tag, match: levelId ? byId[levelId].matchesTags.includes(tag) : null };
  });
}
