// Instructor → Setup wizard (before a sim): one step per screen with Back / Next and a progress bar.
//   1 Start from (a saved scenario or new) · 2 Groups and students · 3 Patients · 4 Variation · 5 Sim options · 6 Review
// "Create sim" validates, fills random groups (randomizer), saves the scenario in this browser and switches to it;
// the Instructor tab then shows the Ready screen (join code, Start sim). Defaults come from scenario-defaults.json,
// so a quick setup is Next, Next, Create. All steps stay in the page (only one shown), so the draft covers them all.

import { formDraft } from '../shared/drafts.js';
import { helpField, helpTip } from '../shared/help.js';
import { h, clear } from '../shared/dom.js';
import { badge } from '../shared/badge.js';
import { toast } from '../shared/toast.js';
import { saveLocal } from '../../data-loader.js';
import { fillByTagCounts } from '../../engine/assignment.js';
import { effectiveSettings } from '../../engine/settings.js';
import { durationOverrides } from './duration-overrides.js';
import { createGroups } from './setup-groups.js';
import { SPEEDS } from '../../engine/clock.js';
import { load, save } from '../../storage.js';

const field = (label, el, hint) => helpField('setup', label, el, hint);
const STEPS = ['Start from', 'Groups and students', 'Patients', 'Variation', 'Sim options', 'Review'];
const STEP_KEY = 'ui.wizard.step';
export const READY_KEY = 'ui.setup.ready'; // the scenario id the wizard just created: the Instructor tab shows Ready

