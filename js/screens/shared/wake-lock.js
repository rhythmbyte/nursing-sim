// Keeps the screen awake while a sim is running (Screen Wake Lock API) on student devices and the bedside monitor;
// released when the sim is paused, on a break or ended. Browsers drop the lock when the tab is hidden, so it is taken
// again when the tab comes back. Where the API is missing (or refused), nothing happens: status() says why.

export function createWakeLock(isRunning) {
  let sentinel = null;
  let wanted = false;
  let state = 'wakeLock' in navigator ? 'idle' : 'unsupported';
  async function acquire() {
    if (state === 'unsupported' || sentinel || document.visibilityState !== 'visible') return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      state = 'on';
      sentinel.addEventListener('release', () => { sentinel = null; if (state === 'on') state = 'idle'; });
    } catch { state = 'refused'; } // e.g. battery saver, or not allowed without a user gesture
  }
  function release() {
    if (sentinel) { const s = sentinel; sentinel = null; state = 'idle'; s.release().catch(() => {}); }
  }
  const update = () => { wanted = Boolean(isRunning()); if (wanted) acquire(); else release(); };
  const onVisible = () => { if (document.visibilityState === 'visible' && wanted) acquire(); };
  document.addEventListener('visibilitychange', onVisible);
  update();
  return { update, status: () => state, destroy: () => { document.removeEventListener('visibilitychange', onVisible); release(); } };
}
