// Shared display labels.

import { codeName } from '../../engine/cases.js';

/** "Rm 204 Linda Garcia" for a patient template. */
export const patientLabel = (t) => `Rm ${t.demographics.room} ${t.demographics.name}`;

/** INSTRUCTOR screens only: "Rm 201 (C1) Robert Miller" (the case code; a fixed patient: patientLabel). Never on student screens. */
export const instructorPatientLabel = (t) => `Rm ${t.demographics.room} ${codeName(t)}`;
