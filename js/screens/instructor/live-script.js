// Live control → Patient scripts: each scripted patient's current state, what's armed next (countdowns),
// what it's listening for, and the overrides (force state, fire now, skip, disable, pause scripting).
// Display + runner calls only; the rules are in engine/reactions*.

import { h } from '../shared/dom.js';
import { instructorPatientLabel } from '../shared/labels.js';
import { helpTip } from '../shared/help.js';
import { formatShiftTime } from '../../engine/time.js';
import { select } from './script-parts.js';

const left = (deadline, simMin) => {
  const sec = Math.max(0, Math.ceil((deadline - simMin) * 60)); // sim seconds
  return sec < 60 ? `${sec} s left` : `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s left`;
};

function patientScript(runner, pid, t, user) {
  const v = runner.scriptView(pid);
  const simMin = runner.simMin();
  const at = (m) => formatShiftTime(runner.state.startClock, m);
  const act = (name, ...args) => () => runner.script(name, pid, args, user);
  const stateSel = h('select', { 'aria-label': `Force state for ${t.demographics.name}` }, v.states.map((s) => h('option', { value: s.id, selected: s.id === v.stateId }, s.label)));
  const reactSel = h('select', { 'aria-label': `Reaction to fire for ${t.demographics.name}` }, v.reactions.map((r) => h('option', { value: r.id }, r.label)));
  return h('div', { class: `script-row${v.paused ? ' is-paused' : ''}` },
    h('div', { class: 'script-head' },
      h('strong', {}, instructorPatientLabel(t)),
      h('span', { class: 'script-state' }, v.stateLabel),
      h('span', { class: 'muted small' }, `since ${at(v.since)}`),
      v.paused ? h('span', { class: 'badge' }, '⏸ Scripting paused') : null,
      h('button', { class: 'btn btn-small', onclick: act('setScriptPaused', !v.paused), title: v.paused ? 'Resume: countdowns restart from now' : 'Stop this patient reacting until you resume' }, v.paused ? 'Resume scripting' : 'Pause scripting'),
    ),
    penaltyBlock(v, act, at, t.demographics.name),
    v.timers.length ? h('ul', { class: 'script-armed' }, v.timers.map((x) => h('li', {},
      h('span', { class: 'script-countdown', 'data-deadline': x.deadline }, `⏱ ${left(x.deadline, simMin)}`), ' ',
      x.without.length ? `If no ${x.without.join(' or ')} by ${at(x.deadline)}` : `At ${at(x.deadline)}`, ` → ${x.then}`,
      ' ', h('button', { class: 'btn btn-small', onclick: act('skipArmed', x.id), title: 'Cancel this countdown (it re-arms if its start happens again)' }, 'Skip')))) : h('p', { class: 'muted small' }, v.paused ? 'Nothing armed while paused.' : 'No countdowns running.'),
    v.listening.length ? h('details', { class: 'script-listening', 'data-key': `listen-${pid}` }, h('summary', {}, `Listening for ${v.listening.length}`),
      h('ul', {}, v.listening.map((x) => h('li', {}, `When ${x.when} → ${x.then}`)))) : null,
    h('div', { class: 'controls' },
      h('label', { class: 'inline' }, 'State ', stateSel), h('button', { class: 'btn btn-small', onclick: () => runner.script('forceState', pid, [stateSel.value], user) }, 'Force state'),
      h('label', { class: 'inline' }, 'Reaction ', reactSel), h('button', { class: 'btn btn-small', onclick: () => runner.script('fireReactionNow', pid, [reactSel.value], user), title: 'Run its effects now, whatever its trigger and conditions' }, 'Fire now'),
    ),
    h('details', { 'data-key': `all-${pid}` }, h('summary', {}, `All reactions (${v.reactions.length})`),
      h('table', { class: 'data-table' }, h('tbody', {}, v.reactions.map((r) => h('tr', { class: r.disabled ? 'is-done' : '' },
        h('td', {}, h('strong', {}, r.label), h('div', { class: 'muted small' }, r.text)),
        h('td', {}, `${r.fires}/${r.max}`),
        h('td', {}, h('button', { class: 'btn btn-small', onclick: act('setReactionEnabled', r.id, r.disabled) }, r.disabled ? 'Enable' : 'Disable'))))))),
  );
}

