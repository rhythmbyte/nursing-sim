// "Entered in error" support. Rules, PRN checks and debrief comparisons use the active log (struck entries
// removed); the debrief timeline still shows struck entries, marked. Pure.

/** The log without struck entries (and without the strike records themselves). */
export function activeLog(state) {
  if (!state.struck || !Object.keys(state.struck).length) return state.log;
  return state.log.filter((l) => !state.struck[l.id] && l.action !== 'entered-in-error');
}

/** State as rules should see it. */
export function withoutStruck(state) {
  const log = activeLog(state);
  return log === state.log ? state : { ...state, log };
}