export function mountSetupWizard(root, { data, switchScenario, startDemo }) {
  const defaults = data.catalogs.scenarioDefaults.settings;
  let step = Math.min(STEPS.length - 1, Math.max(0, Number(load(STEP_KEY)) || 0));
  let clearDraft = () => {};
  const g = createGroups(data, { pool: defaults.staffPool });

  // ---- controls (kept across steps) ----
  const startFrom = h('select', { 'aria-label': 'Start from' }, h('option', { value: 'new' }, 'New sim (defaults)'), data.scenarios.map((s) => h('option', { value: s.id }, `Saved: ${s.name}`)));
  const name = h('input', { class: 'input', value: 'New sim', 'aria-label': 'Sim name' });
  const startClock = h('input', { class: 'input', type: 'time', value: '07:00' });
  const endClock = h('input', { class: 'input', type: 'time', value: '15:00' });
  const speed = h('select', {}, SPEEDS.map((s) => h('option', { value: s, selected: s === 1 }, `${s}x`)));
  const assignment = h('select', { onchange: () => g.render() }, h('option', { value: 'random' }, 'Random (students are placed as they join)'), h('option', { value: 'manual' }, 'Named roster (type the names per group)'));
  g.setManual(() => assignment.value === 'manual');
  const chk = (v, label) => h('input', { type: 'checkbox', checked: Boolean(v), 'aria-label': label });
  const set = {
    randomizeNames: chk(defaults.randomizeNames !== false, 'Randomize names'),
    randomizeValues: chk(defaults.randomizeValues !== false, 'Randomize vitals and labs'),
    randomizeMeds: chk(defaults.randomizeMeds !== false, 'Randomize meds'),
    handoffMode: h('select', {}, [['once', 'Once, when a student first opens a patient'], ['always', 'Every time'], ['never', 'Never']].map(([v, l]) => h('option', { value: v, selected: v === defaults.handoffMode }, l))),
    chargeNurse: h('select', {}, [['instructor', 'You (instructor)'], ['student', 'A student'], ['off', 'Off']].map(([v, l]) => h('option', { value: v, selected: v === defaults.chargeNurse }, l))),
    taskTimerMode: h('select', {}, [['manikin', 'Manikin: short lockout only (default)'], ['screen-only', 'Screen only: full task time (no manikins)'], ['off', 'Off']].map(([v, l]) => h('option', { value: v, selected: v === defaults.taskTimerMode }, l))),
    tagsStudent: chk(defaults.showTagsTo.includes('student')), tagsCharge: chk(defaults.showTagsTo.includes('charge')),
    priorityScale: h('select', {}, Object.entries(data.catalogs.priorityScales.scales).map(([id, sc]) => h('option', { value: id, selected: id === defaults.priorityScale }, sc.label))),
    revealManualVitals: chk(defaults.revealManualVitals), pauseOnClose: chk(defaults.pauseOnClose),
    delegatedAssessmentRevealsFindings: chk(defaults.delegatedAssessmentRevealsFindings),
    prnPreCheckWindowMin: h('input', { class: 'input', type: 'number', min: 1, value: defaults.prnPreCheckWindowMin }),
    delegationQueue: chk(defaults.delegationQueue), revealAssessmentFindings: chk(defaults.revealAssessmentFindings), gradeAssessments: chk(defaults.gradeAssessments),
    taskTimerManikinFactor: h('input', { class: 'input', type: 'number', min: 0, max: 1, step: 0.05, value: defaults.taskTimerManikinFactor }),
    taskTimerMinLockoutSec: h('input', { class: 'input', type: 'number', min: 0, value: defaults.taskTimerMinLockoutSec }),
  };
  const simDurs = durationOverrides(data.catalogs, {}, { label: 'Sim task time' });
  const toolBoxes = (data.catalogs.assessmentTools?.tools || []).map((t) => ({ t, box: h('input', { type: 'checkbox', checked: t.license?.status === 'public', 'aria-label': `Offer ${t.name}` }) }));

  /** A saved scenario as the starting point: every step shows its values. */
  function prefill(sc) {
    const s = effectiveSettings(sc.settings, data.catalogs);
    name.value = `${sc.name} (copy)`; startClock.value = sc.startClock || '07:00'; endClock.value = sc.endClock || ''; speed.value = String(sc.speed || 1);
    assignment.value = sc.assignment === 'manual' ? 'manual' : 'random';
    for (const [k, el] of Object.entries(set)) {
      if (k === 'tagsStudent') el.checked = s.showTagsTo.includes('student');
      else if (k === 'tagsCharge') el.checked = s.showTagsTo.includes('charge');
      else if (el.type === 'checkbox') el.checked = s[k] !== false && Boolean(s[k] ?? true);
      else if (s[k] != null) el.value = String(s[k]);
    }
    for (const x of toolBoxes) x.box.checked = s.assessmentTools === 'all' || (s.assessmentTools === 'public' ? x.t.license?.status === 'public' : (s.assessmentTools || []).includes(x.t.id));
    g.load(sc.groups.map((gr) => ({ ...gr, mode: gr.tagCounts && !gr.patients?.length ? 'tags' : 'pick', names: (sc.manualStudents?.[gr.id] || []).join('\n') })));
  }

  function buildScenario() {
    const scGroups = g.groups.map((x) => ({ id: x.id, name: x.name, studentCount: x.studentCount, staff: { ...x.staff },
      ...(x.mode === 'pick' ? { patients: [...x.patients].filter((id) => !x.admissions.has(id)), admissions: [...x.admissions] } : { tagCounts: x.tagCounts, tagFilter: x.tagFilter || {} }) }));
    const { groups: filled, warnings } = fillByTagCounts(scGroups, data.patients, Math.random, g.simFilter());
    const manual = assignment.value === 'manual';
    const scenario = {
      id: `sc-${name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sim'}-${Date.now().toString(36)}`,
      name: name.value.trim() || 'New sim', startClock: startClock.value, ...(endClock.value ? { endClock: endClock.value } : {}), speed: Number(speed.value),
      settings: {
        randomizeNames: set.randomizeNames.checked, randomizeValues: set.randomizeValues.checked, randomizeMeds: set.randomizeMeds.checked,
        handoffMode: set.handoffMode.value, chargeNurse: set.chargeNurse.value, showTagsTo: ['instructor', ...(set.tagsStudent.checked ? ['student'] : []), ...(set.tagsCharge.checked ? ['charge'] : [])], priorityScale: set.priorityScale.value,
        revealManualVitals: set.revealManualVitals.checked, pauseOnClose: set.pauseOnClose.checked, delegatedAssessmentRevealsFindings: set.delegatedAssessmentRevealsFindings.checked,
        prnPreCheckWindowMin: Number(set.prnPreCheckWindowMin.value), delegationQueue: set.delegationQueue.checked, staffPool: { ...defaults.staffPool },
        assessmentTools: toolBoxes.every((x) => x.box.checked === (x.t.license?.status === 'public')) ? 'public' : toolBoxes.filter((x) => x.box.checked).map((x) => x.t.id),
        revealAssessmentFindings: set.revealAssessmentFindings.checked, gradeAssessments: set.gradeAssessments.checked,
        taskTimerMode: set.taskTimerMode.value, taskTimerManikinFactor: Number(set.taskTimerManikinFactor.value), taskTimerMinLockoutSec: Number(set.taskTimerMinLockoutSec.value),
        ...(Object.keys(simDurs.value()).length ? { taskDurations: simDurs.value() } : {}),
      },
      assignment: assignment.value,
      groups: filled.map(({ filledFrom, ...x }) => x),
      ...(manual ? { manualStudents: Object.fromEntries(g.groups.map((x) => [x.id, x.names.split('\n').map((s) => s.trim()).filter(Boolean)])) } : {}),
      events: [], notes: warnings.length ? `Randomizer warnings: ${warnings.join(' ')}` : '',
    };
    const problems = [];
    if (!g.groups.length) problems.push('Add at least one group (step 2).');
    if (filled.some((x) => !(x.patients?.length || x.admissions?.length))) problems.push('Every group needs at least one patient (step 3).');
    const slots = filled.reduce((n, x) => n + x.studentCount, 0);
    if (manual && g.groups.reduce((n, x) => n + x.names.split('\n').filter((s) => s.trim()).length, 0) > slots) problems.push('More names than student slots (step 2).');
    return { scenario, warnings, problems };
  }

  const result = h('div', {});
  const review = h('div', {});
  async function create() {
    const { scenario, warnings, problems } = buildScenario();
    const errors = problems.length ? problems : saveLocal('scenario', scenario, data.schemas);
    if (errors.length) { clear(result).append(h('div', { class: 'banner banner-error', role: 'alert' }, h('strong', {}, 'Not created:'), h('ul', {}, errors.map((e) => h('li', {}, e))))); return; }
    clearDraft();
    save(STEP_KEY, 0);
    save(READY_KEY, scenario.id);
    toast(`Created "${scenario.name}"`);
    if (warnings.length) window.alert(`Created, with randomizer warnings:\n\n${warnings.join('\n')}`);
    await switchScenario(scenario.id);
  }
  async function runSaved() { save(STEP_KEY, 0); save(READY_KEY, startFrom.value); clearDraft(); await switchScenario(startFrom.value); }

  function renderReview() {
    const { scenario, problems } = buildScenario();
    const s = scenario.settings;
    const yes = (b) => (b ? 'on' : 'off');
    clear(review).append(
      problems.length ? h('div', { class: 'banner banner-error' }, h('ul', {}, problems.map((p) => h('li', {}, p)))) : null,
      h('ul', { class: 'review-list' },
        h('li', {}, `${scenario.groups.length} group${scenario.groups.length === 1 ? '' : 's'}, ${scenario.groups.reduce((n, x) => n + x.studentCount, 0)} student slots, ${assignment.value === 'manual' ? 'named roster' : 'random placement'}`),
        ...scenario.groups.map((x) => h('li', {}, `${x.name}: ${x.patients?.length || 0} patients${x.admissions?.length ? ` + ${x.admissions.length} admission` : ''}${x.tagCounts ? ' (random by tags; picked at Create)' : ''}`)),
        h('li', {}, `Variation: names ${yes(s.randomizeNames)} · vitals & labs ${yes(s.randomizeValues)} · meds ${yes(s.randomizeMeds)}`),
        h('li', {}, `Shift ${scenario.startClock}–${scenario.endClock || 'open'} at ${scenario.speed}x · handoff ${s.handoffMode} · charge nurse ${s.chargeNurse} · task timers ${s.taskTimerMode}`)),
    );
  }

  // ---- steps ----
  const bar = h('progress', { max: STEPS.length, value: step + 1, 'aria-label': 'Setup progress' });
  const crumbs = h('ol', { class: 'wizard-steps' });
  const stepEls = [
    h('section', { class: 'panel' }, h('h3', {}, '1. Start from ', helpTip('setup.wizard-start')),
      h('p', { class: 'muted' }, 'A saved scenario (yours or a starter) fills in every step; change what you need. Or start a new sim from the defaults.'),
      field('Start from', startFrom),
      h('div', { class: 'controls' }, h('button', { class: 'btn', type: 'button', onclick: () => { if (startFrom.value !== 'new') runSaved(); }, title: 'Skip the wizard: use the saved scenario as it is' }, 'Run the saved scenario as it is'),
        startDemo ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => startDemo() }, 'Start demo sim') : null)),
    h('section', { class: 'panel' }, h('h3', {}, '2. Groups and students ', helpTip('setup.wizard-groups')),
      h('p', { class: 'muted' }, 'Each group shares its patients. Students join with the code; with random placement they fill the groups in order.'),
      field('Assignment', assignment), g.boxes.students, h('button', { class: 'btn', type: 'button', onclick: () => g.add() }, 'Add group')),
    h('section', { class: 'panel' }, h('h3', {}, '3. Patients ', helpTip('setup.wizard-patients')),
      h('p', { class: 'muted' }, 'Pick cases for each group, or let the randomizer pick by patient tags and triage color counts (match counts update as you click). You see "(C1) Robert Miller"; students never see the code.'),
      g.randomizer, g.boxes.patients),
    h('section', { class: 'panel' }, h('h3', {}, '4. Variation ', helpTip('setup.wizard-variation')),
      h('p', { class: 'muted' }, 'Case templates can make a different patient in each sim. Off = the case exactly as written. Teaching points never change.'),
      h('label', { class: 'inline' }, set.randomizeNames, ' Randomize names (and age and sex within the case\'s range)'),
      h('label', { class: 'inline' }, set.randomizeValues, ' Randomize vitals & labs within their ranges'),
      h('label', { class: 'inline' }, set.randomizeMeds, ' Randomize meds within their class (never a drug the patient is allergic to)')),
    h('section', { class: 'panel' }, h('h3', {}, '5. Sim options ', helpTip('setup.wizard-options')),
      h('div', { class: 'editor-grid' }, field('Shift start', startClock), field('Shift end (sim stops; blank = no end)', endClock), field('Speed', speed),
        field('Handoff', set.handoffMode), field('Charge nurse', set.chargeNurse), field('Task timer mode', set.taskTimerMode)),
      h('h4', {}, 'Staff per group ', helpTip('setup.wizard-staff')), g.boxes.staff,
      h('h4', {}, 'Assessments available ', helpTip('setup.assessment-tools')),
      h('div', { class: 'check-grid' }, toolBoxes.map(({ t, box }) => h('label', { class: 'inline' }, box, ` ${t.name} `, t.license?.status !== 'public' ? badge('License check needed', 'review') : null))),
      h('details', {}, h('summary', {}, 'More options'),
        h('div', { class: 'editor-grid' }, field('Student priority scale', set.priorityScale), field('PRN pre-check window (min)', set.prnPreCheckWindowMin),
          field('Manikin lockout (fraction of the task time)', set.taskTimerManikinFactor), field('Shortest lockout (seconds)', set.taskTimerMinLockoutSec)),
        h('label', { class: 'inline' }, set.delegationQueue, ' Students can queue a task when no helper is free ', helpTip('setup.delegation-queue')),
        h('label', { class: 'inline' }, set.tagsStudent, ' Students see the instructor\'s tags ', helpTip('setup.tags-student')),
        h('label', { class: 'inline' }, set.tagsCharge, ' A student charge nurse sees the instructor\'s tags ', helpTip('setup.tags-charge')),
        h('label', { class: 'inline' }, set.revealManualVitals, ' Measure button reveals temp/RR/pain ', helpTip('setup.reveal-manual-vitals')),
        h('label', { class: 'inline' }, set.pauseOnClose, ' Pause when the page closes ', helpTip('setup.pause-on-close')),
        h('label', { class: 'inline' }, set.delegatedAssessmentRevealsFindings, ' Delegated assessments reveal findings ', helpTip('setup.delegated-assessment-reveals')),
        h('label', { class: 'inline' }, set.revealAssessmentFindings, ' "Check patient" shows the scripted finding for each item ', helpTip('setup.reveal-assessment-findings')),
        h('label', { class: 'inline' }, set.gradeAssessments, ' Grade reassessments and mismatches (flags) ', helpTip('setup.grade-assessments')),
        h('details', {}, h('summary', {}, 'Task times for this sim (optional)'), simDurs.el))),
    h('section', { class: 'panel' }, h('h3', {}, '6. Review and create ', helpTip('setup.wizard-review')), field('Sim name', name), review,
      h('div', { class: 'controls' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: create }, 'Create sim')), result),
  ];
  const back = h('button', { class: 'btn', type: 'button', onclick: () => go(step - 1) }, '← Back');
  const next = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(step + 1) }, 'Next →');
  let prefilledFrom = null;
  function go(n) {
    if (step === 0 && n === 1 && startFrom.value !== 'new' && prefilledFrom !== startFrom.value) { prefill(data.scenarios.find((s) => s.id === startFrom.value)); prefilledFrom = startFrom.value; }
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    save(STEP_KEY, step);
    show();
    window.scrollTo(0, 0);
  }
  function show() {
    stepEls.forEach((el, i) => { el.hidden = i !== step; });
    bar.value = step + 1;
    clear(crumbs).append(...STEPS.map((s, i) => h('li', { class: i === step ? 'current' : i < step ? 'done' : '' }, h('button', { class: 'btn-link', type: 'button', onclick: () => go(i), 'aria-current': i === step ? 'step' : null }, `${i + 1}. ${s}`))));
    back.disabled = step === 0;
    next.hidden = step === STEPS.length - 1;
    if (step === STEPS.length - 1) renderReview();
  }

  const body = h('div', { class: 'wizard' },
    h('header', { class: 'screen-header' }, h('h2', {}, 'Set up a sim')),
    bar, crumbs, ...stepEls, h('div', { class: 'controls wizard-nav' }, back, next));
  g.add();
  show();
  root.append(body);
  const draft = formDraft(body, 'wizard', { extra: { get: () => ({ groups: g.plain(), prefilledFrom }), set: (saved) => { prefilledFrom = saved.prefilledFrom ?? null; g.load(saved.groups || []); } } });
  if (draft.note) body.prepend(draft.note);
  clearDraft = () => draft.clear();
  return () => {};
}
