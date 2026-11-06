// Debrief → Assessments: each tool the student (or their delegate) charted vs what the patient's script expected:
// score and interpretation, items that differed, a missed high-risk result; plus late or missed reassessments.
// Symbol + word + color chips. Display only; data from buildDebrief (engine/assessment-review.js, timeliness).

import { h } from '../shared/dom.js';
import { helpTip } from '../shared/help.js';
import { toneChip } from '../shared/tone-chip.js';

const verdict = (r) => (!r.scripted ? toneChip({ symbol: '•', tone: 'neutral', label: 'Not scripted' })
  : r.missedHighRisk ? toneChip({ symbol: '‼', tone: 'red', label: 'Missed high risk' })
    : r.bandMismatch || r.differing.length ? toneChip({ symbol: '≠', tone: 'yellow', label: 'Differs' })
      : toneChip({ symbol: '✓', tone: 'green', label: 'Matches' }));

export function assessmentSection(d, { at, room, tags }) {
  const a = d.assessments;
  if (!a || (!a.rows.length && !a.reassess.length)) return null;
  const late = a.reassess.filter((r) => r.tag !== 'on-time');
  return h('section', { class: 'panel' },
    h('h3', {}, 'Assessments ', helpTip('debrief.assessments')),
    h('p', {}, h('strong', {}, `${a.rows.length} charted · ${a.rows.filter((r) => r.scripted && !r.bandMismatch && !r.differing.length).length} matched the patient · ${a.rows.filter((r) => r.bandMismatch || r.differing.length).length} differed · ${late.length} reassessment${late.length === 1 ? '' : 's'} late or missed`)),
    a.rows.length ? h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, ['Time', 'Patient', 'Tool', 'Charted', 'Patient was', 'Items that differed', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, a.rows.map((r) => h('tr', { class: r.missedHighRisk ? 'tl-red' : r.bandMismatch ? 'tl-amber' : '' },
        h('td', {}, at(r.atMin)), h('td', {}, room(r.patientId)), h('td', {}, r.toolName, String(r.by).startsWith('staff-') ? h('div', { class: 'muted small' }, 'delegated') : null),
        h('td', {}, `${r.score ?? '—'}${r.band ? ` · ${r.band}` : ''}`), h('td', {}, r.scripted ? `${r.expectedScore ?? '—'}${r.expectedBand ? ` · ${r.expectedBand}` : ''}` : '—'),
        h('td', { class: 'small' }, r.differing.map((x) => h('div', {}, `${x.label}: charted ${x.student}, patient ${x.expected}`))),
        h('td', {}, verdict(r)))))) : h('p', { class: 'muted' }, 'No assessment tools charted.'),
    late.length ? h('div', {}, h('h4', {}, 'Reassessments late or missed'),
      h('ul', {}, late.map((r) => h('li', {}, `${at(r.startAt)} ${room(r.patientId)}: ${r.label} `, toneChip(tags[r.tag]))))) : null);
}
