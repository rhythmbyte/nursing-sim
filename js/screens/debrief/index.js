// Debrief (instructor): per-student flags, response times, order sequence, charted vs scripted vitals,
// handoff notes, "should recognize", and the full timeline with flags inline. CSV export + print view.

import { h, clear } from '../shared/dom.js';
import { formatShiftTime } from '../../engine/time.js';
import { load, save } from '../../storage.js';
import { describeEntry } from './describe.js';
import { toCsv, downloadCsv } from './csv.js';
import { flagsSection, responseSection, orderSequenceSection, vitalsSection, handoffSection, recognizeSection } from './sections.js';

const STUDENT_KEY = 'ui.debrief.student';

export function mountDebrief(root, { store, runner, templatesById, scenario, catalogs }) {
  let userId = load(STUDENT_KEY);
  const labelOf = (id) => catalogs.interventions.interventions.find((i) => i.id === id)?.label || id;
  const orderText = (pid, oid) => templatesById[pid]?.orders.find((o) => o.id === oid)?.text || oid;
  const patientName = (pid) => templatesById[pid]?.demographics.name || pid || '';
  const room = (pid) => (pid ? `Rm ${templatesById[pid].demographics.room} ${templatesById[pid].demographics.name}` : 'Unit');
  const body = h('div', { class: 'debrief-body' });

  function csvFor(d, at) {
    const header = ['sim_time', 'sim_min', 'wall_time', 'user', 'role', 'patient', 'action', 'description', 'flag_severity', 'flag_rule', 'flag_message', 'details_json'];
    const rows = d.timeline.map((t) => {
      const l = t.entry;
      const f = t.flags;
      return [at(t.atMin), t.atMin, l?.wallTime ?? '', l?.userId ?? '', l?.role ?? '', l?.patientId ?? f[0]?.patientId ?? '',
        l?.action ?? 'flag', l ? describeEntry(l, { labelOf, orderText, patientName }) : '',
        f.map((x) => x.severity).join('|'), f.map((x) => x.ruleId).join('|'), f.map((x) => x.message).join(' | '), l ? JSON.stringify(l.details) : ''];
    });
    return toCsv(header, rows);
  }

  function render() {
    const roster = Object.entries(runner.state.roster);
    if (!roster.length) {
      clear(body).append(h('header', { class: 'screen-header' }, h('h2', {}, 'Debrief')), h('p', { class: 'muted' }, 'No students have joined yet.'));
      return;
    }
    if (!runner.state.roster[userId]) userId = roster[0][0];
    const groupName = (gid) => scenario.groups.find((g) => g.id === gid)?.name || gid;
    const d = runner.debrief(userId);
    const at = (m) => formatShiftTime(runner.state.startClock, m);
    const helpers = { at, room };
    const select = h('select', {
      'aria-label': 'Student',
      onchange: (e) => { userId = e.target.value; save(STUDENT_KEY, userId); render(); },
    }, roster.map(([id, r]) => h('option', { value: id, selected: id === userId }, `${r.name} · ${groupName(r.groupId)}`)));

    clear(body).append(
      h('header', { class: 'screen-header debrief-header' },
        h('h2', {}, 'Debrief'),
        select,
        h('span', { class: 'flag-chip flag-red' }, `${d.counts.red} red`),
        h('span', { class: 'flag-chip flag-amber' }, `${d.counts.amber} amber`),
        h('span', { class: 'muted' }, `as of ${at(runner.simMin())}`),
        h('div', { class: 'debrief-actions' },
          h('button', { class: 'btn', onclick: () => downloadCsv(`debrief-${runner.state.roster[userId].name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, csvFor(d, at)) }, 'Export CSV'),
          h('button', { class: 'btn', onclick: () => window.print() }, 'Print'),
        ),
      ),
      flagsSection(d, helpers),
      responseSection(d, helpers),
      orderSequenceSection(d, helpers),
      vitalsSection(d, helpers),
      handoffSection(d, helpers),
      recognizeSection(d, helpers),
      h('section', { class: 'panel' },
        h('h3', {}, 'Timeline'),
        h('table', { class: 'data-table timeline' },
          h('thead', {}, h('tr', {}, ['Time', 'Patient', 'Who', 'What', 'Flags'].map((c) => h('th', {}, c)))),
          h('tbody', {}, d.timeline.map((t) => h('tr', { class: `tl-${t.kind}${t.flags.some((f) => f.severity === 'red') ? ' tl-red' : t.flags.length ? ' tl-amber' : ''}` },
            h('td', {}, at(t.atMin)),
            h('td', {}, t.entry?.patientId || t.flags[0]?.patientId ? room(t.entry?.patientId || t.flags[0].patientId) : ''),
            h('td', {}, t.entry ? t.entry.userId : ''),
            h('td', {}, t.entry ? describeEntry(t.entry, { labelOf, orderText, patientName }) : ''),
            h('td', {}, t.flags.map((f) => h('div', {}, h('span', { class: `flag-chip flag-${f.severity}` }, f.severity), ' ', f.message))),
          ))),
        ),
      ),
    );
  }

  root.append(body);
  render();
  const off = store.subscribe(render);
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
  return () => { off(); offTick(); };
}
