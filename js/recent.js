// Recent items for the Instructor Home: sims run or set up, patients edited, past debriefs opened (UI layer;
// persistence through storage.js). Newest first, one entry per item, at most MAX.
//   item = { kind: 'sim' | 'patient' | 'debrief', id, label, what, at }

import { load, save } from './storage.js';

const KEY = 'ui.recent';
const MAX = 8;

export function noteRecent(kind, id, label, what) {
  const list = (load(KEY) || []).filter((x) => !(x.kind === kind && x.id === id));
  list.unshift({ kind, id, label, what, at: Date.now() });
  save(KEY, list.slice(0, MAX));
}

export const recentItems = () => load(KEY) || [];

export function forgetRecent(kind, id) {
  save(KEY, (load(KEY) || []).filter((x) => !(x.kind === kind && x.id === id)));
}
