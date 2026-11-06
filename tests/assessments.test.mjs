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

test('required reassessments: neuro checks q2h are timed; tools the sim does not offer are not', async () => {
  const { timelinessItems } = await import('../js/engine/timeliness.js');
  const ctxAt = (simMin) => ({ templatesById, catalogs, simMin });
  const L = live();
  let s = L.tick(L.s, 50);
  s = chart.chartAssessment(s, DE, { toolId: 'gcs', answers: { eye: 4, verbal: 5, motor: 6 } }, L.ctx(55));
  const items = (st, m) => timelinessItems(st, ctxAt(m)).filter((i) => i.kind === 'assessment' && i.patientId === DE);
  const first = items(s, 70);
  assert.deepEqual(first.map((i) => [i.startAt, i.tag]), [[60, 'on-time']], 'first due 60 min into the shift; the 07:55 GCS counts (within 30 min early)');
  assert.match(first[0].label, /^Glasgow Coma Scale \/ NIH Stroke Scale \/ Pupils \(Neuro checks every 2 hours\)/);
  assert.deepEqual(items(s, 250).map((i) => [i.startAt, i.tag]), [[60, 'on-time'], [180, 'open-very-late']]);
  assert.ok(!items(s, 240).some((i) => i.tools.includes('morse')), 'Morse is not public: not offered, not timed');
  const all = live({ assessmentTools: 'all' });
  assert.ok(timelinessItems(all.tick(all.s, 70), ctxAt(70)).some((i) => i.kind === 'assessment' && i.patientId === DE && i.tools.includes('morse')));
});

test('scenario changes and reactions change what assessments find; scores trigger reactions', () => {
  const L = live({ assessmentTools: 'all' });
  let s = L.tick(L.s, 106); // Dorothy's neuro decline at 105
  assert.equal(expectedResult(s, DE, 'gcs', catalogs).score, 14);
  assert.equal(expectedResult(s, DE, 'nihss', catalogs).score, 4);
  assert.equal(expectedResult(s, DE, 'cam', catalogs).band.label, 'CAM positive: delirium likely');
  const MW = 'p2-margaret-wilson';
  s = chart.medAction(s, MW, { orderId: 'o-p2-oxy', result: 'given' }, L.ctx(107));
  s = L.tick(s, 108);
  assert.equal(s.patients[MW].assessmentsExpected.poss.level, 2, 'oxycodone → POSS 2');
  s = chart.chartAssessment(s, MW, { toolId: 'poss', answers: { level: 3 } }, L.ctx(130));
  s = L.tick(s, 131);
  assert.ok(s.alerts.some((a) => /nodding off/.test(a.message)), 'POSS ≥ 3 charted → reaction');
  assert.equal(expectedResult(s, LG, 'cam', catalogs).score, 1, 'Linda: CAM positive after her 08:00 change');
  assert.equal(scoreTool(T('news2'), {}, { vitals: s.patients[LG].vitals, alert: false }).score, expectedResult(s, LG, 'news2', catalogs).score, 'NEWS2 counts her confusion');
});

test('dry run: a student assessment shows what they would find and what it triggers', async () => {
  const { dryRun } = await import('../js/engine/reactions/dry-run.js');
  const mw = templatesById['p2-margaret-wilson'];
  const f = dryRun(mw, { catalogs, settings: scenarioWith().settings, steps: [
    { kind: 'assess', toolId: 'poss' }, { kind: 'med', orderId: 'o-p2-oxy' }, { kind: 'assess', toolId: 'poss' }, { kind: 'assess', toolId: 'poss', answers: { level: 3 } }] });
  assert.deepEqual(f.slice(1).map((x) => x.assessments[0]?.score), [1, undefined, 2, 3]);
  assert.ok(f[4].fired.some((x) => x.reactionId === 'r-p2-poss-high'));
});

test('builder round-trips: assessment reactions and scenario-change assessment answers', async () => {
  const { reactionToForm, formToReaction } = await import('../js/screens/instructor/script-model.js');
  const { changeToForm, formToChange } = await import('../js/screens/instructor/change-model.js');
  const mw = templatesById['p2-margaret-wilson'];
  for (const r of mw.script.reactions) assert.deepEqual(formToReaction(mw, reactionToForm(mw, r.id), r.id).script.reactions.find((x) => x.id === r.id), r, r.id);
  const de = templatesById[DE];
  const form = changeToForm(de, 'p5-confused', '07:00');
  assert.equal(form.assessments.gcs.verbal, 4);
  const back = formToChange(de, form, '07:00').template;
  assert.deepEqual(back.events.find((e) => e.id === 'e-p5-confused-assess').payload.answers, de.events.find((e) => e.id === 'e-p5-confused-assess').payload.answers);
  const cleared = formToChange(de, { ...form, assessments: {} }, '07:00').template;
  assert.ok(!cleared.events.some((e) => e.type === 'assessment-change'), 'cleared answers remove the event');
});

test('rules and debrief: mismatch (missed high risk), overdue reassessment, required assessment missing; grading off', async () => {
  const { evaluateRules } = await import('../js/engine/rules/index.js');
  const { assessmentRows } = await import('../js/engine/assessment-review.js');
  const rctx = (st, simMin) => ({ templatesById, catalogs, simMin, studentIdsForGroup: () => ['student-1'], groupOfStudent: () => 'g1' });
  const L = live({ assessmentTools: 'all' });
  let s = L.tick(L.s, 50);
  s = chart.chartAssessment(s, DE, { toolId: 'morse', answers: { history: 0, secondary: 15, aid: 0, iv: 0, gait: 0, mental: 0 } }, L.ctx(55));
  const row = assessmentRows(s, { catalogs }).at(-1);
  assert.deepEqual([row.band, row.expectedBand, row.missedHighRisk], ['Low fall risk', 'High fall risk', true]);
  assert.deepEqual(row.differing.map((x) => x.itemId), ['history', 'aid', 'iv', 'gait', 'mental']);
  s = L.tick(s, 200);
  const flags = evaluateRules(s, rctx(s, 200)).filter((f) => f.patientId === DE);
  const by = (id) => flags.filter((f) => f.ruleId === id);
  assert.equal(by('assessment-mismatch')[0].severity, 'red');
  assert.match(by('assessment-mismatch')[0].message, /Morse Fall Scale: charted 15 \(Low fall risk\), patient was 100 \(High fall risk\)/);
  assert.ok(by('assessment-overdue').some((f) => f.severity === 'red' && /Neuro checks every 2 hours/.test(f.message)), 'no neuro check since shift start');
  assert.equal(by('required-assessment-missing').length, 0, 'Morse was done (wrongly, but done)');
  const fresh = live({ assessmentTools: 'all' });
  const f2 = evaluateRules(fresh.tick(fresh.s, 200), rctx(null, 200)).filter((f) => f.ruleId === 'required-assessment-missing' && f.patientId === DE);
  assert.match(f2[0].message, /Morse Fall Scale \(Fall precautions/);
  const off = live({ assessmentTools: 'all', gradeAssessments: false });
  assert.equal(evaluateRules(off.tick(off.s, 200), rctx(null, 200)).filter((f) => f.ruleId.startsWith('assessment') || f.ruleId === 'required-assessment-missing').length, 0);
});
