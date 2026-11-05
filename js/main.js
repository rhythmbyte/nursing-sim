// Boots the app: load + validate data, build the store, mount the tab shell.

import { loadAll } from './data-loader.js';
import { createStore } from './state.js';
import { mountShell } from './screens/shell.js';
import { mountLibrary } from './screens/instructor/library.js';
import { placeholder } from './screens/shared/placeholder.js';
import { h } from './screens/shared/dom.js';

function studentCount(scenario) {
  const n = (scenario?.groups || []).reduce((sum, g) => sum + g.studentCount, 0);
  return Math.max(1, n);
}

function buildTabs(store) {
  const data = store.get().data;
  const scenario = data.scenarios[0];
  const tabs = [{ id: 'instructor', label: 'Instructor', mount: (root) => mountLibrary(root, data) }];

  for (let i = 1; i <= studentCount(scenario); i++) {
    tabs.push({
      id: `student-${i}`,
      label: `Student ${i}`,
      mount: (root) => root.append(placeholder(`Student ${i}`, 3, 'Join form, assigned patients, handoff, and the Epic-lite chart.')),
    });
  }

  if (scenario?.settings.chargeNurse !== 'off') {
    tabs.push({
      id: 'charge',
      label: 'Charge',
      mount: (root) => root.append(placeholder('Charge nurse', 7, 'Unit overview and the admissions board.')),
    });
  }

  tabs.push({
    id: 'debrief',
    label: 'Debrief',
    mount: (root) => root.append(placeholder('Debrief', 5, 'Per-student timeline, flags, order sequence, response times, CSV export.')),
  });
  return tabs;
}

async function boot() {
  const root = document.getElementById('app');
  try {
    const data = await loadAll();
    if (data.problems.length) console.warn('Data validation problems:', data.problems);
    const store = createStore({ data });
    mountShell(root, buildTabs(store));
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('div', { class: 'banner banner-error', role: 'alert' },
      h('strong', {}, 'Could not load sim data. '),
      String(err.message || err),
      h('p', { class: 'muted' }, 'If you opened index.html from disk, serve the folder instead (e.g. python3 -m http.server).'),
    ));
  }
}

boot();
