// Vitals: monitor cycle + charted vitals → patients[id].flowsheet. No DOM.
// Flowsheet row: { atMin, source: 'prior' | 'monitor' | 'charted' | 'delegated', values, by }
//
// Which fields come from the monitor vs. are measured by hand is DATA: data/catalogs/vitals.json
// (`vcat` below = catalogs.vitals). Monitor fields are never typed by students.
// - Manual scripted fields (temp, RR, pain): if settings.revealManualVitals the student can "Measure"
//   them; otherwise they come from the manikin/instructor. Either way the log keeps the scripted values
//   (`details.scripted`) for the debrief. Student screens never show `scripted`.

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] != null && obj[k] !== '').map((k) => [k, obj[k]]));

/** What "Measure" shows: scripted manual vitals if the scenario reveals them, else nothing. */
export function measureManual(state, patientId, vcat) {
  if (!state.settings.revealManualVitals) return {};
  return pick(state.patients[patientId].vitals, vcat.manualScriptedFields);
}

/** Device values for an intervention's chart fields (monitor fields it lists, plus O₂ device with SpO₂). */
export function deviceValues(ps, fields, vcat) {
  const keys = vcat.monitorFields.filter((k) => fields.includes(k) || (k === 'o2' && fields.includes('spo2')));
  return pick(ps.vitals, keys);
}

export function scriptedSnapshot(ps, vcat) {
  return pick(ps.vitals, [...vcat.monitorFields, ...vcat.manualScriptedFields]);
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
  apply(draft, upto, { catalogs }) {
    for (const ps of Object.values(draft.patients)) {
      const m = ps.monitor;
      if (!m) continue;
      for (let at = nextReadingAt(m); at <= upto; at = nextReadingAt(m)) {
        ps.flowsheet.push({ atMin: at, source: 'monitor', values: pick(ps.vitals, catalogs.vitals.monitorFields), by: 'Monitor' });
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
