// Readiness (pure, no DOM): is a case, or a whole saved sim, ready to run? Data: data/catalogs/readiness.json says
// which reasons block ("Needs work") and which are only notes.
//   caseReadiness(template, { catalogs, settings, program }) → { status: 'ready' | 'needs-work', blocking, notes }
//   simReadiness(scenario, library, { catalogs, program })  → { status, blocking, notes, cases: { caseId: readiness } }
// Each reason: { code, message }. Results are cached per case object (the library doesn't change until a reload).

import { patientReferenceProblems } from './integrity.js';
import { variantProblems } from './case-check.js';
import { countNeedsReview } from '../review.js';
import { effectiveSettings } from './settings.js';
import { codeName } from './cases.js';
import { availableTools } from './assessment-score.js';

const cache = new WeakMap(); // template → Map(key → readiness)

function reasons(cfg, list) {
  const blocking = new Set(cfg?.blocking || []);
  const msg = (code, detail) => (cfg?.messages?.[code] || code).replace('{detail}', detail ?? '');
  const out = { blocking: [], notes: [] };
  for (const [code, detail] of list) (blocking.has(code) ? out.blocking : out.notes).push({ code, message: msg(code, detail) });
  return { ...out, status: out.blocking.length ? 'needs-work' : 'ready' };
}

/** Tools the case's orders need that the sim won't offer (its settings, engine/assessment-score.js) or the program doesn't. */
function missingTools(t, catalogs, settings) {
  const ok = new Set(availableTools(settings, catalogs).filter((x) => x.offered !== false).map((x) => x.id));
  return [...new Set(t.orders.flatMap((o) => o.assessment?.tools || []))].filter((id) => !ok.has(id));
}

export function caseReadiness(t, { catalogs, settings = null, program = null }) {
  const cfg = catalogs?.readiness;
  const s = settings || effectiveSettings({}, catalogs);
  const key = `${program?.id || ''}|${JSON.stringify(s.assessmentTools)}`;
  const hit = cache.get(t)?.get(key);
  if (hit) return hit;
  const list = [];
  for (const p of patientReferenceProblems(t, catalogs)) list.push(['broken-references', p]);
  if (t.case) {
    const probs = variantProblems(t, { catalogs, settings: s, samples: cfg?.variantSamples ?? 8 });
    const errs = probs.filter((p) => p.level === 'error');
    const warns = probs.filter((p) => p.level !== 'error');
    if (errs.length) list.push(['variant-errors', `${errs[0].message}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`]);
    if (warns.length) list.push(['range-warnings', `${warns[0].message}${warns.length > 1 ? ` (+${warns.length - 1} more)` : ''}`]);
  }
  if (t.review === 'proposed') list.push(['unreviewed-case']);
  else if (t.review === 'partial') list.push(['partial-review']);
  const drafted = countNeedsReview(t) - (t.review === 'proposed' || t.review === 'partial' ? 1 : 0);
  if (drafted > 0) list.push(['proposed-items', drafted]);
  if (!t.script) list.push(['no-script']);
  const tools = missingTools(t, catalogs, s);
  if (tools.length) list.push(['tools-unavailable', tools.join(', ')]);
  const out = reasons(cfg, list);
  if (!cache.has(t)) cache.set(t, new Map());
  cache.get(t).set(key, out);
  return out;
}

export function simReadiness(scenario, library, { catalogs, program = null }) {
  const byId = Object.fromEntries(library.map((t) => [t.id, t]));
  const settings = effectiveSettings(scenario.settings, catalogs);
  const list = [];
  const cases = {};
  for (const g of scenario.groups || []) {
    const ids = [...(g.patients || []), ...(g.admissions || [])];
    if (!ids.length) list.push(['empty-group', g.name]);
    for (const id of ids) {
      if (!byId[id]) { list.push(['missing-case', id]); continue; }
      cases[id] ??= caseReadiness(byId[id], { catalogs, settings, program });
    }
  }
  const out = reasons(catalogs?.readiness, list);
  // The sim needs work if any of its cases does; their reasons are listed under the case.
  const notReady = Object.entries(cases).filter(([, r]) => r.status !== 'ready');
  for (const [id, r] of notReady) out.blocking.push({ code: 'case', caseId: id, message: `${codeName(byId[id])}: ${r.blocking.map((b) => b.message).join('; ')}` });
  return { ...out, status: out.blocking.length ? 'needs-work' : 'ready', cases };
}
