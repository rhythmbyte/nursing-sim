// Program profiles and setting presets (pure, no DOM). Data: data/catalogs/programs.json and presets.json.
// A program sets the defaults every new sim starts from and what the setup screens and pickers offer. It never
// removes content the engine needs (a case or sim from another program still runs): items it doesn't use are
// marked `offered: false` and the pickers leave them out.
//   applyProgram(data, id) → data with .program, program-adjusted scenario defaults and offered marks
//   caseOffered(t, program), scenarioOffered(sc, program), presetsFor(catalogs, program), applyPreset(settings, preset)

/** Deep merge for settings: objects merge (rules, staffPool, messages), everything else replaces. */
export function mergeSettings(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeSettings(a?.[k], v) : v;
  return out;
}

export function programOf(catalogs, id) {
  const list = catalogs?.programs?.programs || [];
  return list.find((p) => p.id === id) || list.find((p) => p.id === catalogs?.programs?.default) || list[0] || null;
}

/** Does a case belong to the program? Every listed tag group must share a tag with the case (no tags = offered). */
export function caseOffered(t, program) {
  const want = program?.cases || {};
  return Object.entries(want).every(([group, ids]) => !ids?.length || !(t.patientTags?.[group]?.length) || t.patientTags[group].some((x) => ids.includes(x)));
}

/** A saved sim belongs to the program it was made for; sims without one (the starters) belong to every program. */
export const scenarioOffered = (sc, program) => !sc.program || !program || sc.program === program.id;

export function presetsFor(catalogs, program) {
  const all = catalogs?.presets?.presets || [];
  return program?.presets ? program.presets.map((id) => all.find((p) => p.id === id)).filter(Boolean) : all;
}

/** Settings with a preset applied on top (rules deep-merged). */
export const applyPreset = (settings, preset) => mergeSettings(settings, preset?.settings || {});

export function applyProgram(data, id) {
  const program = programOf(data.catalogs, id);
  if (!program) return { ...data, program: null };
  const c = data.catalogs;
  const ivOut = new Set(program.interventions?.exclude || []);
  const catOut = new Set(program.interventions?.excludeCategories || []);
  const tools = program.assessmentTools;
  const toolOffered = (t) => (tools === 'all' ? true : tools === 'public' || tools == null ? true : tools.includes(t.id));
  const defaults = mergeSettings(c.scenarioDefaults?.settings, { ...(program.settings || {}), ...(tools != null ? { assessmentTools: tools } : {}) });
  if (program.settings?.staffPool) defaults.staffPool = { ...program.settings.staffPool }; // the program's roles only
  const catalogs = {
    ...c,
    scenarioDefaults: { ...c.scenarioDefaults, settings: defaults },
    interventions: c.interventions && { ...c.interventions, interventions: c.interventions.interventions.map((i) => (ivOut.has(i.id) || catOut.has(i.category) ? { ...i, offered: false } : i)) },
    assessmentTools: c.assessmentTools && { ...c.assessmentTools, tools: c.assessmentTools.tools.map((t) => (toolOffered(t) ? t : { ...t, offered: false })) },
    staff: c.staff && { ...c.staff, staff: c.staff.staff.map((s) => (s.speedFactor != null && !program.staffRoles.includes(s.role) ? { ...s, offered: false } : s)) },
  };
  return { ...data, catalogs, program };
}

/** A program's word for something ("learner" → "student"), falling back to the key. */
export const term = (program, key) => program?.terms?.[key] ?? key;
