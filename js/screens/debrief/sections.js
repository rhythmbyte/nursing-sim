// Debrief sections (render only; data comes from engine/debrief.js).

import { h } from '../shared/dom.js';
import { triageChip } from '../shared/triage-chip.js';
import { toneChip } from '../shared/tone-chip.js';
import { helpTip } from '../shared/help.js';

const sevChip = (s) => h('span', { class: `flag-chip flag-${s}` }, s === 'red' ? 'Red' : 'Amber');
const empty = (text) => h('p', { class: 'muted' }, text);

export function flagsSection(d, { at, room }) {
  return h('section', { class: 'panel' },
    h('h3', {}, 'Flags'),
    d.flags.length ? h('ul', { class: 'flag-list' }, d.flags.map((f) => h('li', {},
      sevChip(f.severity), h('span', { class: 'feed-time' }, at(f.atMin)), h('span', { class: 'feed-room' }, room(f.patientId)),
      h('span', { class: 'flag-msg' }, f.message, h('span', { class: 'muted small' }, ` · ${f.ruleId}`)))))
      : empty('No flags.'));
}

export function responseSection(d, { at, room }) {
  const rt = d.responseTimes;
  const row = (cells) => h('tr', {}, cells.map((c) => h('td', {}, c)));
  return h('section', { class: 'panel' },
    h('h3', {}, 'Response times'),
    h('h4', {}, 'Call lights'),
    rt.callLights.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Patient', 'Lit', 'Answered', 'Response'].map((c) => h('th', {}, c)))),
      h('tbody', {}, rt.callLights.map((c) => row([room(c.patientId), at(c.litAtMin), c.answeredAtMin != null ? at(c.answeredAtMin) : 'Not answered',
        c.responseMin != null ? `${c.responseMin} min` : `${c.openMin} min and counting`])))) : empty('None.'),
    h('h4', {}, 'Parameter orders (condition → action)'),
    rt.parameters.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Patient', 'Order', 'Condition met', 'Action', 'Response'].map((c) => h('th', {}, c)))),
      h('tbody', {}, rt.parameters.map((p) => row([room(p.patientId), p.order, at(p.metAtMin), p.actionAtMin != null ? at(p.actionAtMin) : '—',
        p.responseMin != null ? `${p.responseMin} min (window ${p.windowMin})` : p.pending ? `pending (window ${p.windowMin})` : `none (window ${p.windowMin})`])))) : empty('None triggered.'),
    h('h4', {}, 'Monitor alarms'),
    rt.alarms?.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Patient', 'Alarm', 'Started', 'Silenced', 'Response'].map((c) => h('th', {}, c)))),
      h('tbody', {}, rt.alarms.map((a) => row([room(a.patientId), a.alarms.join(', '), at(a.startedAtMin), a.ackAtMin != null ? at(a.ackAtMin) : (a.clearedAtMin != null ? `cleared ${at(a.clearedAtMin)}` : '—'), a.responseMin != null ? `${a.responseMin} min` : 'not silenced'])))) : empty('No monitor alarms.'),
    h('h4', {}, 'Codes'),
    rt.codes.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Patient', 'Code started', 'First response', 'Response'].map((c) => h('th', {}, c)))),
      h('tbody', {}, rt.codes.map((c) => row([room(c.patientId), at(c.startedAtMin), c.firstResponseAtMin != null ? at(c.firstResponseAtMin) : '—',
        c.responseMin != null ? `${c.responseMin} min` : 'none'])))) : empty('No codes.'),
  );
}

export function orderSequenceSection(d, { at, room }) {
  // Only sets the student worked on; untouched sets are listed in one line.
  const worked = d.orderSequences.filter((s) => s.done.length);
  const untouched = d.orderSequences.filter((s) => !s.done.length);
  return h('section', { class: 'panel' },
    h('h3', {}, 'Order sequence by order set (done vs. correct)'),
    untouched.length ? h('p', { class: 'muted small' }, `No work yet: ${untouched.map((s) => `${room(s.patientId)} · ${s.orderSet}`).join('; ')}`) : null,
    worked.length ? worked.map((s) => h('div', { class: 'seq' },
      h('h4', {}, `${room(s.patientId)} · ${s.orderSet}`),
      h('div', { class: 'seq-cols' },
        h('div', {}, h('strong', {}, 'Done'), h('ol', {}, s.done.map((o, i) => h('li', { class: s.correct[i]?.tier !== o.tier ? 'seq-off' : '' },
          `${at(o.atMin)} · T${o.tier} · ${o.text}`)), s.open.map((o) => h('li', { class: 'seq-open' }, `not done · T${o.tier} · ${o.text}`)))),
        h('div', {}, h('strong', {}, 'Correct (by tier)'), h('ol', {}, s.correct.map((o) => h('li', {}, `T${o.tier} · ${o.text}`)))),
      ))) : empty('No order-set work yet.'),
  );
}

