// Summary: problems, latest vitals, alerts, revealed assessment findings, handoff notes.
// Never hint that unrevealed finding changes exist; the student has to reassess to find out.

import { h, clear } from '../shared/dom.js';
import { at } from './util.js';
import { latestVitals } from './flowsheet.js';

export default {
  id: 'summary',
  label: 'Summary',
  mount(root, { pid, view, user }) {
    const vitals = h('div', {});
    const alerts = h('div', {});
    const findings = h('div', {});
    const handoffNotes = h('div', {});

    root.append(h('div', { class: 'chart-grid' },
      h('section', { class: 'panel' }, h('h3', {}, 'Active problems'),
        h('ul', {}, h('li', {}, h('strong', {}, view.admittingDx)), (view.pmh || []).map((p) => h('li', {}, p)))),
      h('section', { class: 'panel' }, h('h3', {}, 'Latest vitals'), vitals),
      h('section', { class: 'panel' }, h('h3', {}, 'Alerts'), alerts),
      h('section', { class: 'panel' }, h('h3', {}, 'Assessment findings'), findings),
      h('section', { class: 'panel' }, h('h3', {}, 'My handoff notes'), handoffNotes),
      h('section', { class: 'panel' }, h('h3', {}, 'History of present illness'), h('p', {}, view.hpi || '—')),
    ));

    return {
      update(state) {
        const ps = state.patients[pid];
        const v = latestVitals(state, pid, view);
        clear(vitals).append(h('dl', { class: 'vitals' },
          ['bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain'].filter((k) => v.values[k] != null)
            .map((k) => [h('dt', {}, k === 'tempF' ? 'Temp' : k.toUpperCase()), h('dd', {}, String(v.values[k]))])),
        h('p', { class: 'muted' }, v.label));

        const items = state.alerts.filter((a) => a.patientId === pid && a.audience.includes('student')).reverse().slice(0, 5);
        clear(alerts).append(items.length
          ? h('ul', { class: 'feed' }, items.map((a) => h('li', {}, h('span', { class: 'feed-time' }, at(state, a.simMin)), a.message)))
          : h('p', { class: 'muted' }, 'None.'));

        clear(findings).append(...(ps.revealed.length
          ? ps.revealed.map((r) => h('div', { class: 'finding-block' },
            h('div', { class: 'muted' }, `Assessed ${at(state, r.atMin)}${r.source === 'baseline' ? '' : ' · new findings'}`),
            h('ul', {}, r.findings.map((f) => h('li', {}, f)))))
          : [h('p', { class: 'muted' }, 'Chart a focused or head-to-toe assessment to see findings.')]));

        const hn = state.students[user.userId]?.handoff?.[pid];
        clear(handoffNotes).append(hn?.notes ? h('p', { class: 'pre' }, hn.notes) : h('p', { class: 'muted' }, 'No notes.'));
      },
    };
  },
};
