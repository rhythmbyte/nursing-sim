// findings-change: queues new assessment findings (findings.changes[eventId === payload.change]).
// They're revealed to the student the next time they chart an assessment (phase 3).

export default {
  type: 'findings-change',
  apply(draft, event, { patientId, template }) {
    const change = template.findings.changes?.find((c) => c.eventId === event.payload.change);
    if (!change) {
      console.warn(`findings-change ${event.id}: no findings change "${event.payload.change}"`);
      return;
    }
    const ps = draft.patients[patientId];
    if (!ps.findingChanges.includes(change.eventId)) ps.findingChanges.push(change.eventId);
  },
  describe: (event) => `New findings (${event.payload.change})`,
};
