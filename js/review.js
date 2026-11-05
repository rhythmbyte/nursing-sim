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
