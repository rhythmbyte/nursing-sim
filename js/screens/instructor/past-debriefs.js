// Instructor → Past debriefs: every finished sim kept in this browser (js/archive.js), newest first. Open shows its
// debrief (all three tiers) read-only: the patients are made again from the sim's case seeds, so names, values and
// drugs match what the students saw. Delete asks first.

import { h, clear } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { pastDebriefs, loadPastDebrief, deletePastDebrief, archivedContext } from '../../archive.js';
import { noteRecent, forgetRecent } from '../../recent.js';
import { mountDebrief } from '../debrief/index.js';

export function mountPastDebriefs(root, ctx, { openId = null, onOpen = () => {} } = {}) {
  const body = h('div', {});
  let cleanup = null;
  function list() {
    if (typeof cleanup === 'function') cleanup(); cleanup = null;
    const items = pastDebriefs();
    clear(body).append(
      h('header', { class: 'screen-header' }, h('h2', {}, 'Past debriefs'), helpTip('home.past')),
      items.length ? h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, ['Sim', 'Ended', 'Students', 'Groups', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, items.map((x) => h('tr', {},
          h('td', {}, x.name), h('td', {}, new Date(x.endedAt).toLocaleString()), h('td', {}, String(x.students)), h('td', {}, String(x.groups)),
          h('td', { class: 'row-actions' },
            h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => show(x.id) }, 'Open'),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { if (window.confirm(`Delete the debrief of "${x.name}"? This can't be undone.`)) { deletePastDebrief(x.id); forgetRecent('debrief', x.id); list(); } } }, 'Delete'))))))
        : h('p', { class: 'muted' }, 'No finished sims yet. When a sim ends, its debrief is kept here.'));
  }
  function show(id) {
    const entry = loadPastDebrief(id);
    if (!entry) { list(); return; }
    noteRecent('debrief', id, entry.name, 'Debrief');
    onOpen(id);
    if (typeof cleanup === 'function') cleanup();
    clear(body).append(h('div', { class: 'controls' }, h('button', { class: 'btn', type: 'button', onclick: () => { onOpen(null); list(); } }, '← Past debriefs'),
      h('span', { class: 'muted' }, `${entry.name} · ended ${new Date(entry.endedAt).toLocaleString()}`)));
    const host = h('div', {});
    body.append(host);
    cleanup = mountDebrief(host, archivedContext(entry, ctx.data));
  }
  root.append(body);
  if (openId) show(openId); else list();
  return () => { if (typeof cleanup === 'function') cleanup(); };
}
