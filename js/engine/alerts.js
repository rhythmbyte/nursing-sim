// Alerts raised by events (shown to students and/or the instructor). No DOM.
// Alert: { id, simMin, patientId, kind, message, audience: ['student'|'instructor'|'charge'] }

export function addAlert(draft, { simMin, patientId = null, kind, message, audience = ['student', 'instructor'] }) {
  const alert = { id: `a${draft.alerts.length + 1}`, simMin, patientId, kind, message, audience };
  draft.alerts.push(alert);
  return alert;
}
