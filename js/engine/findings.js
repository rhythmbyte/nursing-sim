// Assessment findings: copied into session state when revealed (B11: student screens never read
// the template's findings). No DOM.

/** Copies baseline + any fired finding changes into patients[id].revealed. Mutates draft. */
export function revealFindings(draft, patientId, template, simMin) {
  const ps = draft.patients[patientId];
  const shown = new Set(ps.revealed.map((r) => r.source));
  if (!shown.has('baseline')) ps.revealed.push({ source: 'baseline', atMin: simMin, findings: [...template.findings.baseline] });
  for (const eventId of ps.findingChanges) {
    if (shown.has(eventId)) continue;
    const change = template.findings.changes?.find((c) => c.eventId === eventId);
    if (change) ps.revealed.push({ source: eventId, atMin: simMin, findings: [...change.findings] });
  }
}
