import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatesById, catalogs, scenarioWith, MIN } from './fixtures.mjs';
import * as session from '../js/engine/session.js';
import * as chart from '../js/engine/chart.js';
import { collectEvents } from '../js/engine/scheduler.js';
import { toolById, scoreTool, news2, differingItems, assessmentCatalogProblems } from '../js/engine/assessment-score.js';
import { availableTools, expectedResult, revealItem, applyExpected } from '../js/engine/assessments.js';

const T = (id) => toolById(catalogs, id);
const INS = { userId: 'instructor', role: 'instructor' };
const S1 = { userId: 'student-1', role: 'student' };
const LG = 'p4-linda-garcia'; const DE = 'p5-dorothy-evans';

function live(extra = {}, tmpl = templatesById) {
  const scenario = scenarioWith(extra);
  const refs = collectEvents(session.scenarioPatients(scenario).map((p) => p.id), tmpl, scenario);
  const s = session.controlClock(session.createSession(scenario, tmpl, catalogs), 'start', { now: 0, user: INS });
  return { s, tick: (st, min) => session.tick(st, { now: min * MIN, refs, templatesById: tmpl, catalogs }).state, ctx: (min, user = S1) => ({ now: min * MIN, user, templatesById: tmpl, catalogs }) };
}

test('catalog: 17 tools, all categories, valid per-entry; licenses flagged', () => {
  assert.deepEqual(assessmentCatalogProblems(catalogs.assessmentTools), []);
  const ids = catalogs.assessmentTools.tools.map((t) => t.id);
  for (const id of ['nihss', 'befast', 'gcs', 'pupils', 'morse', 'braden', 'pain-nrs', 'wong-baker', 'flacc', 'cpot', 'poss', 'rass', 'cam', 'ciwa', 'cows', 'news2', 'head-to-toe']) assert.ok(ids.includes(id), id);
  assert.equal(T('braden').license.status, 'permission-needed');
  assert.ok(catalogs.assessmentTools.tools.every((t) => t.review === 'proposed'));
  assert.match(assessmentCatalogProblems({ tools: [{ id: 'x', items: [{ id: 'a', type: 'choice', options: [{ label: 'A', points: 1 }, { label: 'B', points: 1 }] }], bands: [{ min: 3, max: 1, label: 'bad' }], scoring: 'rule', positiveIf: { all: ['zz'] } }] }).join('\n'), /points must be unique[\s\S]*min > max[\s\S]*no item "zz"/);
});

test('scoring: sums, single, rule (CAM), bands, incomplete', () => {
  const gcs = scoreTool(T('gcs'), { eye: 4, verbal: 5, motor: 6 });
  assert.deepEqual([gcs.score, gcs.band.label, gcs.complete], [15, 'Normal', true]);
  assert.equal(scoreTool(T('gcs'), { eye: 2, verbal: 2, motor: 4 }).band.label, 'Severe impairment: protect the airway');
  assert.equal(scoreTool(T('gcs'), { eye: 4 }).complete, false);
  assert.equal(scoreTool(T('morse'), { history: 25, secondary: 15, aid: 0, iv: 20, gait: 0, mental: 0 }).band.label, 'High fall risk');
  assert.equal(scoreTool(T('braden'), { sensory: 2, moisture: 2, activity: 2, mobility: 2, nutrition: 2, friction: 2 }).band.label, 'High risk');
  assert.equal(scoreTool(T('cam'), { acute: 1, inattention: 1, disorganized: 0, loc: 1 }).band.label, 'CAM positive: delirium likely');
  assert.equal(scoreTool(T('cam'), { acute: 1, inattention: 0, disorganized: 1, loc: 1 }).score, 0, 'needs feature 1 AND 2');
  assert.equal(scoreTool(T('rass'), { level: -3 }).band.label, 'Deep sedation or unarousable');
  assert.equal(scoreTool(T('poss'), { level: 3 }).band.label, 'Unacceptable: hold opioid, monitor closely');
  assert.equal(scoreTool(T('pupils'), { 'left-size': 3 }).score, null, 'no scoring');
  assert.deepEqual(differingItems(T('gcs'), { eye: 4, verbal: 5, motor: 6 }, { eye: 3, verbal: 5, motor: 6 }).map((d) => [d.itemId, d.student, d.expected]), [['eye', 'Spontaneous', 'To sound']]);
});

test('NEWS2 from vitals (Linda at handoff: high), consciousness counts', () => {
  const n = news2(T('news2'), templatesById[LG].vitals.baseline);
  assert.deepEqual(n.parts, { rr: 2, spo2: 3, sbp: 1, hr: 1, tempC: 1, oxygen: 2, consciousness: 0 });
  assert.equal(scoreTool(T('news2'), {}, { vitals: templatesById[LG].vitals.baseline, alert: false }).score, 13);
  assert.equal(news2(T('news2'), { rr: 16, spo2: 98, bp: '120/80', hr: 72, tempF: 98.6, o2: 'RA' }).score, 0);
});

test('available tools: public by default; reveal follows the setting; expected answers change', () => {
  assert.ok(!availableTools(scenarioWith().settings, catalogs).some((t) => t.id === 'braden'));
  assert.ok(availableTools({ assessmentTools: 'all' }, catalogs).some((t) => t.id === 'braden'));
  assert.deepEqual(availableTools({ assessmentTools: ['gcs'] }, catalogs).map((t) => t.id), ['gcs']);
  const L = live();
  let s = L.s;
  applyExpected(s.patients[DE], { gcs: { eye: 4, verbal: 4, motor: 6 } });
  assert.deepEqual(revealItem(s, DE, 'gcs', 'verbal'), { revealed: true, value: 4 });
  assert.equal(revealItem({ ...s, settings: { ...s.settings, revealAssessmentFindings: false } }, DE, 'gcs', 'verbal').revealed, false);
  assert.equal(expectedResult(s, DE, 'gcs', catalogs).score, 14);
  assert.equal(expectedResult(s, 'p1-robert-miller', 'cam', catalogs).scripted, false, 'no data: assess the manikin');
});

test('charting a tool: score, band, expected snapshot, order progress; delegation per catalog', () => {
  const L = live({ assessmentTools: 'all' });
  let s = L.s;
  s = chart.chartAssessment(s, DE, { toolId: 'gcs', answers: { eye: 4, verbal: 4, motor: 6 } }, L.ctx(10));
  const e = s.log.at(-1);
  assert.deepEqual([e.action, e.details.score, e.details.band], ['assessment', 14, 'Mild impairment']);
  assert.equal(s.patients[DE].flowsheet.at(-1).values.gcs, 14, 'GCS also lands on the flowsheet');
  assert.throws(() => chart.chartAssessment(s, DE, { toolId: 'nihss', delegatedTo: 'CNA' }, L.ctx(11)), /can't be delegated to CNA/);
  s = chart.chartAssessment(s, DE, { toolId: 'morse', delegatedTo: 'LPN' }, L.ctx(12));
  s = L.tick(s, 30);
  const done = s.log.filter((l) => l.action === 'assessment' && l.details.toolId === 'morse');
  assert.equal(done.length, 1);
  assert.equal(done[0].details.delegatedTo, 'LPN');
  const off = live();
  assert.throws(() => chart.chartAssessment(off.s, DE, { toolId: 'braden', answers: {} }, off.ctx(5)), /not available in this sim/);
});
