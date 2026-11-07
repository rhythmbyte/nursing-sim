// Three-tier debrief: group summary (Tier 1) and talking points (Tier 2) from a played sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenario, MIN } from './fixtures.mjs';
import { createRunner } from '../js/engine/runner.js';
import { createStore } from '../js/state.js';
import { groupSummary, talkingPoints } from '../js/engine/talking-points.js';
import { eventKey } from '../js/engine/scheduler.js';

function played() {
  let now = 0;
  const runner = createRunner({ store: createStore(), scenario, templatesById, catalogs, now: () => now });
  const I = { userId: 'instructor', role: 'instructor' };
  runner.join('s1', 'Ana', runner.state.joinCode);
  runner.clock('start', I);
  now = 61 * MIN; runner.tick();
  // Sepsis orders, then Foley before the bolus (priority-order flag).
  runner.fireNow(eventKey('p4-linda-garcia', 'e-p4-sepsis-orders'), I);
  now = 63 * MIN; runner.tick();
  runner.chart('chartIntervention', 'p4-linda-garcia', { interventionId: 'foley', orderId: 'o-p4-foley' }, { userId: 's1', role: 'student' });
  now = 130 * MIN; runner.tick();
  runner.clock('end', I);
  return runner;
}

test('Tier 1: one summary per group with on-time / late / misprioritized / missed counts, response averages and a status', () => {
  const runner = played();
  const g = scenario.groups[0];
  const s = groupSummary(runner.state, g, runner.rulesCtx());
  assert.equal(s.groupId, g.id);
  assert.deepEqual(s.students.map((x) => x.name), ['Ana']);
  for (const k of ['onTime', 'late', 'veryLate', 'never', 'misprioritized', 'red', 'amber']) assert.equal(typeof s[k], 'number', k);
  assert.ok(s.misprioritized >= 1, 'Foley before the bolus counts as misprioritized');
  assert.ok(s.never > 0, 'orders left undone at the end count as missed');
  assert.ok(['needs-attention', 'falling-behind', 'on-track'].includes(s.status));
  assert.equal(s.status, 'needs-attention');
});

test('Tier 2: talking points grouped by theme, worded from data, with "(S1) Linda Garcia" and evidence links', () => {
  const runner = played();
  const pts = talkingPoints(runner.state, scenario.groups[0], runner.rulesCtx());
  const themes = catalogs.debriefPoints.themes.map((t) => t.id);
  assert.ok(pts.every((p) => themes.includes(p.theme)));
  const idx = pts.map((p) => themes.indexOf(p.theme));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'sorted by theme');
  const foley = pts.find((p) => p.id.startsWith('flag:priority-order'));
  assert.ok(foley, 'priority-order point');
  assert.match(foley.text, /^\(S1\) Linda Garcia: .*Foley|catheter.*Ask what drove that order\.$/);
  assert.equal(foley.theme, 'prioritization');
  assert.equal(foley.evidence.section, 'priorities');
  assert.equal(foley.userId, 's1');
  assert.ok(pts.some((p) => p.theme === 'timeliness' && /never done/.test(p.text)));
  assert.ok(pts.some((p) => p.id.startsWith('sr:p4-linda-garcia') && /Ask whether they saw this/.test(p.text)));
  assert.equal(new Set(pts.map((p) => p.id)).size, pts.length, 'stable unique ids (for ticking and hiding)');
  assert.ok(!pts.some((p) => /\{[a-z]+\}/.test(p.text)), 'no unfilled placeholders');
});
