// Debrief Tier 2, Talking points for one group: plain-language prompts (engine/talking-points.js, wording in
// data/catalogs/debrief-points.json) grouped by theme. Tick a point as discussed, hide it, or open its evidence
// in the full breakdown. pointsState { id: 'done' | 'hidden' } is kept per sim by the caller.

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { talkingPoints } from '../../engine/talking-points.js';

export function pointsView({ runner, scenario, catalogs }, { groupId, open, pointsState, setPoint, showHidden, toggleHidden, showMentioned, toggleMentioned }) {
  const g = scenario.groups.find((x) => x.id === groupId) || scenario.groups[0];
  const every = talkingPoints(runner.state, g, runner.rulesCtx());
  const mentioned = every.filter((p) => p.skipped); // the reflections already cover these (shown on request)
  const all = showMentioned ? every : every.filter((p) => !p.skipped);
  const hidden = all.filter((p) => pointsState[p.id] === 'hidden');
  const shown = showHidden ? all : all.filter((p) => pointsState[p.id] !== 'hidden');
  const done = all.filter((p) => pointsState[p.id] === 'done').length;
  const themes = catalogs.debriefPoints?.themes || [];
  const item = (p) => {
    const state = pointsState[p.id];
    return h('li', { class: `point${state === 'done' ? ' point-done' : ''}${state === 'hidden' ? ' point-hidden' : ''}` },
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: state === 'done', 'aria-label': 'Discussed', onchange: (e) => setPoint(p.id, e.target.checked ? 'done' : null) }), ' ', p.text,
        p.mentionedBy ? h('span', { class: 'point-mentioned' }, ` ✓ ${p.mentionedBy.length === 1 ? `in ${p.mentionedBy[0]}'s reflection` : `in the reflections of ${p.mentionedBy.slice(0, -1).join(', ')} and ${p.mentionedBy.at(-1)}`} (keyword match)`) : null),
      h('span', { class: 'point-actions' },
        h('button', { class: 'btn btn-small', type: 'button', title: 'Open the evidence in the full breakdown', onclick: () => open({ tier: 'full', groupId: g.id, userId: p.userId, section: p.evidence.section }) }, 'Evidence →'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => setPoint(p.id, state === 'hidden' ? null : 'hidden') }, state === 'hidden' ? 'Unhide' : 'Hide')));
  };
  return h('div', { class: 'debrief-points' },
    h('div', { class: 'controls debrief-nav' }, h('button', { class: 'btn', type: 'button', onclick: () => open({ tier: 'summary' }) }, '← Summary'),
      h('button', { class: 'btn', type: 'button', onclick: () => open({ tier: 'full', groupId: g.id }) }, 'Full breakdown')),
    h('header', { class: 'screen-header' }, h('h2', {}, `Talking points · ${g.name}`), helpTip('debrief.points'),
      h('span', { class: 'muted' }, `${done} of ${all.length - hidden.length} discussed`),
      hidden.length ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: toggleHidden }, showHidden ? 'Hide hidden points' : `Show hidden (${hidden.length})`) : null,
      mentioned.length ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: 'Should-recognize items the reflections already mention were left out', onclick: toggleMentioned }, showMentioned ? 'Leave out ones already in reflections' : `Show ${mentioned.length} already in reflections`) : null),
    shown.length ? themes.map((th) => {
      const list = shown.filter((p) => p.theme === th.id);
      return list.length ? h('section', { class: 'panel' }, h('h3', {}, `${th.label} (${list.length})`), h('ul', { class: 'points' }, list.map(item))) : null;
    }) : h('p', { class: 'muted' }, 'Nothing to discuss yet.'));
}
