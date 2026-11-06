// Shared display labels.

import { caseLabel } from '../../engine/cases.js';

/** "Rm 204 Linda Garcia" for a patient template. */
export const patientLabel = (t) => `Rm ${t.demographics.room} ${t.demographics.name}`;

/** INSTRUCTOR screens only: "Rm 201 · Cardiac 1 — Robert Miller, 68M, atorvastatin" (a fixed patient: patientLabel). */
export const instructorPatientLabel = (t) => (t?.instance ? `Rm ${t.demographics.room} · ${caseLabel(t)}` : patientLabel(t));
