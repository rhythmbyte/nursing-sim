import { h } from './dom.js';
import { needsReview } from '../../review.js';

export function badge(text, kind = 'neutral', title) {
  return h('span', { class: `badge badge-${kind}`, title }, text);
}

/** "Needs review" badge for an object tagged proposed/partial; null otherwise. */
export function reviewBadge(obj) {
  if (!needsReview(obj)) return null;
  return badge('Needs review', 'review', `Drafted content (${obj.review}). Instructor must approve.`);
}
