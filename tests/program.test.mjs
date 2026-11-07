// Program profiles and presets: defaults, offered marks, case and sim filters; presets merge into settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/engine/runner.js'; // engine first (timeliness.js sits in an import cycle that needs the processors loaded)
import { catalogs, casesById } from './fixtures.mjs';
import { applyProgram, programOf, caseOffered, scenarioOffered, presetsFor, applyPreset, mergeSettings, term } from '../js/engine/program.js';
import { effectiveSettings } from '../js/engine/settings.js';
import { timelinessConfig } from '../js/engine/timeliness.js';

const data = { catalogs, patients: Object.values(casesById), scenarios: [] };

test('RN and LPN: defaults, staff roles, tools and wording; nothing the engine needs is removed', () => {
  const rn = applyProgram(data, 'rn');
  const lpn = applyProgram(data, 'lpn');
  assert.equal(rn.program.id, 'rn');
  assert.equal(applyProgram(data, 'nope').program.id, 'rn', 'unknown → the default program');
  assert.deepEqual(effectiveSettings({}, rn.catalogs).staffPool, { CNA: 2, LPN: 1 });
  assert.deepEqual(effectiveSettings({}, lpn.catalogs).staffPool, { CNA: 2 });
  assert.equal(effectiveSettings({}, lpn.catalogs).chargeNurse, 'off');
  assert.deepEqual(effectiveSettings({}, lpn.catalogs).assessmentTools, ['pain-nrs', 'gcs', 'pupils', 'befast', 'ciwa', 'head-to-toe']);
  // Marks only: every tool, intervention and role is still in the catalogs (a sim from another program still runs).
  assert.equal(lpn.catalogs.assessmentTools.tools.length, catalogs.assessmentTools.tools.length);
  assert.equal(lpn.catalogs.assessmentTools.tools.find((t) => t.id === 'nihss').offered, false);
  assert.equal(lpn.catalogs.assessmentTools.tools.find((t) => t.id === 'gcs').offered, undefined);
  assert.equal(lpn.catalogs.staff.staff.find((s) => s.role === 'LPN').offered, false);
  assert.equal(rn.catalogs.staff.staff.find((s) => s.role === 'LPN').offered, undefined);
  assert.equal(lpn.catalogs.interventions.interventions.length, catalogs.interventions.interventions.length);
  assert.equal(term(rn.program, 'charge'), 'charge nurse');
  assert.equal(term(rn.program, 'unknown-key'), 'unknown-key');
  assert.equal(catalogs.scenarioDefaults.settings.staffPool.LPN, 1, 'the original catalog is not mutated');
});

test('cases and saved sims offered per program', () => {
  const lpn = programOf(catalogs, 'lpn');
  const rn = programOf(catalogs, 'rn');
  const offered = (p) => Object.values(casesById).filter((t) => caseOffered(t, p)).map((t) => t.id).sort();
  assert.equal(offered(rn).length, 6);
  assert.deepEqual(offered(lpn), Object.values(casesById).filter((t) => t.patientTags?.license?.includes('lpn')).map((t) => t.id).sort());
  assert.ok(offered(lpn).length >= 1 && offered(lpn).length < 6);
  assert.ok(caseOffered({ patientTags: {} }, lpn), 'an untagged case is offered everywhere');
  assert.ok(scenarioOffered({ id: 'starter' }, lpn));
  assert.ok(scenarioOffered({ id: 'x', program: 'lpn' }, lpn));
  assert.ok(!scenarioOffered({ id: 'x', program: 'rn' }, lpn));
});

test('presets: listed per program, merged into settings (rules deep-merged)', () => {
  const lpn = programOf(catalogs, 'lpn');
  assert.ok(!presetsFor(catalogs, lpn).some((p) => p.id === 'code-heavy'));
  for (const p of programOf(catalogs, 'rn').presets) assert.ok(catalogs.presets.presets.some((x) => x.id === p), `${p} exists`);
  for (const p of lpn.presets) assert.ok(catalogs.presets.presets.some((x) => x.id === p), `${p} exists`);
  const beginner = catalogs.presets.presets.find((p) => p.id === 'beginner');
  const s = effectiveSettings(applyPreset({}, beginner), catalogs);
  assert.equal(s.recoveryPenalties, false);
  const cfg = timelinessConfig({ settings: s }, catalogs);
  assert.equal(cfg.orders['1'].lateMin, 10);
  assert.equal(cfg.orders['1'].veryLateMin, 30);
  assert.equal(cfg.tracking.trackedOrderTypes[0], 'once', 'untouched rules keep their defaults');
  assert.deepEqual(mergeSettings({ a: { b: 1, c: 2 }, l: [1] }, { a: { b: 3 }, l: [2] }), { a: { b: 3, c: 2 }, l: [2] });
});
