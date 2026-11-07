// Debrief Tier 3, full breakdown (instructor): per student of one group, flags, timeliness, tasks, delegation,
// patient states, assessments, reflection, priorities, response times, order sequence, charted vs scripted vitals,
// handoff notes, "should recognize", and the full timeline with flags inline. CSV export + print view.
// nav = { groupId, userId, section, onSummary, onPoints }: sections carry ids (sec-<name>) for evidence links.

import { instructorPatientLabel } from '../shared/labels.js';
import { h, clear } from '../shared/dom.js';
import { formatShiftTime } from '../../engine/time.js';
import { describeEntry } from './describe.js';
import { toCsv, downloadCsv } from './csv.js';
import { flagsSection, responseSection, orderSequenceSection, vitalsSection, handoffSection, recognizeSection, prioritySection, reflectionSection, timelinessSection } from './sections.js';
import { timelinessConfig } from '../../engine/timeliness.js';
import { scriptStatesSection } from './script-section.js';
import { assessmentSection } from './assessment-section.js';
import { taskSection } from './task-section.js';
import { delegationSection } from './delegation-section.js';
import { activeScale } from '../../engine/priority.js';
import { codeName } from '../../engine/cases.js';

const detail = (el) => { el.classList.add('debrief-detail'); return el; }; // left out of "Print summary"
const sec = (name, el) => { if (el) el.id = `sec-${name}`; return el; }; // evidence links scroll here

// The patients this student's group had, as generated for this sim (the debrief compares against these values).
function casesLine(runner, templatesById, groupId) {
  const pts = Object.entries(runner.state.patients).filter(([, ps]) => ps.groupId === groupId).map(([pid]) => templatesById[pid]).filter((t) => t?.instance);
  if (!pts.length) return null;
  return h('section', { class: 'panel debrief-cases' }, h('h3', {}, 'Patients in this sim'), h('ul', {}, pts.map((t) => h('li', {}, instructorPatientLabel(t)))));
}

