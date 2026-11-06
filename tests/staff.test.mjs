import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { evaluateRules } from '../js/engine/rules/index.js';
import { timelinessItems } from '../js/engine/timeliness.js';
import { staffView, moveHelper, setOnBreak, setStaffCount, helperSec, NoHelperError } from '../js/engine/staff.js';

const S1 = { userId: 'student-1', role: 'student' };
const INS = { userId: 'instructor', role: 'instructor' };
const RM = 'p1-robert-miller'; const LG = 'p4-linda-garcia'; const MW = 'p2-margaret-wilson';

function rig(extra = {}) {
  const scenario = scenarioWith(extra);
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), templatesById, scenario);
  const s = session.controlClock(session.createSession(scenario, templatesById, catalogs), 'start', { now: 0, user: INS });
  const tick = (st, min) => session.tick(st, { now: min * MIN, refs, templatesById, catalogs }).state;
  const ctx = (min, user = S1) => ({ now: min * MIN, user, templatesById, catalogs });
  const g = s.patients[RM].groupId;
  return { s, tick, ctx, g, scenario };
}
const del = (s, ctx, pid, iv, min, extra = {}) => chart.chartIntervention(s, pid, { interventionId: iv, delegatedTo: 'CNA', ...extra }, ctx(min));

test('pool from settings (and a group override); helper time = task × speed + travel', () => {
  const { s, g } = rig();
  assert.deepEqual(s.staff.filter((x) => x.groupId === g).map((x) => x.label), ['CNA 1', 'CNA 2', 'LPN 1']);
  const big = rig({ staffPool: { CNA: 3 } });
  assert.equal(big.s.staff.filter((x) => x.role === 'CNA' && x.groupId === g).length, 3);
  assert.equal(helperSec({ interventionId: 'vs-full' }, 'CNA', { catalogs, settings: {} }), 204);
});

test('no helper free: refused with the next free time; queued when chosen; starts when a helper frees up', () => {
  const { s: s0, tick, ctx, g } = rig();
  let s = del(s0, ctx, RM, 'vs-full', 10);
  s = del(s, ctx, LG, 'vs-full', 10);
  const err = (() => { try { del(s, ctx, MW, 'vs-full', 11); } catch (e) { return e; } })();
  assert.ok(err instanceof NoHelperError);
  assert.deepEqual([err.role, err.nextAt, err.queueable], ['CNA', 13.4, true]);
  s = del(s, ctx, MW, 'ambulate', 11, { queue: true });
  assert.deepEqual(staffView(s, g, 11, catalogs).queued.map((q) => q.patientId), [MW]);
  s = tick(s, 14);
  const v = staffView(s, g, 14, catalogs);
  assert.equal(v.queued.length, 0);
  assert.ok(v.helpers.some((h) => h.status === 'busy' && h.patientId === MW), 'queued task started at 13.4');
  const wait = timelinessItems(s, { templatesById, catalogs, simMin: 14 }).find((i) => i.kind === 'delegation');
  assert.deepEqual([wait.startAt, wait.doneAt], [11, 13.4]);
  const noQueue = rig({ delegationQueue: false });
  let q = del(noQueue.s, noQueue.ctx, RM, 'vs-full', 10); q = del(q, noQueue.ctx, LG, 'vs-full', 10);
  assert.throws(() => del(q, noQueue.ctx, MW, 'ambulate', 11, { queue: true }), (e) => e.code === 'no-helper' && e.queueable === false);
});

test('instructor and charge: move, break, change counts (logged); busy helpers stay put', () => {
  const { s: s0, ctx, g, scenario } = rig();
  const other = scenario.groups.find((x) => x.id !== g)?.id || 'g-other';
  let s = del(s0, ctx, RM, 'vs-full', 10);
  const busy = s.staff.find((x) => x.taskId);
  assert.throws(() => moveHelper(s, busy.id, other, ctx(11, INS)), /busy/);
  const free = s.staff.find((x) => x.groupId === g && !x.taskId && x.role === 'CNA');
  s = setOnBreak(s, free.id, true, ctx(11, INS));
  assert.throws(() => del(s, ctx, LG, 'vs-full', 12), (e) => e.code === 'no-helper');
  s = setStaffCount(s, g, 'CNA', 3, ctx(12, INS));
  s = del(s, ctx, LG, 'vs-full', 12);
  s = moveHelper(s, s.staff.find((x) => x.groupId === g && x.role === 'LPN').id, other, ctx(13, INS));
  assert.deepEqual(s.log.filter((l) => l.action.startsWith('staff-')).map((l) => l.action), ['staff-break', 'staff-count', 'staff-moved']);
});

test('delegation-overload flags a burst of delegations', () => {
  const { s: s0, ctx } = rig({ staffPool: { CNA: 6 } });
  let s = s0;
  for (const [i, pid] of [RM, LG, MW, RM, LG].entries()) s = del(s, ctx, pid, 'ambulate', 10 + i);
  const f = evaluateRules(s, { templatesById, catalogs, simMin: 20, studentIdsForGroup: () => ['student-1'], groupOfStudent: () => null }).filter((x) => x.ruleId === 'delegation-overload');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /Delegated 5 tasks within 15 min \(more than 4\)/);
});

test('debrief: delegated to whom, wait, queued, utilization per group', async () => {
  const { delegationReview } = await import('../js/engine/staff-review.js');
  const { s: s0, tick, ctx, g } = rig();
  let s = del(s0, ctx, RM, 'vs-full', 10); s = del(s, ctx, LG, 'vs-full', 10); s = del(s, ctx, MW, 'ambulate', 11, { queue: true });
  s = tick(s, 30);
  const r = delegationReview(s, 'student-1', [RM, LG, MW], { catalogs, simMin: 30 });
  assert.deepEqual(r.rows.map((x) => [x.helper, x.waitMin, x.queued]), [['CNA 1', 0, false], ['CNA 2', 0, false], ['CNA 1', 2.4, true]]);
  assert.equal(r.queued, 1);
  const grp = r.groups.find((x) => x.groupId === g);
  assert.ok(grp.percent > 0 && grp.helpers === 3);
});

test('Command center: staffing per group (busy / total, on break, waiting)', async () => {
  const { staffing } = await import('../js/engine/command-center.js');
  const { s: s0, tick, ctx, g } = rig();
  let s = del(s0, ctx, RM, 'vs-full', 10); s = del(s, ctx, LG, 'vs-full', 10); s = del(s, ctx, MW, 'ambulate', 11, { queue: true });
  const st = staffing(s, g, { simMin: 11, catalogs });
  assert.deepEqual(st.roles, [{ role: 'CNA', total: 2, busy: 2, onBreak: 0 }, { role: 'LPN', total: 1, busy: 0, onBreak: 0 }]);
  assert.deepEqual([st.queued, st.allBusy], [1, ['CNA']]);
});
