// Assessment tool scoring (pure, no DOM, no session). Tools come from data/catalogs/assessment-tools.json.
// answers = { itemId: value } — a choice stores its option's points, a scale/numeric item its number, text its text.
// scoring: 'sum' (default) | 'single' (the one item's value) | 'rule' (positiveIf → 1/0) | 'auto' (from vitals) | 'none'.

export const toolById = (catalogs, id) => catalogs?.assessmentTools?.tools.find((t) => t.id === id) || null;
/** Tools a sim offers (settings.assessmentTools: 'public' (default) | 'all' | [ids]). */
export function availableTools(settings, catalogs) {
  const all = catalogs?.assessmentTools?.tools || [];
  const pick = settings?.assessmentTools ?? 'public';
  if (pick === 'all') return all;
  if (pick === 'public') return all.filter((t) => t.license?.status === 'public');
  return all.filter((t) => pick.includes(t.id));
}

const scored = (item) => item.type !== 'text';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Interpretation band for a score (bands are inclusive), or null. */
export function bandFor(tool, score) {
  if (score == null) return null;
  return (tool.bands || []).find((b) => score >= b.min && score <= b.max) || null;
}

/** NEWS2 from vitals. alert = false when the patient isn't alert (new confusion, GCS < 15). Returns { score, parts }. */
export function news2(tool, vitals, { alert = true } = {}) {
  const R = tool.autoRules;
  const pick = (rows, v) => (v == null ? null : rows.find(([lo, hi]) => (lo == null || v >= lo) && (hi == null || v <= hi))?.[2] ?? null);
  const sbp = Number(/^(\d+)\//.exec(String(vitals.bp ?? ''))?.[1]) || null;
  const tempC = isNum(vitals.tempF) ? Math.round(((vitals.tempF - 32) * 5) / 9 * 10) / 10 : null;
  const o2 = String(vitals.o2 ?? '').trim().toLowerCase();
  const parts = {
    rr: pick(R.rr, vitals.rr), spo2: pick(R.spo2, vitals.spo2), sbp: pick(R.sbp, sbp), hr: pick(R.hr, vitals.hr), tempC: pick(R.tempC, tempC),
    oxygen: o2 && !R.roomAir.includes(o2) ? R.onOxygen : 0, consciousness: alert ? 0 : R.notAlert,
  };
  return { score: Object.values(parts).reduce((s, v) => s + (v || 0), 0), parts };
}

/**
 * Score one completed (or partly completed) tool. Returns { score, band, complete, missing: [itemIds], parts? }.
 * `vitals` / `alert` are used only by auto tools (NEWS2).
 */
export function scoreTool(tool, answers = {}, { vitals = {}, alert = true } = {}) {
  const method = tool.scoring || 'sum';
  if (method === 'auto') { const n = news2(tool, vitals, { alert }); return { score: n.score, band: bandFor(tool, n.score), complete: true, missing: [], parts: n.parts }; }
  const missing = tool.items.filter((i) => scored(i) && !isNum(answers[i.id])).map((i) => i.id);
  if (method === 'none') return { score: null, band: null, complete: tool.items.every((i) => answers[i.id] != null && answers[i.id] !== ''), missing: [] };
  let score;
  if (method === 'rule') {
    const yes = (id) => answers[id] > 0;
    score = (tool.positiveIf.all || []).every(yes) && (!(tool.positiveIf.any || []).length || tool.positiveIf.any.some(yes)) ? 1 : 0;
  } else if (method === 'single') {
    score = isNum(answers[tool.items[0].id]) ? answers[tool.items[0].id] : null;
  } else {
    score = tool.items.filter(scored).reduce((s, i) => s + (isNum(answers[i.id]) ? answers[i.id] : 0), 0);
  }
  return { score: missing.length && method !== 'sum' ? null : score, band: bandFor(tool, score), complete: !missing.length, missing };
}

/** The label a stored value stands for ("2: slightly drowsy…", "7", or the text). */
export function answerLabel(item, value) {
  if (value == null || value === '') return '—';
  if (item.type === 'choice') return item.options.find((o) => o.points === value)?.label ?? String(value);
  return String(value);
}

/** Items whose answers differ between two answer sets (only items answered in `expected`). */
export function differingItems(tool, answers, expected) {
  return tool.items.filter((i) => expected?.[i.id] != null && expected[i.id] !== '' && String(answers?.[i.id] ?? '') !== String(expected[i.id]))
    .map((i) => ({ itemId: i.id, label: i.label, student: answerLabel(i, answers?.[i.id]), expected: answerLabel(i, expected[i.id]) }));
}

/** Per-entry checks the schema can't express: unique ids, band ranges, rule items exist, auto rules present. */
export function assessmentCatalogProblems(catalog) {
  const p = [];
  const ids = new Set();
  for (const t of catalog?.tools || []) {
    const at = `assessment tool "${t.id}"`;
    if (ids.has(t.id)) p.push(`${at}: defined twice`); ids.add(t.id);
    const itemIds = t.items.map((i) => i.id);
    if (new Set(itemIds).size !== itemIds.length) p.push(`${at}: item ids must be unique`);
    for (const i of t.items) {
      if (i.type === 'choice' && !i.options?.length) p.push(`${at} item "${i.id}": a choice needs options`);
      if (i.type === 'choice' && new Set(i.options.map((o) => o.points)).size !== i.options.length) p.push(`${at} item "${i.id}": option points must be unique (they are what is stored)`);
      if (i.type === 'scale' && !(i.min <= i.max)) p.push(`${at} item "${i.id}": a scale needs min ≤ max`);
    }
    for (const b of t.bands || []) if (b.min > b.max) p.push(`${at}: band "${b.label}" has min > max`);
    if (t.scoring === 'rule') for (const id of [...(t.positiveIf?.all || []), ...(t.positiveIf?.any || [])]) if (!itemIds.includes(id)) p.push(`${at} positiveIf: no item "${id}"`);
    if (t.scoring === 'auto' && !t.autoRules) p.push(`${at}: an auto tool needs autoRules`);
  }
  return p;
}
