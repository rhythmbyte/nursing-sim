// In-app history: Back moves between screens (tab, instructor view, patient chart, chart section) instead of leaving the
// site, and asks before Back would leave the app. Screens call navPush() when the user moves and register onNav()
// handlers that move the screen to a history entry ({ tab, view, patient, section }).

const handlers = new Set();
let applying = false;
let installed = false;

/** Record a move (no entry while a Back/Forward is being applied, or when nothing changed). */
export function navPush(entry) {
  if (applying || !installed) return;
  const cur = history.state?.nav || {};
  const next = { ...cur, ...entry };
  if (JSON.stringify(next) === JSON.stringify(cur)) return;
  history.pushState({ nav: next, app: 'nursing-sim' }, '');
}

/** Handlers get the entry being returned to; returns an unregister function. */
export function onNav(fn) { handlers.add(fn); return () => handlers.delete(fn); }

/** Install once at boot with the current place. confirmLeave() decides whether Back may leave the app. */
export function installNav(initial, confirmLeave = () => window.confirm('Leave the sim? Your work is saved; you can come back to it.')) {
  if (installed) return;
  installed = true;
  // After a reload the browser keeps our history entries: stay on the current one (it says where the user was).
  if (!(history.state?.app === 'nursing-sim' && history.state.nav)) {
    history.replaceState({ app: 'nursing-sim', edge: true }, ''); // bottom: Back past here leaves the app
    history.pushState({ app: 'nursing-sim', nav: initial }, '');
  }
  window.addEventListener('popstate', (e) => {
    if (e.state?.edge) {
      if (confirmLeave()) { history.back(); return; }
      history.pushState({ app: 'nursing-sim', nav: initial }, '');
      return;
    }
    const entry = e.state?.nav;
    if (!entry) return;
    applying = true;
    try { for (const fn of handlers) fn(entry); } finally { applying = false; }
  });
}
