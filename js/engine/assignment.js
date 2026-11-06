// Group/student assignment. No DOM.
// Phase 2 interim: student tab N fills the Nth open slot across groups, in order.
// Phase 6 replaces this with join codes, manual placement, and the randomizer (SPEC §10).

/** [{ slot: 1, groupId: 'g1', groupName }] — one entry per student slot in the scenario. */
export function studentSlots(scenario) {
  const slots = [];
  for (const g of scenario?.groups || []) {
    for (let i = 0; i < g.studentCount; i++) slots.push({ slot: slots.length + 1, groupId: g.id, groupName: g.name });
  }
  return slots;
}

/** userIds of the students in a group (interim mapping above). */
export function studentIdsForGroup(scenario, groupId) {
  return studentSlots(scenario).filter((s) => s.groupId === groupId).map((s) => `student-${s.slot}`);
}

/** Group of a student userId (interim mapping above), or null. */
export function groupOfStudent(scenario, userId) {
  const n = Number(/^student-(\d+)$/.exec(userId)?.[1]);
  return studentSlots(scenario).find((s) => s.slot === n)?.groupId ?? null;
}
