// Groups, join codes, student placement, tag-count patient fill (SPEC §10). Pure, no DOM; randomness
// comes from an injected rng() (Math.random in the app, seeded in tests).
//
// Roster (session state): roster[userId] = { name, groupId, joinedAtMin }.
// - Manual: scenario.manualStudents[groupId] lists names; a joining name must match one (case-insensitive).
// - Random: placed into a random group that still has open slots; a full group is never over-filled.
// - More students than slots: the join is refused and the instructor is alerted.

import { matchesTags, mergeFilters } from './patient-tags.js';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function generateJoinCode(rng = Math.random, length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

/** One entry per student tab in the prototype: [{ slot: 1, userId: 'student-1' }]. */
export function studentSlots(scenario) {
  const n = (scenario?.groups || []).reduce((sum, g) => sum + g.studentCount, 0);
  return Array.from({ length: Math.max(1, n) }, (_, i) => ({ slot: i + 1, userId: `student-${i + 1}` }));
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Where a joining student goes. Returns { groupId } or { error }.
 * roster: current roster; scenario: groups (+ manualStudents when assignment is manual).
 */
export function placeStudent(roster, scenario, name, rng = Math.random) {
  const taken = Object.values(roster);
  if (!norm(name)) return { error: 'Enter your name.' };
  if (taken.some((r) => norm(r.name) === norm(name))) return { error: `${name} has already joined.` };
  const count = (gid) => taken.filter((r) => r.groupId === gid).length;

  if (scenario.assignment === 'manual') {
    const entry = Object.entries(scenario.manualStudents || {}).find(([, names]) => names.some((n) => norm(n) === norm(name)));
    if (!entry) return { error: `${name} isn't on this sim's roster. Ask your instructor.` };
    return { groupId: entry[0] };
  }
  const open = scenario.groups.filter((g) => count(g.id) < g.studentCount);
  if (!open.length) return { error: 'All groups are full.', overflow: true };
  return { groupId: open[Math.floor(rng() * open.length)].id };
}

/**
 * Tag-count fill: for each group with tagCounts, pick that many library patients per tag, never reusing
 * a patient across groups (explicitly listed patients are reserved first). Returns { groups, warnings }.
 */
/**
 * groups[].tagCounts { red: n, … } are filled from the library at random (no patient twice). Patient tags filter the
 * pool first: `filter` for the whole sim, merged with a group's own g.tagFilter (engine/patient-tags.js).
 */
export function fillByTagCounts(groups, library, rng = Math.random, filter = {}) {
  const used = new Set(groups.flatMap((g) => [...(g.patients || []), ...(g.admissions || [])]));
  const warnings = [];
  const out = groups.map((g) => {
    if (!g.tagCounts) return g;
    const picked = [];
    for (const [tag, n] of Object.entries(g.tagCounts)) {
      const pool = library.filter((p) => p.tag === tag && !used.has(p.id) && matchesTags(p, mergeFilters(filter, g.tagFilter)));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const take = pool.slice(0, n);
      if (take.length < n) warnings.push(`${g.name}: wanted ${n} ${tag}, only ${take.length} unused patient${take.length === 1 ? '' : 's'} match${take.length === 1 ? 'es' : ''} the patient tags.`);
      take.forEach((p) => { used.add(p.id); picked.push(p.id); });
    }
    const { tagCounts, tagFilter, ...rest } = g;
    return { ...rest, patients: [...(g.patients || []), ...picked], filledFrom: tagCounts };
  });
  return { groups: out, warnings };
}

/** userIds of joined students in a group. */
export function studentIdsForGroup(roster, groupId) {
  return Object.entries(roster || {}).filter(([, r]) => r.groupId === groupId).map(([id]) => id);
}

export function groupOfStudent(roster, userId) {
  return roster?.[userId]?.groupId ?? null;
}
