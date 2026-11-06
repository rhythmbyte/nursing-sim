// Sim setup: name, start clock, speed, settings; groups (student count + picked patients or tag counts,
// admissions); manual or random assignment. "Create sim" fills tag counts (randomizer), validates, saves
// the scenario in this browser, and switches to it (a new join code is generated).

import { helpField, helpTip } from '../shared/help.js';
import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { toast } from '../shared/toast.js';
import { triageChip } from '../shared/triage-chip.js';
import { saveLocal } from '../../data-loader.js';
import { fillByTagCounts } from '../../engine/assignment.js';
import { countByTriage, filterText, mergeFilters } from '../../engine/patient-tags.js';
import { tagChips } from './patient-tags-ui.js';
import { durationOverrides } from './duration-overrides.js';
import { SPEEDS } from '../../engine/clock.js';
import { save } from '../../storage.js';

const TAGS = ['red', 'yellow', 'green', 'black'];
const field = (label, el, hint) => helpField('setup', label, el, hint); // help text: data/catalogs/help.json

export function mountSimSetup(root, { data, switchScenario }) {
  const defaults = data.catalogs.scenarioDefaults.settings;
  const lib = [...data.patients].sort((a, b) => a.demographics.room.localeCompare(b.demographics.room, undefined, { numeric: true }));
  const groups = [];
  const body = h('div', {});

  const name = h('input', { class: 'input', value: 'New sim' });
  const startClock = h('input', { class: 'input', type: 'time', value: '07:00' });
  const endClock = h('input', { class: 'input', type: 'time', value: '15:00' });
  const speed = h('select', {}, SPEEDS.map((s) => h('option', { value: s, selected: s === 1 }, `${s}x`)));
  const assignment = h('select', { onchange: () => renderGroups() }, h('option', { value: 'random' }, 'Random'), h('option', { value: 'manual' }, 'Manual (named roster)'));
  const set = {
    handoffMode: h('select', {}, ['once', 'always', 'never'].map((v) => h('option', { value: v, selected: v === defaults.handoffMode }, v))),
    chargeNurse: h('select', {}, ['instructor', 'student', 'off'].map((v) => h('option', { value: v, selected: v === defaults.chargeNurse }, v))),
    tagsStudent: h('input', { type: 'checkbox', checked: defaults.showTagsTo.includes('student') }),
    tagsCharge: h('input', { type: 'checkbox', checked: defaults.showTagsTo.includes('charge') }),
    priorityScale: h('select', {}, Object.entries(data.catalogs.priorityScales.scales).map(([id, sc]) => h('option', { value: id, selected: id === defaults.priorityScale }, sc.label))),
    revealManualVitals: h('input', { type: 'checkbox', checked: defaults.revealManualVitals }),
    pauseOnClose: h('input', { type: 'checkbox', checked: defaults.pauseOnClose }),
    delegatedAssessmentRevealsFindings: h('input', { type: 'checkbox', checked: defaults.delegatedAssessmentRevealsFindings }),
    prnPreCheckWindowMin: h('input', { class: 'input', type: 'number', min: 1, value: defaults.prnPreCheckWindowMin }),
    delegationQueue: h('input', { type: 'checkbox', checked: defaults.delegationQueue }),
    revealAssessmentFindings: h('input', { type: 'checkbox', checked: defaults.revealAssessmentFindings }),
    gradeAssessments: h('input', { type: 'checkbox', checked: defaults.gradeAssessments }),
    taskTimerMode: h('select', {}, [['screen-only', 'Screen only: full task time (no manikins)'], ['manikin', 'Manikin: short lockout only'], ['off', 'Off']].map(([v, l]) => h('option', { value: v, selected: v === defaults.taskTimerMode }, l))),
    taskTimerManikinFactor: h('input', { class: 'input', type: 'number', min: 0, max: 1, step: 0.05, value: defaults.taskTimerManikinFactor }),
    taskTimerMinLockoutSec: h('input', { class: 'input', type: 'number', min: 0, value: defaults.taskTimerMinLockoutSec }),
  };
  const simDurs = durationOverrides(data.catalogs, {}, { label: 'Sim task time' });
  // Assessment tools offered to students: public ones ticked by default; others show "License check needed".
  const toolBoxes = (data.catalogs.assessmentTools?.tools || []).map((t) => ({ t, box: h('input', { type: 'checkbox', checked: t.license?.status === 'public', 'aria-label': `Offer ${t.name}` }) }));
  const groupsBox = h('div', {});
  const result = h('div', {});
  // Delegation helper roles (staff.json; the roles students can delegate to).
  const staffRoles = (data.catalogs.staff?.staff || []).filter((s) => s.speedFactor != null).map((s) => s.role);
  // Randomizer patient-tag filter (sim-wide; each "random" group may narrow it). Counts update as you click.
  let simFilter = {};
  const simCount = h('p', { class: 'tag-count', 'aria-live': 'polite' });
  const countLine = (filter, need = null) => {
    const c = countByTriage(data.patients, filter);
    return TAGS.map((t) => `${t} ${c[t]}${need ? `/${need[t] || 0}` : ''}${need && (need[t] || 0) > c[t] ? ' ⚠' : ''}`).join(' · ');
  };
  const refreshCounts = () => {
    simCount.textContent = `Matching patients (${filterText(simFilter, data.catalogs.patientTags)}): ${countLine(simFilter)}`;
    // Total wanted per color across random groups vs what matches (patients are never reused across groups).
    const need = {};
    for (const g of groups.filter((x) => x.mode === 'tags')) for (const t of TAGS) need[t] = (need[t] || 0) + (g.tagCounts[t] || 0);
    const c = countByTriage(data.patients, simFilter);
    const short = TAGS.filter((t) => (need[t] || 0) > c[t]);
    simWarn.textContent = short.length ? `⚠ Not enough matching patients: ${short.map((t) => `${t} needs ${need[t]}, ${c[t]} match`).join('; ')}. Loosen the patient tags or lower the counts.` : '';
    for (const g of groups) g.refreshCount?.();
  };
  const simWarn = h('p', { class: 'form-error', role: 'status' });
  const simChips = data.catalogs.patientTags ? tagChips(data.catalogs.patientTags, {}, { data, label: 'Randomizer patient tags', onChange: (v) => { simFilter = v; refreshCounts(); } }) : null;

  function addGroup() {
    groups.push({ id: `g${groups.length + 1}`, name: `Group ${groups.length + 1}`, studentCount: 1, staff: { ...defaults.staffPool }, mode: 'pick', patients: new Set(), admissions: new Set(), tagCounts: { red: 1, yellow: 1, green: 1, black: 0 }, names: '' });
    renderGroups();
    refreshCounts();
  }

  function renderGroups() {
    clear(groupsBox).append(...groups.map((g, gi) => h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', {}, g.name), h('button', { class: 'btn btn-small btn-ghost', onclick: () => { groups.splice(gi, 1); renderGroups(); } }, 'Remove group')),
      h('div', { class: 'editor-grid' },
        field('Group name', h('input', { class: 'input', value: g.name, oninput: (e) => { g.name = e.target.value; } })),
        field('Students', h('input', { class: 'input', type: 'number', min: 1, value: g.studentCount, oninput: (e) => { g.studentCount = Number(e.target.value); } })),
        ...staffRoles.map((r) => field(`${r} helpers`, h('input', { class: 'input', type: 'number', min: 0, max: 9, value: g.staff[r] ?? 0, 'aria-label': `${g.name} ${r} helpers`, oninput: (e) => { g.staff[r] = Number(e.target.value) || 0; } }))),
        field('Patients', h('select', { onchange: (e) => { g.mode = e.target.value; renderGroups(); refreshCounts(); } },
          h('option', { value: 'pick', selected: g.mode === 'pick' }, 'Pick patients'), h('option', { value: 'tags', selected: g.mode === 'tags' }, 'Random by tag counts')))),
      g.mode === 'pick'
        ? h('div', { class: 'pick-list' }, lib.map((p) => h('div', { class: 'pick-row' },
          h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: g.patients.has(p.id), onchange: (e) => { e.target.checked ? g.patients.add(p.id) : g.patients.delete(p.id); } }),
            ` Rm ${p.demographics.room} ${p.demographics.name} `, triageChip(p.tag)),
          h('label', { class: 'inline muted small' }, h('input', { type: 'checkbox', checked: g.admissions.has(p.id), onchange: (e) => { e.target.checked ? g.admissions.add(p.id) : g.admissions.delete(p.id); } }), ' as admission'))))
        : h('div', {}, h('div', { class: 'editor-grid' }, TAGS.map((t) => field(`${t} patients`, h('input', { class: 'input', type: 'number', min: 0, value: g.tagCounts[t], oninput: (e) => { g.tagCounts[t] = Number(e.target.value); refreshCounts(); } })))),
          data.catalogs.patientTags ? h('details', { open: Object.keys(g.tagFilter || {}).length > 0 }, h('summary', {}, 'This group\'s own patient tags (optional) ', helpTip('setup.group-patient-tags')),
            tagChips(data.catalogs.patientTags, g.tagFilter || {}, { label: `${g.name} patient tags`, onChange: (v) => { g.tagFilter = v; refreshCounts(); } }).el) : null,
          (() => { const line = h('p', { class: 'tag-count muted' }); g.refreshCount = () => { line.textContent = `Matching for ${g.name} (${filterText(mergeFilters(simFilter, g.tagFilter), data.catalogs.patientTags)}): ${countLine(mergeFilters(simFilter, g.tagFilter), g.tagCounts)}`; }; g.refreshCount(); return line; })()),
      assignment.value === 'manual' ? field('Student names (one per line)', (() => { const a = h('textarea', { class: 'input', rows: 3, oninput: (e) => { g.names = e.target.value; } }); a.value = g.names; return a; })()) : null,
    )));
  }

  async function create() {
    const scGroups = groups.map((g) => ({
      id: g.id, name: g.name, studentCount: g.studentCount, staff: { ...g.staff },
      ...(g.mode === 'pick' ? { patients: [...g.patients].filter((id) => !g.admissions.has(id)), admissions: [...g.admissions] } : { tagCounts: g.tagCounts, tagFilter: g.tagFilter || {} }),
    }));
    const { groups: filled, warnings } = fillByTagCounts(scGroups, data.patients, Math.random, simFilter);
    const manual = assignment.value === 'manual';
    const scenario = {
      id: `sc-${name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sim'}-${Date.now().toString(36)}`,
      name: name.value.trim(), startClock: startClock.value, ...(endClock.value ? { endClock: endClock.value } : {}), speed: Number(speed.value),
      settings: {
        handoffMode: set.handoffMode.value, chargeNurse: set.chargeNurse.value, showTagsTo: ['instructor', ...(set.tagsStudent.checked ? ['student'] : []), ...(set.tagsCharge.checked ? ['charge'] : [])], priorityScale: set.priorityScale.value,
        revealManualVitals: set.revealManualVitals.checked, pauseOnClose: set.pauseOnClose.checked,
        delegatedAssessmentRevealsFindings: set.delegatedAssessmentRevealsFindings.checked,
        prnPreCheckWindowMin: Number(set.prnPreCheckWindowMin.value), delegationQueue: set.delegationQueue.checked, staffPool: { ...defaults.staffPool },
        assessmentTools: toolBoxes.every((x) => x.box.checked === (x.t.license?.status === 'public')) ? 'public' : toolBoxes.filter((x) => x.box.checked).map((x) => x.t.id),
        revealAssessmentFindings: set.revealAssessmentFindings.checked, gradeAssessments: set.gradeAssessments.checked,
        taskTimerMode: set.taskTimerMode.value, taskTimerManikinFactor: Number(set.taskTimerManikinFactor.value), taskTimerMinLockoutSec: Number(set.taskTimerMinLockoutSec.value),
        ...(Object.keys(simDurs.value()).length ? { taskDurations: simDurs.value() } : {}),
      },
      assignment: assignment.value,
      groups: filled.map(({ filledFrom, ...g }) => g),
      ...(manual ? { manualStudents: Object.fromEntries(groups.map((g) => [g.id, g.names.split('\n').map((s) => s.trim()).filter(Boolean)])) } : {}),
      events: [],
      notes: warnings.length ? `Randomizer warnings: ${warnings.join(' ')}` : '',
    };
    const problems = [];
    if (!groups.length) problems.push('Add at least one group.');
    if (filled.some((g) => !(g.patients?.length || g.admissions?.length))) problems.push('Every group needs at least one patient.');
    const slots = filled.reduce((n, g) => n + g.studentCount, 0);
    if (manual && groups.reduce((n, g) => n + g.names.split('\n').filter((s) => s.trim()).length, 0) > slots) problems.push('More names than student slots.');
    const errors = problems.length ? problems : saveLocal('scenario', scenario, data.schemas);
    if (errors.length) {
      clear(result).append(h('div', { class: 'banner banner-error', role: 'alert' }, h('strong', {}, 'Not created:'), h('ul', {}, errors.map((e) => h('li', {}, e)))));
      return;
    }
    toast(`Created "${scenario.name}"`);
    if (warnings.length) window.alert(`Created, with randomizer warnings:\n\n${warnings.join('\n')}`);
    save('ui.instructor.view', 'live'); // land on Live control to show the new join code
    await switchScenario(scenario.id);
  }

  clear(body).append(
    h('header', { class: 'screen-header' }, h('h2', {}, 'Sim setup')),
    h('p', { class: 'muted' }, 'Creating a sim saves it in this browser, switches to it, and makes a new join code. Settings start from data/catalogs/scenario-defaults.json.'),
    h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Sim'),
      field('Name', name), field('Shift start', startClock), field('Shift end (sim stops; blank = no end)', endClock), field('Speed', speed), field('Assignment', assignment)),
    h('section', { class: 'panel editor-grid' }, h('h3', {}, 'Settings'),
      field('Handoff', set.handoffMode), field('Charge nurse', set.chargeNurse),
      field('PRN pre-check window (min)', set.prnPreCheckWindowMin),
      h('label', { class: 'inline' }, set.delegationQueue, ' Students can queue a task when no helper is free ', helpTip('setup.delegation-queue')),
      field('Student priority scale', set.priorityScale),
      h('label', { class: 'inline' }, set.tagsStudent, ' Students see the instructor\'s tags ', helpTip('setup.tags-student')),
      h('label', { class: 'inline' }, set.tagsCharge, ' A student charge nurse sees the instructor\'s tags ', helpTip('setup.tags-charge')),
      h('label', { class: 'inline' }, set.revealManualVitals, ' Measure button reveals temp/RR/pain ', helpTip('setup.reveal-manual-vitals')),
      h('label', { class: 'inline' }, set.pauseOnClose, ' Pause when the page closes ', helpTip('setup.pause-on-close')),
      h('label', { class: 'inline' }, set.delegatedAssessmentRevealsFindings, ' Delegated assessments reveal findings ', helpTip('setup.delegated-assessment-reveals'))),
    h('section', { class: 'panel' }, h('h3', {}, 'Task timers ', helpTip('setup.task-timers')),
      h('div', { class: 'editor-grid' }, field('Task timer mode', set.taskTimerMode), field('Manikin lockout (fraction of the task time)', set.taskTimerManikinFactor), field('Shortest lockout (seconds)', set.taskTimerMinLockoutSec)),
      h('details', {}, h('summary', {}, 'Task times for this sim (optional)'), simDurs.el)),
    h('section', { class: 'panel' }, h('h3', {}, 'Assessment tools ', helpTip('setup.assessment-tools')),
      h('label', { class: 'inline' }, set.revealAssessmentFindings, ' "Check patient" shows the scripted finding for each item ', helpTip('setup.reveal-assessment-findings')),
      h('label', { class: 'inline' }, set.gradeAssessments, ' Grade reassessments and mismatches (flags) ', helpTip('setup.grade-assessments')),
      h('div', { class: 'check-grid' }, toolBoxes.map(({ t, box }) => h('label', { class: 'inline' }, box, ` ${t.name} `, t.license?.status !== 'public' ? badge('License check needed', 'review') : null)))),
    simChips ? h('section', { class: 'panel' }, h('h3', {}, 'Patient tags for the randomizer ', helpTip('setup.patient-tags')), h('p', { class: 'muted small' }, 'Used by groups set to "Random by tag counts". Not the triage tag.'), simChips.el, simCount, simWarn) : null,
    groupsBox,
    h('div', { class: 'controls' }, h('button', { class: 'btn', onclick: addGroup }, 'Add group'), h('button', { class: 'btn btn-primary', onclick: create }, 'Create sim')),
    result,
  );
  addGroup();
  refreshCounts();
  root.append(body);
}
