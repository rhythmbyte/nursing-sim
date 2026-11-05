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
