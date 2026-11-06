// Intervention search (label, id, catalog synonyms) and a student's recent interventions. Pure (tested).

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim();

/** Interventions matching a query, best first (label/synonym starts-with before contains). */
export function searchInterventions(catalog, query) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const iv of catalog.interventions) {
    const terms = [iv.label, iv.id, ...(iv.synonyms || [])].map(norm);
    const score = terms.some((t) => t === q) ? 0 : terms.some((t) => t.startsWith(q)) ? 1 : terms.some((t) => t.includes(q)) ? 2 : -1;
    if (score >= 0) scored.push([score, iv]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, iv]) => iv);
}

/** Last n distinct interventions this user charted (newest first), as catalog entries. */
export function recentInterventions(log, userId, catalog, n = 6) {
  const byId = Object.fromEntries(catalog.interventions.map((i) => [i.id, i]));
  const seen = [];
  for (let i = log.length - 1; i >= 0 && seen.length < n; i--) {
    const l = log[i];
    if (l.userId === userId && l.action === 'intervention' && byId[l.details.interventionId] && !seen.includes(l.details.interventionId)) seen.push(l.details.interventionId);
  }
  return seen.map((id) => byId[id]);
}
