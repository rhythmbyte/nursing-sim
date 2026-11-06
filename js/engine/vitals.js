// Vitals: monitor cycle + charted vitals → patients[id].flowsheet. No DOM.
// Flowsheet row: { atMin, source: 'prior' | 'monitor' | 'charted' | 'delegated', values, by }
//
// - Monitor values (BP, HR, SpO₂, O₂) always come from the device: the patient's current vitals.
// - Temp, RR, pain are "manual" vitals. If settings.revealManualVitals (default true) the student can
//   "Measure" them (current scripted values); if false they come from the manikin/instructor.
//   Either way the log entry stores the scripted values at that moment (`details.scripted`) so the
//   debrief can compare charted vs scripted. Student screens never show `scripted`.

export const MONITOR_KEYS = ['bp', 'hr', 'spo2', 'o2'];
export const SCRIPTED_MANUAL_KEYS = ['tempF', 'rr', 'pain'];
export const OTHER_MANUAL_KEYS = ['gcs', 'glucose', 'intakeMl', 'outputMl', 'weightKg', 'neuro'];
export const MONITOR_CYCLES = [0, 5, 10, 15];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] != null && obj[k] !== '').map((k) => [k, obj[k]]));

export function revealsManualVitals(settings) {
  return settings?.revealManualVitals !== false;
}

/** What "Measure" shows for manual vitals: scripted temp/RR/pain if revealed, else nothing. */
export function measureManual(state, patientId) {
  if (!revealsManualVitals(state.settings)) return {};
  return pick(state.patients[patientId].vitals, SCRIPTED_MANUAL_KEYS);
}

/** Device values for the given chart fields (adds O₂ device alongside SpO₂). */
export function deviceValues(ps, fields) {
  const keys = MONITOR_KEYS.filter((k) => fields.includes(k) || (k === 'o2' && fields.includes('spo2')));
  return pick(ps.vitals, keys);
}

export function scriptedSnapshot(ps) {
  return pick(ps.vitals, [...MONITOR_KEYS, ...SCRIPTED_MANUAL_KEYS]);
}

export function initFlowsheet(template) {
  return [{ atMin: 0, source: 'prior', values: { ...template.vitals.baseline }, by: 'Prior shift' }];
}

function nextReadingAt(m) {
  return m.fromMin + m.count * m.intervalMin;
}

/** Tick processor: adds monitor readings due up to `upto`, each with the vitals current at that point. */
export const monitorProcessor = {
  due(state, upto) {
    return Object.values(state.patients).some((ps) => ps.monitor && nextReadingAt(ps.monitor) <= upto);
  },
  apply(draft, upto) {
    for (const ps of Object.values(draft.patients)) {
      const m = ps.monitor;
      if (!m) continue;
      for (let at = nextReadingAt(m); at <= upto; at = nextReadingAt(m)) {
        ps.flowsheet.push({ atMin: at, source: 'monitor', values: pick(ps.vitals, MONITOR_KEYS), by: 'Monitor' });
        m.count += 1;
      }
    }
  },
};

/**
 * The patient's scripted vitals over time: [{ atMin, values }], baseline first, then each fired
 * vitals-change (from the log) merged in. Used by the parameter-breach rule.
 */
export function vitalsTimeline(state, patientId, template) {
  const timeline = [{ atMin: 0, values: { ...template.vitals.baseline } }];
  let current = { ...template.vitals.baseline };
  const byEvent = Object.fromEntries(template.events.map((e) => [e.id, e]));
  for (const l of state.log) {
    if (l.patientId !== patientId || l.action !== 'event-fired' || l.details.type !== 'vitals-change') continue;
    const kfId = byEvent[l.details.eventId]?.payload?.keyframe;
    const kf = template.vitals.keyframes?.find((k) => k.eventId === kfId);
    if (!kf) continue;
    current = { ...current, ...kf.values };
    timeline.push({ atMin: l.simMin, values: current });
  }
  return timeline;
}

/** Numeric reading of a vitals field for comparisons: sbp/dbp from "bp", leading number of pain, etc. */
export function vitalNumber(values, field) {
  if (field === 'sbp' || field === 'dbp') {
    const m = /^(\d+)\/(\d+)/.exec(String(values.bp ?? ''));
    return m ? Number(field === 'sbp' ? m[1] : m[2]) : null;
  }
  const n = parseFloat(String(values[field] ?? ''));
  return Number.isFinite(n) ? n : null;
}
