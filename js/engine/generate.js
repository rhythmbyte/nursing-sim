// Generate a sim (pure, no DOM): from a number of students, patients per student, patient tags, a triage mix (or a
// difficulty level from data/catalogs/generate.json) and a preset, assemble groups (one student each) and cases.
// Within a group a case is used once; across groups cases are reused (each sim instance gets its own variant), and
// the least-used case is preferred so groups differ. Returns { scenario, warnings }.

import { caseOffered, presetsFor, applyPreset } from './program.js';
import { matchesTags } from './patient-tags.js';

const COLORS = ['red', 'yellow', 'green'];

/** Triage counts for n patients from weights (largest remainder), e.g. 4 × { red 1, yellow 1, green 1 } → 2/1/1. */
export function mixCounts(n, weights) {
  const w = COLORS.map((c) => Math.max(0, Number(weights?.[c]) || 0));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (x / total) * n);
  const out = raw.map(Math.floor);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; out.reduce((a, b) => a + b, 0) < n; k++) out[order[k % 3][1]]++;
  return Object.fromEntries(COLORS.map((c, i) => [c, out[i]]));
}

/**
 * opts: { students, perStudent, tags (patient-tag filter), mix (weights) | difficulty (id), presetId, program, rng, name, now }
 */
export function generateSim(opts, library, catalogs) {
  const cfg = catalogs?.generate || {};
  const [sLo, sHi] = cfg.limits?.students || [2, 10];
  const [pLo, pHi] = cfg.limits?.patientsPerStudent || [1, 6];
  const students = Math.min(sHi, Math.max(sLo, Math.round(Number(opts.students) || sLo)));
  let per = Math.min(pHi, Math.max(pLo, Math.round(Number(opts.perStudent) || pLo)));
  const rng = opts.rng || Math.random;
  const program = opts.program || null;
  const preset = presetsFor(catalogs, program).find((p) => p.id === opts.presetId) || presetsFor(catalogs, program)[0] || null;
  const weights = opts.mix || cfg.difficulties?.find((d) => d.id === opts.difficulty)?.mix || preset?.generate?.mix || { red: 1, yellow: 1, green: 1 };
  const tags = opts.tags && Object.keys(opts.tags).length ? opts.tags : preset?.generate?.cases || {};
  const warnings = [];
  const pool = library.filter((t) => !t.id.includes('~') && caseOffered(t, program) && matchesTags(t, tags));
  if (!pool.length) return { scenario: null, warnings: ['No cases match these patient tags for your program.'] };
  if (pool.length < per) { warnings.push(`Only ${pool.length} matching case${pool.length === 1 ? '' : 's'}, so each student gets ${pool.length} patient${pool.length === 1 ? '' : 's'} instead of ${per}.`); per = pool.length; }
  const used = Object.fromEntries(pool.map((t) => [t.id, 0]));
  const shuffled = (list) => list.map((t) => [rng(), t]).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  const pickFrom = (list, taken) => shuffled(list.filter((t) => !taken.has(t.id))).sort((a, b) => used[a.id] - used[b.id])[0] || null;
  const want = mixCounts(per, weights);
  let short = 0;
  const groups = [];
  for (let i = 1; i <= students; i++) {
    const taken = new Set();
    for (const color of COLORS) {
      for (let k = 0; k < want[color]; k++) {
        let t = pickFrom(pool.filter((x) => x.tag === color), taken);
        if (!t) { t = pickFrom(pool, taken); short++; } // not enough of that color: any matching case
        if (!t) break;
        taken.add(t.id); used[t.id]++;
      }
    }
    groups.push({ id: `g${i}`, name: `Group ${i}`, studentCount: 1, patients: [...taken] });
  }
  if (short) warnings.push(`Not enough cases of some triage colors: ${short} patient${short === 1 ? '' : 's'} came from other colors.`);
  const reused = Object.values(used).filter((n) => n > 1).length;
  if (reused) warnings.push(`${reused} case${reused === 1 ? ' is' : 's are'} used in more than one group (each group gets its own patient from it).`);
  const now = opts.now ?? Date.now();
  const scenario = {
    id: `sc-gen-${now.toString(36)}`,
    name: opts.name || `Generated: ${students} students × ${per} patients`,
    ...(program ? { program: program.id } : {}),
    ...(preset ? { preset: preset.id } : {}),
    startClock: '07:00', endClock: '11:00', speed: preset?.speed || 1, assignment: 'random',
    settings: applyPreset({}, preset),
    groups, events: [], notes: `Generated: ${students} students, ${per} patients each, mix ${COLORS.map((c) => `${c} ${want[c]}`).join(' / ')}.`,
  };
  return { scenario, warnings };
}
