// Decides which scheduled events are due. Pure, no DOM.
// An "event ref" is { key, patientId, event } where key = `${patientId || 'sim'}:${event.id}`.
// `fired` maps key → number of times fired. Events with no atMin (e.g. trigger: "manual")
// are never auto-fired; they only run via "fire now".

export function eventKey(patientId, eventId) {
  return `${patientId || 'sim'}:${eventId}`;
}

/** All events for a session: every included patient's events + sim-level events. */
export function collectEvents(patientIds, templatesById, scenario) {
  const refs = [];
  for (const pid of patientIds) {
    for (const event of templatesById[pid]?.events || []) refs.push({ key: eventKey(pid, event.id), patientId: pid, event });
  }
  for (const event of scenario.events || []) refs.push({ key: eventKey(null, event.id), patientId: null, event });
  return refs;
}

/** Sim minute of the n-th firing (0-based), or null if that firing doesn't exist / isn't scheduled. */
export function occurrenceAt(event, n) {
  if (typeof event.atMin !== 'number') return null;
  if (n === 0) return event.atMin;
  if (!event.repeatEveryMin) return null;
  if (event.repeatCount != null && n > event.repeatCount) return null; // repeatCount = extra firings after the first
  return event.atMin + n * event.repeatEveryMin;
}

/** Due firings at simMin, in time order (ties keep data order). Each: { ref, at }. */
export function dueEvents(refs, fired, simMin) {
  const due = [];
  refs.forEach((ref, order) => {
    let n = fired[ref.key] || 0;
    for (let at = occurrenceAt(ref.event, n); at != null && at <= simMin; at = occurrenceAt(ref.event, ++n)) {
      due.push({ ref, at, order });
    }
  });
  return due.sort((a, b) => a.at - b.at || a.order - b.order).map(({ ref, at }) => ({ ref, at }));
}

/** Next pending firing time for a ref, or null. */
export function nextAt(ref, fired) {
  return occurrenceAt(ref.event, fired[ref.key] || 0);
}

/** Earliest scheduled event in a list (used to preview a patient's timeline). */
export function firstScheduled(events) {
  return [...events].filter((e) => typeof e.atMin === 'number').sort((a, b) => a.atMin - b.atMin)[0] || null;
}

// ---- Event groups --------------------------------------------------------------------------
// Events with the same `group` (within one patient, or within the scenario's sim-level events)
// are one moment in the story: e.g. a call light + its vitals change + its new findings.
// "Fire now" fires the whole group, so scheduled firing stays in sync (fired counts move together).

/** Refs in the same group as `ref` (same patient + same group), in data order. Just [ref] if ungrouped. */
export function groupMembers(refs, ref) {
  if (!ref.event.group) return [ref];
  return refs.filter((r) => r.patientId === ref.patientId && r.event.group === ref.event.group);
}

/** Data check: members of a group must share timing, or they'd drift apart. Returns error strings. */
export function eventGroupProblems(events, where = '$') {
  const byGroup = new Map();
  for (const e of events || []) {
    if (!e.group) continue;
    if (!byGroup.has(e.group)) byGroup.set(e.group, []);
    byGroup.get(e.group).push(e);
  }
  const problems = [];
  for (const [group, members] of byGroup) {
    const timing = (e) => JSON.stringify([e.atMin ?? null, e.trigger ?? null, e.repeatEveryMin ?? null, e.repeatCount ?? null]);
    if (new Set(members.map(timing)).size > 1) {
      problems.push(`${where}: events in group "${group}" (${members.map((e) => e.id).join(', ')}) must share atMin/trigger/repeat settings`);
    }
  }
  return problems;
}
