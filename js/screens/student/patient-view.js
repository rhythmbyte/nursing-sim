// Patient chart (Epic-lite): banner + section tabs. Sections come from screens/chart/index.js.
// Re-renders only each section's dynamic parts on store changes, so forms keep what the student typed.

import { navPush, onNav } from '../shared/nav.js';
import { h, clear } from '../shared/dom.js';
import { busyBanner } from './busy-banner.js';
import { staffPanel } from './staff-panel.js';
import { toast } from '../shared/toast.js';
import { formatShiftTime } from '../../engine/time.js';
import { openModal } from '../shared/modal.js';
import { simClock, elapsed } from '../shared/timer.js';
import { load, save } from '../../storage.js';
import { chartSections } from '../chart/index.js';
import { newOrderCount } from '../../engine/orders.js';
import { activeScale, currentPriority } from '../../engine/priority.js';
import { priorityPicker } from '../shared/priority-picker.js';

function allergyText(view) {
  if (view.allergies.length) return view.allergies.map((a) => `${a.agent}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ');
  return view.allergyText || 'NKDA';
}

export function mountPatientView(root, ctx) {
  const { store, runner, pid, view, user, scenario, onBack, onOpenPatient, views } = ctx;
  const d = view.demographics;
  const SECTION_KEY = `ui.${user.userId}.section`;
  const sections = chartSections(scenario.settings.handoffMode);
  let activeId = sections.some((s) => s.id === load(SECTION_KEY)) ? load(SECTION_KEY) : sections[0].id;
  let mounted = null;
  const pendingFor = {};

  const sectionCtx = {
    ...ctx,
    // Live view: includes orders the instructor pushes after the chart opened.
    get view() { return ctx.getView ? ctx.getView() : view; },
    // Chart actions: { task } (timed task started), { done }, or null when refused (e.g. busy; shown as a toast).
    act: (name, args) => {
      try { return runner.chart(name, pid, args, user); } catch (e) {
        if (e.code === 'no-helper') { noHelperChoice(e, name, args); return null; }
        toast(e.message, 5000); return null;
      }
    },
    /** Jump to another chart section, e.g. Interventions → Assessments with a tool picked (read once with takePending). */
    openSection: (id, pending = null) => { pendingFor[id] = pending; activeId = id; save(SECTION_KEY, id); renderTabs(); mountSection(); },
    takePending: (id) => { const p = pendingFor[id]; delete pendingFor[id]; return p; },
    patientState: () => runner.state.patients[pid],
  };

  // Nobody of that role is free: do it yourself, or queue it (when the sim allows a queue).
  function noHelperChoice(e, name, args) {
    const when = e.nextAt != null ? ` (next free at ${formatShiftTime(runner.state.startClock, e.nextAt)})` : '';
    const mine = () => { const { delegatedTo, queue, ...rest } = args; const r = sectionCtx.act(name, rest); if (r) toast(r.task ? 'Doing it yourself' : 'Done yourself'); };
    openModal({ title: `No ${e.role} free${when}`, body: h('p', {}, e.queueable ? `Every ${e.role} in your group is busy. Do it yourself, or queue it for the next free ${e.role}?` : `Every ${e.role} in your group is busy${e.nextAt == null ? ' or there is none' : ''}. Do it yourself?`),
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Do it myself', kind: 'primary', onClick: () => { mine(); return true; } },
        ...(e.queueable ? [{ label: `Queue for a ${e.role}`, onClick: () => { try { runner.chart(name, pid, { ...args, queue: true }, user); toast(`Queued for the next free ${e.role}`); } catch (err) { toast(err.message, 5000); } return true; } }] : [])] });
  }
  const clock = simClock(store, runner);
  const busy = busyBanner(store, runner, user, (id) => `Rm ${views[id]?.demographics.room ?? '?'}`);
  const lightBanner = h('div', {});
  const prio = h('div', { class: 'banner-prio' });
  const scale = activeScale(scenario.settings, ctx.catalogs);
  function renderPrio() {
    prio.replaceChildren(priorityPicker(scale, currentPriority(runner.state, user.userId, pid), (levelId) => runner.assignPriority(pid, levelId, user)));
  }
  const tabBar = h('nav', { class: 'chart-tabs', role: 'tablist', 'aria-label': 'Chart sections' });
  const body = h('div', { class: 'chart-body', role: 'tabpanel' });
  const staffBox = h('div', {});

  function renderTabs() {
    const ps = runner.state.patients[pid];
    const newOrders = newOrderCount(ps);
    clear(tabBar).append(...sections.map((s) => h('button', {
      class: `chart-tab${s.id === activeId ? ' active' : ''}`,
      role: 'tab',
      'aria-selected': s.id === activeId ? 'true' : 'false',
      onclick: () => { activeId = s.id; save(SECTION_KEY, s.id); renderTabs(); mountSection(); navPush({ section: s.id }); },
    }, s.label, s.id === 'orders' && newOrders ? h('span', { class: 'tab-count' }, String(newOrders)) : null)));
  }

  // This patient's call light (answer here) + unanswered lights on the student's OTHER patients (go to them).
  function renderLight() {
    clear(staffBox).append(...[staffPanel(runner, runner.state.patients[pid].groupId, (id) => `Rm ${views[id]?.demographics.room ?? '?'}`)].filter(Boolean));
    const state = runner.state;
    const light = state.patients[pid].callLight;
    const groupId = state.patients[pid].groupId;
    const simMin = runner.simMin();
    const others = Object.entries(state.patients)
      .filter(([id, ps]) => id !== pid && ps.groupId === groupId && ps.present && ps.callLight)
      .sort((a, b) => a[1].callLight.since - b[1].callLight.since);
    clear(lightBanner).append(...[
      light ? h('div', { class: 'banner banner-review call-banner' },
        h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
        h('strong', {}, 'Call light on: '), light.message, ' ',
        h('button', { class: 'btn btn-primary btn-small', onclick: () => runner.answerCallLight(pid, user) }, 'Answer'),
      ) : null,
      others.length ? h('div', { class: 'banner banner-other-lights', role: 'status' },
        h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
        h('strong', {}, 'Other call lights: '),
        others.map(([id, ps]) => h('button', { class: 'btn btn-small', onclick: () => onOpenPatient(id) },
          `Rm ${views[id].demographics.room} ${views[id].demographics.name} · ${elapsed(simMin, ps.callLight.since)}`)),
      ) : null,
    ].filter(Boolean));
  }

  function mountSection() {
    if (mounted?.destroy) mounted.destroy();
    mounted = sections.find((s) => s.id === activeId).mount(clear(body), sectionCtx);
    mounted.update(runner.state);
  }

  clear(root).append(
    h('div', { class: 'chart-top' },
      h('button', { class: 'btn btn-ghost', onclick: onBack }, '← My patients'),
      ctx.sound ? ctx.sound.toggle() : null,
      clock.el,
    ),
    busy.el,
    h('header', { class: 'chart-banner patient-banner' },
      h('div', {},
        h('h2', {}, d.name),
        h('div', {}, `${d.age}${d.sex} · Room ${d.room} · ${view.codeStatus}`),
        h('div', {}, h('strong', {}, 'Dx: '), view.admittingDx),
      ),
      h('div', { class: 'banner-side' }, prio, h('div', { class: 'allergy-box' }, h('strong', {}, 'Allergies'), h('div', {}, allergyText(view)))),
    ),
    lightBanner,
    tabBar,
    body,
    staffBox,
  );
  renderTabs();
  renderLight();
  renderPrio();
  mountSection();

  const offNav = onNav((e) => { if (e.patient === pid && e.section && e.section !== activeId && sections.some((x) => x.id === e.section)) { activeId = e.section; save(SECTION_KEY, activeId); renderTabs(); mountSection(); } });
  const off = store.subscribe(() => {
    renderTabs();
    renderLight();
    renderPrio();
    mounted.update(runner.state);
  });
  // Elapsed times in the call-light banners change every sim minute.
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); renderLight(); } });
  return () => { offNav(); off(); offTick(); clock.destroy(); busy.destroy(); if (mounted?.destroy) mounted.destroy(); };
}
