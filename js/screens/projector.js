// Projector page (index.html?projector=1): the join code huge and who has joined, by group, for the classroom
// screen. Students see it, so it shows NO patient or case information. DISPLAY ONLY: it reads the session the main
// window saves (same browser, via storage.js) and never writes; it never takes the window lock.
// Full build: a public "join" screen fed by the server's realtime channel (SPEC §13).

import { h, clear } from './shared/dom.js';

/** Pure: what the projector shows for a saved session and its scenario (null session → waiting). */
export function projectorView(session, scenario) {
  if (!session || !scenario || session.scenarioId !== scenario.id) return null;
  const roster = Object.values(session.roster || {});
  const groups = scenario.groups.map((g) => ({ name: g.name, slots: g.studentCount, students: roster.filter((r) => r.groupId === g.id).map((r) => r.name).sort((a, b) => a.localeCompare(b)) }));
  const status = session.clock.status;
  return {
    name: scenario.name, code: session.joinCode || '—', joined: roster.length, slots: groups.reduce((n, g) => n + g.slots, 0), groups,
    note: status === 'ready' ? 'Waiting for the instructor to start' : status === 'ended' ? 'The sim has ended' : 'The sim is running: late arrivals can still join',
  };
}

export function mountProjector(root, { scenario, loadSession, onSessionChange, joinUrl }) {
  document.body.classList.add('projector-page');
  const full = h('button', { class: 'btn btn-small projector-full', type: 'button', onclick: () => Promise.resolve(document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch(() => {}) }, 'Full screen');
  const body = h('main', { class: 'projector', 'aria-live': 'polite' });
  clear(root).append(full, body);
  function render() {
    const v = projectorView(loadSession(), scenario);
    if (!v) { clear(body).append(h('p', { class: 'projector-wait' }, 'Waiting for the sim… (create it in the main window of this browser)')); return; }
    clear(body).append(
      h('h1', { class: 'projector-name' }, v.name),
      h('p', { class: 'projector-how' }, 'Open ', h('strong', {}, joinUrl), ', choose your student tab, and enter'),
      h('div', { class: 'projector-code', 'aria-label': 'Join code' }, v.code),
      h('p', { class: 'projector-count' }, `${v.joined} of ${v.slots} joined · ${v.note}`),
      h('div', { class: 'projector-groups' }, v.groups.map((g) => h('section', { class: 'projector-group' },
        h('h2', {}, `${g.name} (${g.students.length}/${g.slots})`),
        g.students.length ? h('ul', {}, g.students.map((n) => h('li', {}, n))) : h('p', { class: 'muted' }, 'Nobody yet')))));
  }
  render();
  onSessionChange(render);
  return () => {};
}
