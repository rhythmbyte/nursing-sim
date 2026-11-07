// Debrief (instructor), three tiers, simple first: Summary (one card per group) → Talking points (one group) →
// Full breakdown (one group, per student: everything). Where you are is remembered; discussed / hidden talking
// points are remembered per sim (join code). Updates live while the sim is still running.

import { h, clear } from '../shared/dom.js';
import { coalesce } from '../shared/coalesce.js';
import { load, save } from '../../storage.js';
import { summaryView } from './summary.js';
import { pointsView } from './points.js';
import { mountBreakdown } from './breakdown.js';
import { READY_KEY } from '../instructor/setup-wizard.js';

const VIEW_KEY = 'ui.debrief.view'; // { tier: summary|points|full, groupId, userId, section }

export function mountDebrief(root, ctx) {
  const { store, runner } = ctx;
  const POINTS_KEY = `debrief.points.${runner.state.joinCode}`;
  let view = load(VIEW_KEY) || { tier: 'summary' };
  let pointsState = load(POINTS_KEY) || {};
  let showHidden = false;
  let cleanup = null;
  const body = h('div', { class: 'debrief-body' });

  const open = (next) => { view = next; save(VIEW_KEY, { ...next, section: null }); window.scrollTo(0, 0); render(true); }; // an evidence section scrolls itself into view
  // Run again: the same scenario (cases, groups, settings) as a new sim: new join code, fresh patient variants (per its
  // variation toggles), straight to the Ready screen. This sim's debrief is replaced.
  const runAgain = ctx.switchScenario ? async () => {
    if (!window.confirm('Run this sim again with the same setup and new patients? Students join again with a new code, and this debrief is cleared (print or export it first).')) return;
    save(VIEW_KEY, { tier: 'summary' });
    save(READY_KEY, ctx.scenario.id);
    await ctx.switchScenario(ctx.scenario.id);
  } : null;
  const setPoint = (id, state) => { if (state) pointsState[id] = state; else delete pointsState[id]; save(POINTS_KEY, pointsState); render(true); };

  function render(force = false) {
    if (view.tier === 'full') {
      if (!force && cleanup) return; // the breakdown keeps itself up to date
      if (cleanup) cleanup();
      cleanup = mountBreakdown(clear(body), ctx, { groupId: view.groupId, userId: view.userId, section: view.section,
        onSummary: () => open({ tier: 'summary' }), onPoints: () => open({ tier: 'points', groupId: view.groupId }),
        onStudent: (uid) => { view = { ...view, userId: uid, section: null }; save(VIEW_KEY, view); } });
      view = { ...view, section: null };
      return;
    }
    if (cleanup) { cleanup(); cleanup = null; }
    clear(body).append(view.tier === 'points'
      ? pointsView(ctx, { groupId: view.groupId, open, pointsState, setPoint, showHidden, toggleHidden: () => { showHidden = !showHidden; render(true); } })
      : summaryView(ctx, { open, pointsState, runAgain }));
  }

  root.append(body);
  if (!Object.keys(runner.state.roster).length && view.tier === 'full') view = { tier: 'summary' };
  render(true);
  const later = coalesce(() => render(), 1000); // the summary and points re-read the sim at most once a second
  const off = store.subscribe(later.run);
  return () => { off(); later.cancel(); if (cleanup) cleanup(); };
}