export function mountBreakdown(root, { store, runner, templatesById, scenario, catalogs }, nav) {
  let userId = nav.userId;
  const target = nav.section ? `sec-${nav.section}` : null; // an evidence link: highlighted on every render, scrolled to once
  let scrolled = false;
  const labelOf = (id) => catalogs.interventions.interventions.find((i) => i.id === id)?.label || id;
  const orderText = (pid, oid) => templatesById[pid]?.orders.find((o) => o.id === oid)?.text || oid;
  const patientName = (pid) => (templatesById[pid] ? codeName(templatesById[pid]) : pid || '');
  const room = (pid) => (pid ? instructorPatientLabel(templatesById[pid]) : 'Unit');
  const body = h('div', { class: 'debrief-body' });

  function csvFor(d, at) {
    const header = ['sim_time', 'sim_min', 'wall_time_utc', 'wall_time_local', 'user', 'role', 'patient', 'action', 'description', 'flag_severity', 'flag_rule', 'flag_message', 'details_json'];
    const rows = d.timeline.map((t) => {
      const l = t.entry;
      const f = t.flags;
      return [at(t.atMin), t.atMin, l?.wallTime ?? '', l ? new Date(l.wallTime).toLocaleString() : '', l?.userId ?? '', l?.role ?? '', l?.patientId ?? f[0]?.patientId ?? '',
        l?.action ?? 'flag', l ? describeEntry(l, { labelOf, orderText, patientName }) : '',
        f.map((x) => x.severity).join('|'), f.map((x) => x.ruleId).join('|'), f.map((x) => x.message).join(' | '), l ? JSON.stringify(l.details) : ''];
    });
    // Timeliness rows (one per order/med) after the timeline rows.
    const tl = d.timeliness.rows.map((r) => [at(r.startAt), r.startAt, '', '', '', '', r.patientId, 'timeliness', r.label, r.tag, 'timeliness', `${Math.round(r.minutes)} min${r.doneAt != null ? `, done ${at(r.doneAt)}` : ''}`, JSON.stringify({ kind: r.kind, tier: r.tier, startAt: r.startAt, doneAt: r.doneAt, minutes: r.minutes, tag: r.tag })]);
    // Patient-state rows (reactive scripts): one per state change, cause in flag_message.
    const st = (d.scripts || []).flatMap((p) => p.rows.slice(1).map((r) => [at(r.atMin), r.atMin, '', '', r.by || '', '', p.patientId, 'patient-state', `${r.fromLabel} → ${r.label}`, r.nothingDone ? 'nothing-done' : '', 'script', r.causeText, JSON.stringify({ from: r.from, to: r.to, cause: r.cause })]));
    return toCsv(header, [...rows, ...tl, ...st]);
  }

  function render() {
    draw();
    const el = target && document.getElementById(target);
    if (!el) return;
    el.classList.add('debrief-target');
    if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'start' }); }
  }

  function draw() {
    const roster = Object.entries(runner.state.roster).filter(([, r]) => !nav.groupId || r.groupId === nav.groupId);
    const back = h('div', { class: 'controls debrief-nav' }, h('button', { class: 'btn', type: 'button', onclick: nav.onSummary }, '← Summary'),
      nav.onPoints ? h('button', { class: 'btn', type: 'button', onclick: nav.onPoints }, 'Talking points') : null);
    if (!roster.length) {
      clear(body).append(back, h('header', { class: 'screen-header' }, h('h2', {}, 'Full breakdown')), h('p', { class: 'muted' }, 'No students in this group.'));
      return;
    }
    if (!roster.some(([id]) => id === userId)) userId = roster[0][0];
    const groupName = (gid) => scenario.groups.find((g) => g.id === gid)?.name || gid;
    const d = runner.debrief(userId);
    const at = (m) => formatShiftTime(runner.state.startClock, m);
    const helpers = { at, room, scale: activeScale(scenario.settings, catalogs) };
    const select = h('select', {
      'aria-label': 'Student',
      onchange: (e) => { userId = e.target.value; nav.onStudent?.(userId); render(); },
    }, roster.map(([id, r]) => h('option', { value: id, selected: id === userId }, `${r.name} · ${groupName(r.groupId)}`)));

    clear(body).append(
      back,
      h('header', { class: 'screen-header debrief-header' },
        h('h2', {}, `Full breakdown · ${groupName(runner.state.roster[userId].groupId)}`),
        select,
        h('span', { class: 'flag-chip flag-red' }, `${d.counts.red} red`),
        h('span', { class: 'flag-chip flag-amber' }, `${d.counts.amber} amber`),
        d.timeAway?.times ? h('span', { class: 'flag-chip', title: 'Reloads, crashes, closed tabs and rejoins' }, `↻ away ${d.timeAway.totalMin} min (${d.timeAway.times}×)`) : null,
        h('span', { class: 'muted' }, `as of ${at(runner.simMin())}`),
        h('div', { class: 'debrief-actions' },
          h('button', { class: 'btn', onclick: () => downloadCsv(`debrief-${runner.state.roster[userId].name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, csvFor(d, at)) }, 'Export CSV'),
          h('button', { class: 'btn', onclick: () => window.print() }, 'Print full'),
          h('button', { class: 'btn', onclick: () => {
            // Print-friendly summary: hides the long sections (marked .debrief-detail) for this print only.
            document.body.classList.add('print-debrief-summary');
            const done = () => { document.body.classList.remove('print-debrief-summary'); window.removeEventListener('afterprint', done); };
            window.addEventListener('afterprint', done);
            window.print();
          } }, 'Print summary'),
        ),
      ),
      casesLine(runner, templatesById, runner.state.roster[userId].groupId),
      sec('flags', flagsSection(d, helpers)),
      sec('timeliness', timelinessSection(d, { ...helpers, tags: timelinessConfig(runner.state, catalogs).tags || {} })),
      sec('tasks', taskSection(d, helpers)),
      sec('delegation', delegationSection(d, { ...helpers, groupName })),
      sec('scripts', scriptStatesSection(d, helpers)),
      sec('assessments', assessmentSection(d, { ...helpers, tags: timelinessConfig(runner.state, catalogs).tags || {} })),
      sec('reflection', reflectionSection(d, { ...helpers, questions: catalogs.reflection?.questions || [] })),
      sec('priorities', prioritySection(d, helpers)),
      sec('responses', responseSection(d, helpers)),
      sec('sequence', detail(orderSequenceSection(d, helpers))),
      sec('vitals', detail(vitalsSection(d, helpers))),
      sec('handoff', detail(handoffSection(d, helpers))),
      sec('recognize', detail(recognizeSection(d, helpers))),
      h('section', { class: 'panel debrief-detail' },
        h('h3', {}, 'Timeline'),
        h('table', { class: 'data-table timeline' },
          h('thead', {}, h('tr', {}, ['Time', 'Patient', 'Who', 'What', 'Flags'].map((c) => h('th', {}, c)))),
          h('tbody', {}, d.timeline.map((t) => h('tr', { class: `tl-${t.kind}${t.struck ? ' struck' : ''}${t.flags.some((f) => f.severity === 'red') ? ' tl-red' : t.flags.length ? ' tl-amber' : ''}` },
            h('td', {}, at(t.atMin)),
            h('td', {}, t.entry?.patientId || t.flags[0]?.patientId ? room(t.entry?.patientId || t.flags[0].patientId) : ''),
            h('td', {}, t.entry ? t.entry.userId : ''),
            h('td', {}, t.entry ? describeEntry(t.entry, { labelOf, orderText, patientName }) : '', t.struck ? h('div', { class: 'struck-note' }, `Entered in error: ${t.struck.reason}`) : null),
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
