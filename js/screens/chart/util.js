// Small helpers shared by chart sections (display only, no sim rules).

import { formatShiftTime } from '../../engine/time.js';

export const at = (state, min) => formatShiftTime(state.startClock, min);

/** Log entries for one patient, newest first, optionally filtered by action(s). */
export function patientLog(state, pid, actions = null) {
  const set = actions ? new Set([].concat(actions)) : null;
  return state.log.filter((l) => l.patientId === pid && (!set || set.has(l.action))).reverse();
}

/** "Student 1" / "Student 1 → CNA" for who charted an entry. */
export function byWhom(entry) {
  const who = entry.userId.replace(/^student-(\d+)$/, 'Student $1').replace(/^instructor$/, 'Instructor');
  return entry.details?.delegatedTo ? `${who} → ${entry.details.delegatedTo}` : who;
}

const FIELD_LABELS = {
  bp: 'BP', hr: 'HR', rr: 'RR', tempF: 'Temp (°F)', spo2: 'SpO₂ (%)', o2: 'O₂', gcs: 'GCS', lpm: 'L/min',
  targetSpo2: 'Target SpO₂', capRefill: 'Cap refill', volumeMl: 'Volume (mL)', intakeMl: 'Intake (mL)',
  outputMl: 'Output (mL)', returnMl: 'Return (mL)', mgdl: 'Glucose (mg/dL)', kg: 'Weight (kg)',
  intervalMin: 'Interval (min)', sbar: 'SBAR', criteriaMet: 'Criteria met',
};

/** chartField id → label ("capRefill" → "Cap refill"). */
export function fieldLabel(id) {
  return FIELD_LABELS[id] || id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export const ORDER_STATUS = { new: 'New', acknowledged: 'Active', done: 'Done' };