function penaltyBlock(v, act, at, name) {
  const amount = select(`Penalty to add for ${name}`, [10, 20, 30, 40].map((x) => [x, `${x}%`]), 20);
  return h('div', { class: 'script-penalty' },
    h('strong', {}, v.penaltyTotal ? `Recovery penalty ${Math.round(v.penaltyTotal)}% ` : 'No recovery penalty '), helpTip('live.penalty'),
    v.penaltiesOn ? null : h('span', { class: 'muted small' }, ' (penalties are off in this sim)'),
    v.penalties.length ? h('ul', {}, v.penalties.map((p) => h('li', {},
      `${p.label}: `, p.percent ? `−${p.percent}%` : '', p.caps ? ` caps ${Object.entries(p.caps).map(([k, x]) => `${k} ${x}`).join(', ')}` : '',
      h('span', { class: 'muted small' }, ` · ${at(p.earnedAt)} · ${p.why} · ${p.wearing}`), ' ',
      p.basePercent > 0 ? h('button', { class: 'btn btn-small', onclick: act('setPenalty', p.id, Math.max(0, p.basePercent - 10)), title: 'Reduce by 10 points' }, '−10%') : null,
      h('button', { class: 'btn btn-small btn-ghost', onclick: act('setPenalty', p.id, null) }, 'Clear')))) : null,
    h('span', { class: 'controls' }, amount, h('button', { class: 'btn btn-small', onclick: () => act('addPenalty', { percent: Number(amount.value) })() }, 'Add penalty'),
      v.penalties.length ? h('button', { class: 'btn btn-small btn-ghost', onclick: act('setPenalty', null, null) }, 'Clear all') : null));
}

/** The panel (null if no patient in the sim has a script). `filter` = Live control's group/patient filter. */
export function scriptPanel(runner, templatesById, user, filter = null) {
  const inFilter = (pid) => (!filter?.patientId || pid === filter.patientId) && (!filter?.groupId || runner.state.patients[pid]?.groupId === filter.groupId);
  const pids = Object.keys(runner.state.patients).filter((pid) => runner.state.patients[pid].script && runner.state.patients[pid].present && inFilter(pid));
  if (!pids.length) return null;
  return h('section', { class: 'panel' }, h('h3', {}, 'Patient scripts ', helpTip('live.script')),
    ...pids.map((pid) => patientScript(runner, pid, templatesById[pid], user)));
}

/** Cheap per-tick update of the countdown texts. */
export function updateCountdowns(root, simMin) {
  for (const el of root.querySelectorAll('.script-countdown')) el.textContent = `⏱ ${left(Number(el.dataset.deadline), simMin)}`;
}

/** Rebuilds `container` with `build()` but keeps open <details data-key> and chosen <select> values. */
export function rebuildKeepingUi(container, build) {
  const open = new Set([...container.querySelectorAll('details[open][data-key]')].map((d) => d.dataset.key));
  const chosen = new Map([...container.querySelectorAll('select[aria-label]')].map((x) => [x.getAttribute('aria-label'), x.value]));
  const focused = document.activeElement?.closest?.('select[aria-label]') && container.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
  const el = build();
  container.replaceChildren(...(el ? [el] : []));
  for (const d of container.querySelectorAll('details[data-key]')) if (open.has(d.dataset.key)) d.open = true;
  for (const x of container.querySelectorAll('select[aria-label]')) {
    const v = chosen.get(x.getAttribute('aria-label'));
    if (v != null && [...x.options].some((o) => o.value === v)) x.value = v;
    if (focused && x.getAttribute('aria-label') === focused) x.focus();
  }
}
