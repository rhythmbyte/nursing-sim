// Instructor → Ready (after "Create sim", before Start): the join code big, who has joined, this sim's patients
// ("(C1) Robert Miller" with Reroll / Lock), and Start sim. "Projector view" opens the join screen for the classroom
// (screens/projector.js). "Change setup" goes back to the wizard.

import { h, clear } from '../shared/dom.js';
import { coalesce } from '../shared/coalesce.js';
import { helpTip } from '../shared/help.js';
import { rosterPanel } from './live-roster.js';
import { casesPanel } from './live-cases.js';

export function mountSetupReady(root, ctx, { onChangeSetup }) {
  const { store, runner, scenario, instructorUser: user } = ctx;
  const code = h('div', { class: 'join-code-big' });
  const roster = h('div', {});
  const cases = h('div', {});
  function render() {
    const slots = scenario.groups.reduce((n, g) => n + g.studentCount, 0);
    clear(code).append(h('span', { class: 'muted' }, 'Students join with'), h('strong', { class: 'code', 'aria-label': 'Join code' }, runner.state.joinCode || '—'),
      h('span', { class: 'muted' }, `${Object.keys(runner.state.roster).length} of ${slots} joined`));
    clear(roster).append(rosterPanel(runner, runner.templates(), scenario, user, { noCode: true }));
    clear(cases).append(casesPanel(runner, runner.templates(), ctx));
  }
  root.append(h('div', { class: 'ready' },
    h('header', { class: 'screen-header' }, h('h2', {}, `Ready: ${scenario.name}`), helpTip('setup.ready')),
    code,
    h('div', { class: 'controls' },
      h('button', { class: 'btn btn-primary btn-large', type: 'button', onclick: () => runner.clock('start', user) }, 'Start sim'),
      h('button', { class: 'btn', type: 'button', title: 'Join code and who has joined, for the classroom screen (no patient information)', onclick: () => window.open(`${window.location.pathname}?projector=1`, 'nursing-sim-projector') }, 'Projector view'),
      h('button', { class: 'btn', type: 'button', onclick: onChangeSetup }, 'Change setup'),
      ctx.startDemo ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.startDemo() }, 'Start demo sim instead') : null),
    h('section', { class: 'panel' }, h('h3', {}, 'Students'), roster),
    h('section', { class: 'panel' }, h('h3', {}, 'Patients in this sim (instructor only)'), cases)));
  render();
  const later = coalesce(render, 250);
  const off = store.subscribe(later.run);
  return () => { off(); later.cancel(); };
}
