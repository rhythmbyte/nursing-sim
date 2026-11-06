// Event-type and flag-rule registries. No DOM.
// Event type: { type, apply(draft, event, ctx), describe(event) }
//   apply MUTATES `draft` (a fresh copy of session state made by the session for this firing).
//   ctx = { simMin, patientId, template }  (template = the patient's JSON, or null for sim-level events)
// Rule: { id, label, evaluate(state, ctx) → flags[] }  (see engine/rules/index.js)

const eventTypes = new Map();
const rules = new Map();

export function registerEventType(def) {
  if (!def?.type || typeof def.apply !== 'function') throw new Error('Event type needs { type, apply }');
  if (eventTypes.has(def.type)) throw new Error(`Event type already registered: ${def.type}`);
  eventTypes.set(def.type, def);
}

export function getEventType(type) {
  return eventTypes.get(type) || null;
}

export function registerRule(def) {
  if (!def?.id || typeof def.evaluate !== 'function') throw new Error('Rule needs { id, evaluate }');
  if (rules.has(def.id)) throw new Error(`Rule already registered: ${def.id}`);
  rules.set(def.id, def);
}

export function allRules() {
  return [...rules.values()];
}
