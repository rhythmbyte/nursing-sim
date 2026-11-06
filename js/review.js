// Content-review helpers. No DOM.
// Anything tagged "review": "proposed" (or "partial") was drafted by AI and awaits the instructor.

const NEEDS_REVIEW = new Set(['proposed', 'partial']);

/** Counts every object in the tree (including the root) whose `review` needs instructor review. */
export function countNeedsReview(node) {
  if (Array.isArray(node)) return node.reduce((n, item) => n + countNeedsReview(item), 0);
  if (node && typeof node === 'object') {
    let n = NEEDS_REVIEW.has(node.review) ? 1 : 0;
    for (const v of Object.values(node)) n += countNeedsReview(v);
    return n;
  }
  return 0;
}

export function needsReview(obj) {
  return Boolean(obj) && NEEDS_REVIEW.has(obj.review);
}

/** Readable label for a reviewable node at `path` in a patient template. */
function labelFor(path, node) {
  const [top, idx, sub] = path;
  if (!path.length) return 'Whole patient file';
  if (top === 'orders') return `Order: ${node.text}`;
  if (top === 'events') return `Event (${node.type}): ${node.payload?.message || node.id}`;
  if (top === 'labs') return `Lab: ${node.label || node.code}${node.value != null ? ` = ${node.value}` : ''}`;
  if (top === 'vitals' && idx === 'keyframes') return `Vitals change at ${node.atMin ?? node.trigger ?? sub} min`;
  const names = { handoff: 'Handoff (SBAR)', findings: 'Assessment findings', debrief: 'Debrief', codeBranch: 'Code branch', vitals: 'Vitals' };
  return names[top] || path.join(' › ');
}

/** Every node tagged proposed/partial: [{ path, label, status }] (root first). */
export function reviewItems(template) {
  const out = [];
  (function walk(node, path) {
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, [...path, i])); return; }
    if (!node || typeof node !== 'object') return;
    if (NEEDS_REVIEW.has(node.review)) out.push({ path, label: labelFor(path, node), status: node.review });
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, [...path, k]);
  })(template, []);
  return out;
}

/** Copy of `template` with the node at `path` marked approved (the instructor's call, never Claude's). */
export function approveAt(template, path) {
  const copy = structuredClone(template);
  const node = path.reduce((n, k) => n?.[k], copy);
  if (!node || typeof node !== 'object') throw new Error(`Nothing to approve at ${path.join('.')}`);
  node.review = 'approved';
  return copy;
}
