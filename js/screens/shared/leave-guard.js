// "You have unsaved changes" protection for screens that hold unsaved work (the patient editor).
// A screen registers a guard while it's mounted; navigation (instructor sub-views, top-level tabs) asks
// canLeave() first, and closing/reloading the page shows the browser's own prompt while it's dirty.

let guard = null; // { isDirty(): boolean, message }

export function setLeaveGuard(g) { guard = g; }
export function clearLeaveGuard(g) { if (guard === g) guard = null; }

/** True if it's OK to navigate away (nothing unsaved, or the user agreed to discard). confirmFn is injectable for tests. */
export function canLeave(confirmFn = (m) => window.confirm(m)) {
  if (!guard || !guard.isDirty()) return true;
  return confirmFn(guard.message || 'You have unsaved changes. Leave and discard them?');
}

/** beforeunload handler: asks the browser to confirm closing/reloading while there's unsaved work. */
export function onBeforeUnload(e) {
  if (guard?.isDirty()) { e.preventDefault(); e.returnValue = ''; }
}
