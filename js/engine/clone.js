// Copying the session for a change (pure, no DOM). Every engine transition works on a copy, but the log is append-only
// (entries are frozen when written, engine/log.js), so its entries are shared and only the array is copied. The log
// is most of a long sim's state, so this keeps actions and ticks fast at 60 patients (tests/browser/soak-large.mjs).

export function cloneState(state) {
  const { log, ...rest } = state;
  const draft = structuredClone(rest);
  draft.log = log ? log.slice() : [];
  return draft;
}
