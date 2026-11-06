// Per-patient instructor controls: push an order (as the provider), call light on/off, start a code,
// and record ROSC / no ROSC. Clinical choices stay with the instructor; nothing here judges them.

import { h } from '../shared/dom.js';
import { openModal, promptText } from '../shared/modal.js';
import { triageChip } from '../shared/triage-chip.js';
import { formatShiftTime } from '../../engine/time.js';
import { activeScale, currentPriority } from '../../engine/priority.js';

function pushOrderModal(runner, pid, name, catalogs, user) {
  const text = h('input', { class: 'input', 'aria-label': 'Order text' });
  const type = h('select', { 'aria-label': 'Type' }, ['once', 'prn', 'scheduled', 'continuous'].map((t) => h('option', { value: t }, t)));
  const tier = h('select', { 'aria-label': 'Tier' }, [1, 2, 3].map((t) => h('option', { value: t }, `Tier ${t}`)));
  const iv = h('select', { 'aria-label': 'Satisfied by' }, h('option', { value: '' }, '(none)'),
    catalogs.interventions.interventions.map((i) => h('option', { value: i.id }, i.label)));
  const med = h('input', { class: 'input', 'aria-label': 'Medication', placeholder: 'Only for med orders, e.g. Morphine 2 mg IV' });
  const delegable = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  openModal({
    title: `Push order · ${name}`,
    body: h('div', { class: 'iv-form' },
      h('label', { class: 'field' }, h('span', {}, 'Order'), text),
      h('div', { class: 'controls' }, h('label', { class: 'inline' }, 'Type ', type), h('label', { class: 'inline' }, tier)),
      h('label', { class: 'field' }, h('span', {}, 'Charting this intervention satisfies it'), iv),
      h('label', { class: 'field' }, h('span', {}, 'Medication (shows on the MAR)'), med),
      h('label', { class: 'inline' }, delegable, ' Delegable to LPN/CNA'),
      err),
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Push order', kind: 'primary', onClick: () => {
          try {
            runner.pushOrder(pid, { text: text.value, type: type.value, tier: Number(tier.value), interventionIds: iv.value ? [iv.value] : [], med: med.value, delegable: delegable.checked }, user);
            return true;
          } catch (e) { err.textContent = e.message; return false; }
        },
      },
    ],
  });
  text.focus();
}

export function patientsPanel(runner, templatesById, catalogs, user) {
  const state = runner.state;
  const at = (m) => formatShiftTime(state.startClock, m);
  const rows = Object.entries(state.patients).filter(([, ps]) => ps.present);
  const scale = activeScale(state.settings, catalogs);
  return h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Patient', 'Tag', 'Student priorities', 'Status', 'Actions'].map((c) => h('th', {}, c)))),
    h('tbody', {}, rows.map(([pid, ps]) => {
      const d = templatesById[pid].demographics;
      const name = `Rm ${d.room} ${d.name}`;
      const status = [
        ps.callLight ? `call light since ${at(ps.callLight.since)}` : null,
        ps.code ? (ps.code.outcome ? `code ${at(ps.code.startedMin)}–${at(ps.code.endedMin)}: ${ps.code.outcome === 'rosc' ? 'ROSC' : 'no ROSC'}` : `CODING since ${at(ps.code.startedMin)}`) : null,
        !ps.alive ? 'deceased' : null,
      ].filter(Boolean).join(' · ') || '—';
      return h('tr', { class: ps.code && !ps.code.outcome ? 'needs-attention' : '' },
        h('td', {}, name),
        h('td', {}, triageChip(ps.tag)),
        h('td', {}, Object.entries(state.roster).filter(([, r]) => r.groupId === ps.groupId)
          .map(([uid, r]) => `${r.name}: ${scale.levels.find((l) => l.id === currentPriority(state, uid, pid))?.label || '—'}`).join(', ') || '—'),
        h('td', {}, status),
        h('td', { class: 'row-actions' },
          h('button', { class: 'btn btn-small', disabled: !ps.alive, onclick: () => pushOrderModal(runner, pid, name, catalogs, user) }, 'Push order'),
          ps.callLight
            ? h('button', { class: 'btn btn-small', onclick: () => runner.setCallLight(pid, false, '', user) }, 'Call light off')
            : h('button', { class: 'btn btn-small', disabled: !ps.alive, onclick: async () => {
              const msg = await promptText(`Call light · ${name}`, 'What the patient says', { required: false, okLabel: 'Turn on' });
              if (msg != null) runner.setCallLight(pid, true, msg, user);
            } }, 'Call light on'),
          !ps.code ? h('button', { class: 'btn btn-small btn-danger', onclick: async () => {
            const rhythm = await promptText(`Start code · ${name}`, 'Rhythm (optional)', { required: false, okLabel: 'Start code' });
            if (rhythm != null) runner.startCode(pid, { rhythm }, user);
          } }, 'Start code') : null,
          ps.code && !ps.code.outcome ? [
            h('button', { class: 'btn btn-small btn-primary', onclick: () => runner.setCodeOutcome(pid, 'rosc', user) }, 'ROSC'),
            h('button', { class: 'btn btn-small btn-danger', onclick: () => runner.setCodeOutcome(pid, 'no-rosc', user) }, 'No ROSC'),
          ] : null,
        ),
      );
    })),
  );
}
