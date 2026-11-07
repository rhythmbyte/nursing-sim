// Overview → side drawer: everything for one patient, student or group, built from the Live control panels with a
// filter (no rules here, B5). Patient: case and variant, vitals + Adjust vitals, push order, call light, Add event,
// code / ROSC, script state and armed reactions with the penalty, labs to release, its events. Student: status,
// rejoin approvals, End task now. Group: its patients and events. Re-renders on store changes while open.

import { h, clear } from '../shared/dom.js';
import { coalesce } from '../shared/coalesce.js';
import { instructorPatientLabel } from '../shared/labels.js';
import { caseLabel } from '../../engine/cases.js';
import { patientsPanel } from './live-patients.js';
import { scriptPanel, updateCountdowns, rebuildKeepingUi } from './live-script.js';
import { labsPanel } from './live-labs.js';
import { eventsPanel } from './live-events.js';
import { rosterPanel } from './live-roster.js';
import { save, load } from '../../storage.js';

const KEY = 'ui.overview.drawer'; // { kind: patient|student|group, id } (restored after a reload)
const section = (title, body) => h('section', { class: 'drawer-section' }, h('h4', {}, title), body);

export function createDrawer({ store, runner, scenario, catalogs, user }) {
  let open = load(KEY);
  const body = h('div', { class: 'drawer-body' });
  const title = h('h3', { class: 'drawer-title' });
  const el = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'drawer-title', hidden: true },
    h('div', { class: 'drawer-head' }, title, h('button', { class: 'btn btn-small btn-ghost', type: 'button', 'aria-label': 'Close panel', onclick: () => close() }, '✕ Close')),
    body);
  title.id = 'drawer-title';
  const scripts = h('div', {});
  let eventsOpen = false; // the folded Events section stays as the instructor left it across re-renders

  function render() {
    if (!open) { el.hidden = true; return; }
    const t = runner.templates();
    const state = runner.state;
    el.hidden = false;
    if (open.kind === 'patient') {
      const tpl = t[open.id];
      if (!tpl || !state.patients[open.id]) { close(); return; }
      const f = { patientId: open.id };
      title.textContent = instructorPatientLabel(tpl);
      rebuildKeepingUi(scripts, () => scriptPanel(runner, t, user, f));
      clear(body).append(
        tpl.instance ? h('p', { class: 'muted small' }, caseLabel(tpl)) : null,
        section('Vitals and actions', patientsPanel(runner, t, catalogs, user, f)),
        scripts,
        section('Labs to release', labsPanel(runner, t, user, f)),
        (() => { const d = h('details', { class: 'drawer-section', open: eventsOpen }, h('summary', {}, h('strong', {}, 'Events for this patient'), ' (timeline, Fire now)'), eventsPanel(runner, t, user, f)); d.addEventListener('toggle', () => { eventsOpen = d.open; }); return d; })());
    } else if (open.kind === 'student') {
      const r = state.roster[open.id];
      if (!r) { close(); return; }
      title.textContent = r.name;
      clear(body).append(section('Status', rosterPanel(runner, t, scenario, user, { userId: open.id })));
    } else {
      const gr = scenario.groups.find((x) => x.id === open.id);
      if (!gr) { close(); return; }
      title.textContent = gr.name;
      const f = { groupId: open.id };
      clear(body).append(section('Patients', patientsPanel(runner, t, catalogs, user, f)), section('Events', eventsPanel(runner, t, user, f)));
    }
  }
  function show(kind, id) { open = { kind, id }; save(KEY, open); render(); el.querySelector('.drawer-head button')?.focus(); }
  function close() { open = null; save(KEY, null); render(); }
  const onKey = (e) => { if (e.key === 'Escape' && open && !document.querySelector('dialog[open]')) close(); };
  document.addEventListener('keydown', onKey);
  const later = coalesce(render, 250);
  const off = store.subscribe(later.run);
  const offTick = store.on('tick', (m) => { if (open?.kind === 'patient') updateCountdowns(scripts, m); });
  render();
  return { el, show, close, destroy: () => { off(); offTick(); later.cancel(); document.removeEventListener('keydown', onKey); } };
}
