// Patient tags (pure, no DOM): labels like "RN", "Med-surg", "Sepsis" from data/catalogs/patient-tags.json, kept on a
// patient as patientTags = { groupId: [tagId] }. NOT the triage tag (red/yellow/green/black).
// Filter = { groupId: [tagIds] }: within a group ANY selected tag matches; across groups ALL must match; empty = no filter.

export const tagsOf = (t) => t?.patientTags || {};

export function matchesTags(t, filter) {
  const own = tagsOf(t);
  return Object.entries(filter || {}).every(([g, wanted]) => !wanted?.length || (own[g] || []).some((x) => wanted.includes(x)));
}

/** "RN AND (Med-surg OR Surgical)" for a filter. */
export function filterText(filter, catalog) {
  const parts = Object.entries(filter || {}).filter(([, w]) => w?.length).map(([g, w]) => {
    const grp = catalog?.groups.find((x) => x.id === g);
    const labels = w.map((id) => grp?.tags.find((x) => x.id === id)?.label || id);
    return labels.length > 1 ? `(${labels.join(' OR ')})` : labels[0];
  });
  return parts.join(' AND ') || 'any patient';
}

/** Library patients matching the filter, counted per triage tag: { red: n, … }. */
export function countByTriage(library, filter, exclude = new Set()) {
  const out = { red: 0, yellow: 0, green: 0, black: 0 };
  for (const p of library) if (!exclude.has(p.id) && matchesTags(p, filter)) out[p.tag] = (out[p.tag] || 0) + 1;
  return out;
}

/** Merge two filters (sim-wide + a group's own): a group that sets tags in a tag group replaces the sim-wide choice there. */
export const mergeFilters = (sim = {}, group = {}) => ({ ...sim, ...Object.fromEntries(Object.entries(group).filter(([, w]) => w?.length)) });

/** Problems with a patient's tags against the catalog (unknown group or tag). */
export function patientTagProblems(t, catalog) {
  if (!t.patientTags || !catalog) return [];
  const p = [];
  for (const [g, ids] of Object.entries(t.patientTags)) {
    const grp = catalog.groups.find((x) => x.id === g);
    if (!grp) { p.push(`patientTags: no tag group "${g}" in data/catalogs/patient-tags.json`); continue; }
    for (const id of ids) if (!grp.tags.some((x) => x.id === id)) p.push(`patientTags.${g}: no tag "${id}" in group "${grp.name}"`);
  }
  return p;
}
