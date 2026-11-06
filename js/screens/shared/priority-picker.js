// The viewer's OWN priority for a patient, on the scenario's scale (data/catalogs/priority-scales.json).
// Never shows the instructor's tag; that's triageChip, gated by canSeeInstructorTags.

import { h } from './dom.js';

export function priorityPicker(scale, currentLevelId, onPick, { label = 'My priority' } = {}) {
  const level = scale.levels.find((l) => l.id === currentLevelId);
  const select = h('select', {
    class: `prio-select${level ? ` prio-${level.tone || 'neutral'}` : ''}`,
    'aria-label': label,
    onclick: (e) => e.stopPropagation(),
    onchange: (e) => { if (e.target.value) onPick(e.target.value); },
  },
    h('option', { value: '', selected: !level, disabled: true }, 'Not set'),
    scale.levels.map((l) => h('option', { value: l.id, selected: l.id === currentLevelId, title: l.description || '' }, l.label)));
  return h('label', { class: 'inline prio-picker', onclick: (e) => e.stopPropagation() }, `${label} `, select);
}
