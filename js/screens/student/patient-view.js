// Patient chart (Epic-lite): banner + section tabs. Sections come from screens/chart/index.js.
// Re-renders only each section's dynamic parts on store changes, so forms keep what the student typed.

import { h, clear } from '../shared/dom.js';
import { simClock } from '../shared/timer.js';
import { load, save } from '../../storage.js';
import { chartSections } from '../chart/index.js';

function allergyText(view) {
  if (view.allergies.length) return view.allergies.map((a) => `${a.agent}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ');
  return view.allergyText || 'NKDA';
}

export function mountPatientView(root, ctx) {
  const { store, runner, pid, view, user, scenario, onBack } = ctx;
  const d = view.demographics;
  const SECTION_KEY = `ui.${user.userId}.section`;
  const sections = chartSections(scenario.settings.handoffMode);
  let activeId = sections.some((s) => s.id === load(SECTION_KEY)) ? load(SECTION_KEY) : sections[0].id;
  let mounted = null;

  const sectionCtx = {
    ...ctx,
    act: (name, args) => runner.chart(name, pid, args, user),
    patientState: () => runner.state.patients[pid],
  };

  const clock = simClock(store, runner);
  const lightBanner = h('div', {});
  const tabBar = h('nav', { class: 'chart-tabs', role: 'tablist', 'aria-label': 'Chart sections' });
  const body = h('div', { class: 'chart-body', role: 'tabpanel' });

  function renderTabs() {
    const ps = runner.state.patients[pid];
    const newOrders = Object.values(ps.orders).filter((o) => o.status === 'new').length;
    clear(tabBar).append(...sections.map((s) => h('button', {
      class: `chart-tab${s.id === activeId ? ' active' : ''}`,
      role: 'tab',
      'aria-selected': s.id === activeId ? 'true' : 'false',
      onclick: () => { activeId = s.id; save(SECTION_KEY, s.id); renderTabs(); mountSection(); },
    }, s.label, s.id === 'orders' && newOrders ? h('span', { class: 'tab-count' }, String(newOrders)) : null)));
  }

  function renderLight() {
    const light = runner.state.patients[pid].callLight;
    clear(lightBanner).append(light ? h('div', { class: 'banner banner-review call-banner' },
      h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
      h('strong', {}, 'Call light on: '), light.message, ' ',
      h('button', { class: 'btn btn-primary btn-small', onclick: () => runner.answerCallLight(pid, user) }, 'Answer'),
    ) : '');
  }

  function mountSection() {
    if (mounted?.destroy) mounted.destroy();
    mounted = sections.find((s) => s.id === activeId).mount(clear(body), sectionCtx);
    mounted.update(runner.state);
  }

  clear(root).append(
    h('div', { class: 'chart-top' },
      h('button', { class: 'btn btn-ghost', onclick: onBack }, '← My patients'),
      clock.el,
    ),
    h('header', { class: 'chart-banner patient-banner' },
      h('div', {},
        h('h2', {}, d.name),
        h('div', {}, `${d.age}${d.sex} · Room ${d.room} · ${view.codeStatus}`),
        h('div', {}, h('strong', {}, 'Dx: '), view.admittingDx),
      ),
      h('div', { class: 'allergy-box' }, h('strong', {}, 'Allergies'), h('div', {}, allergyText(view))),
    ),
    lightBanner,
    tabBar,
    body,
  );
  renderTabs();
  renderLight();
  mountSection();

  const off = store.subscribe(() => {
    renderTabs();
    renderLight();
    mounted.update(runner.state);
  });
  return () => { off(); clock.destroy(); if (mounted?.destroy) mounted.destroy(); };
}
