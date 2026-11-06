// Student view of a patient template: drops instructor-only and not-yet-revealed fields.
//
// ⚠ UI CONVENIENCE ONLY — NOT SECURITY. The full patient JSON is still downloaded by the browser
// and readable in dev tools. This only keeps student screens from rendering answer-key content
// by accident. Real protection = server-side filtering in the full build (SPEC §13).
//
// Allow-list (not deny-list), so new instructor-only fields stay hidden by default.

const ORDER_FIELDS = ['id', 'text', 'type', 'orderSet', 'med', 'prn', 'frequencyMin', 'dueAtMin', 'interventionIds', 'labCodes', 'activeFromMin', 'activeOnEvent'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

export function studentView(t, { showTags = false } = {}) {
  return {
    id: t.id,
    demographics: { ...t.demographics },
    admittingDx: t.admittingDx,
    codeStatus: t.codeStatus,
    allergies: t.allergies.map((a) => ({ ...a })),
    allergyText: t.allergyText,
    hpi: t.hpi,
    pmh: [...(t.pmh || [])],
    homeMeds: (t.homeMeds || []).map((m) => ({ ...m })),
    handoff: t.handoff ? pick(t.handoff, ['situation', 'background', 'assessment', 'recommendation']) : null,
    vitalsBaseline: { ...t.vitals.baseline },
    // No findings here: the engine copies findings into session state when the student assesses.
    labNote: t.labNote,
    orders: t.orders.map((o) => pick(o, ORDER_FIELDS)),
    ...(showTags ? { tag: t.tag } : {}),
  };
}

