// Sim setup: name, start clock, speed, settings; groups (student count + picked patients or tag counts,
// admissions); manual or random assignment. "Create sim" fills tag counts (randomizer), validates, saves
// the scenario in this browser, and switches to it (a new join code is generated).

import { helpField, helpTip } from '../shared/help.js';
import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { triageChip } from '../shared/triage-chip.js';
import { saveLocal } from '../../data-loader.js';
import { fillByTagCounts } from '../../engine/assignment.js';
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
    delegationDelayMin: h('input', { class: 'input', type: 'number', min: 0, value: defaults.delegationDelayMin.CNA }),
  };
  const groupsBox = h('div', {});
  const result = h('div', {});

  function addGroup() {
    groups.push({ id: `g${groups.length + 1}`, name: `Group ${groups.length + 1}`, studentCount: 1, mode: 'pick', patients: new Set(), admissions: new Set(), tagCounts: { red: 1, yellow: 1, green: 1, black: 0 }, names: '' });
    renderGroups();
  }

  function renderGroups() {
    clear(groupsBox).append(...groups.map((g, gi) => h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', {}, g.name), h('button', { class: 'btn btn-small btn-ghost', onclick: () => { groups.splice(gi, 1); renderGroups(); } }, 'Remove group')),
      h('div', { class: 'editor-grid' },
        field('Group name', h('input', { class: 'input', value: g.name, oninput: (e) => { g.name = e.target.value; } })),
        field('Students', h('input', { class: 'input', type: 'number', min: 1, value: g.studentCount, oninput: (e) => { g.studentCount = Number(e.target.value); } })),
        field('Patients', h('select', { onchange: (e) => { g.mode = e.target.value; renderGroups(); } },
          h('option', { value: 'pick', selected: g.mode === 'pick' }, 'Pick patients'), h('option', { value: 'tags', selected: g.mode === 'tags' }, 'Random by tag counts')))),
      g.mode === 'pick'
        ? h('div', { class: 'pick-list' }, lib.map((p) => h('div', { class: 'pick-row' },
          h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: g.patients.has(p.id), onchange: (e) => { e.target.checked ? g.patients.add(p.id) : g.patients.delete(p.id); } }),
            ` Rm ${p.demographics.room} ${p.demographics.name} `, triageChip(p.tag)),
          h('label', { class: 'inline muted small' }, h('input', { type: 'checkbox', checked: g.admissions.has(p.id), onchange: (e) => { e.target.checked ? g.admissions.add(p.id) : g.admissions.delete(p.id); } }), ' as admission'))))
        : h('div', { class: 'editor-grid' }, TAGS.map((t) => field(`${t} patients`, h('input', { class: 'input', type: 'number', min: 0, value: g.tagCounts[t], oninput: (e) => { g.tagCounts[t] = Number(e.target.value); } })))),
      assignment.value === 'manual' ? field('Student names (one per line)', (() => { const a = h('textarea', { class: 'input', rows: 3, oninput: (e) => { g.names = e.target.value; } }); a.value = g.names; return a; })()) : null,
    )));
  }

  async function create() {
    const scGroups = groups.map((g) => ({
      id: g.id, name: g.name, studentCount: g.studentCount,
      ...(g.mode === 'pick' ? { patients: [...g.patients].filter((id) => !g.admissions.has(id)), admissions: [...g.admissions] } : { tagCounts: g.tagCounts }),
    }));
    const { groups: filled, warnings } = fillByTagCounts(scGroups, data.patients);
    const manual = assignment.value === 'manual';
    const scenario = {
      id: `sc-${name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sim'}-${Date.now().toString(36)}`,
      name: name.value.trim(), startClock: startClock.value, ...(endClock.value ? { endClock: endClock.value } : {}), speed: Number(speed.value),
      settings: {
        handoffMode: set.handoffMode.value, chargeNurse: set.chargeNurse.value, showTagsTo: ['instructor', ...(set.tagsStudent.checked ? ['student'] : []), ...(set.tagsCharge.checked ? ['charge'] : [])], priorityScale: set.priorityScale.value,
        revealManualVitals: set.revealManualVitals.checked, pauseOnClose: set.pauseOnClose.checked,
        delegatedAssessmentRevealsFindings: set.delegatedAssessmentRevealsFindings.checked,
        prnPreCheckWindowMin: Number(set.prnPreCheckWindowMin.value), delegationDelayMin: Number(set.delegationDelayMin.value),
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
      field('PRN pre-check window (min)', set.prnPreCheckWindowMin), field('Delegation delay (min)', set.delegationDelayMin),
      field('Student priority scale', set.priorityScale),
      h('label', { class: 'inline' }, set.tagsStudent, ' Students see the instructor\'s tags ', helpTip('setup.tags-student')),
      h('label', { class: 'inline' }, set.tagsCharge, ' A student charge nurse sees the instructor\'s tags ', helpTip('setup.tags-charge')),
      h('label', { class: 'inline' }, set.revealManualVitals, ' Measure button reveals temp/RR/pain ', helpTip('setup.reveal-manual-vitals')),
      h('label', { class: 'inline' }, set.pauseOnClose, ' Pause when the page closes ', helpTip('setup.pause-on-close')),
      h('label', { class: 'inline' }, set.delegatedAssessmentRevealsFindings, ' Delegated assessments reveal findings')),
    groupsBox,
    h('div', { class: 'controls' }, h('button', { class: 'btn', onclick: addGroup }, 'Add group'), h('button', { class: 'btn btn-primary', onclick: create }, 'Create sim')),
    result,
  );
  addGroup();
  root.append(body);
}