export function vitalsSection(d, { at, room }) {
  return h('section', { class: 'panel' },
    h('h3', {}, 'Charted vs scripted vitals'),
    d.vitalsCompare.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Time', 'Patient', 'Measure', 'Charted', 'Scripted', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, d.vitalsCompare.map((v) => h('tr', { class: v.differs ? 'needs-attention' : '' },
        h('td', {}, at(v.atMin)), h('td', {}, room(v.patientId)), h('td', {}, v.field), h('td', {}, String(v.charted)), h('td', {}, String(v.scripted)),
        h('td', {}, v.differs ? 'Differs' : ''))))) : empty('No charted vitals to compare.'),
  );
}

export function handoffSection(d, { at, room }) {
  return h('section', { class: 'panel' },
    h('h3', {}, 'Handoff'),
    d.handoffs.length ? h('ul', { class: 'feed' }, d.handoffs.map((x) => h('li', {},
      h('span', { class: 'feed-room' }, room(x.patientId)),
      h('span', {}, `opened ${at(x.openedAt)}${x.durationMin != null ? `, ${x.durationMin} min` : ', still open'}`,
        x.notes ? h('div', { class: 'pre muted' }, x.notes) : h('div', { class: 'muted' }, 'No notes.'))))) : empty('No handoffs opened.'),
  );
}

export function recognizeSection(d, { room }) {
  return h('section', { class: 'panel' },
    h('h3', {}, 'Should recognize (instructor only)'),
    d.shouldRecognize.filter((x) => x.items.length).map((x) => h('div', {}, h('h4', {}, room(x.patientId)), h('ul', {}, x.items.map((i) => h('li', {}, i))))),
  );
}

/** Student's priorities over time next to the instructor's tag; mismatches highlighted. */
export function prioritySection(d, { at, room, scale }) {
  const label = Object.fromEntries(scale.levels.map((l) => [l.id, l.label]));
  return h('section', { class: 'panel' },
    h('h3', {}, `Priorities (${scale.label}) vs instructor tag`),
    d.priorities.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Patient', 'From', 'To', 'Student', 'Instructor tag', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, d.priorities.flatMap((p) => p.segments.map((s, i) => h('tr', { class: s.match === false ? 'needs-attention' : '' },
        h('td', {}, i === 0 ? room(p.patientId) : ''),
        h('td', {}, at(s.fromMin)), h('td', {}, at(s.toMin)),
        h('td', {}, s.levelId ? label[s.levelId] : h('span', { class: 'muted' }, 'not set')),
        h('td', {}, triageChip(s.tag)),
        h('td', {}, s.match === false ? 'Mismatch' : s.match ? 'Match' : ''),
      ))))) : empty('No patients.'),
  );
}

/** The student's end-of-sim reflection (questions from data/catalogs/reflection.json). */
export function reflectionSection(d, { at, room, questions }) {
  const r = d.reflection;
  if (!r) return h('section', { class: 'panel' }, h('h3', {}, 'Reflection'), empty('Not submitted yet (opens for students when the sim ends).'));
  return h('section', { class: 'panel' },
    h('h3', {}, 'Reflection vs. should recognize'),
    h('div', { class: 'seq-cols' },
      h('div', {}, h('h4', {}, 'Student\'s reflection'),
        h('dl', { class: 'sbar' }, questions.filter((q) => r.answers[q.id]).map((q) => [h('dt', {}, q.text), h('dd', { class: 'pre' }, r.answers[q.id])]), h('dt', {}, 'Submitted'), h('dd', {}, at(r.atMin)))),
      h('div', {}, h('h4', {}, 'Should recognize'),
        d.reflectionCoverage.map((p) => h('div', {}, h('strong', {}, room(p.patientId)),
          h('ul', {}, p.items.map((x) => h('li', {}, x.item, x.mentioned ? [' ', h('span', { class: 'badge badge-ok', title: `Matched words: ${x.words.join(', ')}` }, 'possible mention')] : null))))),
        h('p', { class: 'muted small' }, '"Possible mention" is a keyword match to help you read, not a grade.'))));
}

/** Timeliness: each order and scheduled med with ordered/due, done, minutes and tag, worst first. */
export function timelinessSection(d, { at, room, tags }) {
  const t = d.timeliness;
  const s = t.summary;
  const parts = [`${s.onTime} on time`, `${s.late} late`, `${s.veryLate} very late`, `${s.never} never done`, s.open ? `${s.open} still open` : null].filter(Boolean);
  return h('section', { class: 'panel' },
    h('h3', {}, 'Timeliness ', helpTip('debrief.timeliness')),
    h('p', {}, h('strong', {}, parts.join(' · ')), s.medianTier1Min != null ? ` · median time to complete tier 1 orders: ${s.medianTier1Min} min` : ' · no tier 1 orders completed'),
    t.rows.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Patient', 'Order / med', 'Ordered / due', 'Done', 'Minutes', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, t.rows.map((r) => h('tr', {},
        h('td', {}, room(r.patientId)),
        h('td', {}, `${r.kind === 'med' ? 'Med: ' : `T${r.tier} · `}${r.label}${r.result && r.result !== 'given' ? ` (${r.result.replace('-', ' ')})` : ''}`),
        h('td', {}, at(r.startAt)), h('td', {}, r.doneAt != null ? at(r.doneAt) : '—'), h('td', {}, String(Math.round(r.minutes))),
        h('td', {}, toneChip(tags[r.tag])))))) : empty('No timed orders or scheduled meds for this student\'s patients.'),
  );
}
