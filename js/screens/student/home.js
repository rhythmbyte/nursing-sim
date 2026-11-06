// Student tab: home (patient list) ↔ patient chart. The open patient is remembered per student.
// Student screens only see `studentView` templates (UI convenience only, not security; see engine/student-view.js).

import { textDraft, draftNote } from '../shared/drafts.js';
import { navPush, onNav } from '../shared/nav.js';
import { h, clear } from '../shared/dom.js';
import { busyBanner } from './busy-banner.js';
import { staffPanel } from './staff-panel.js';
import { simClock, elapsed } from '../shared/timer.js';
import { triageChip } from '../shared/triage-chip.js';
import { badge } from '../shared/badge.js';
import { formatShiftTime } from '../../engine/time.js';
import { studentView } from '../../engine/student-view.js';
import { load, save } from '../../storage.js';
import { newOrderCount } from '../../engine/orders.js';
import { canSeeInstructorTags, activeScale, currentPriority } from '../../engine/priority.js';
import { priorityPicker } from '../shared/priority-picker.js';
import { printReportSheet } from './report-sheet.js';
import { mountPatientView } from './patient-view.js';
import { openHandoffModal } from './handoff-modal.js';

function patientRow(pid, ps, view, { runner, user, simMin, seenAt, onOpen, scale }) {
  const d = view.demographics;
  const newOrders = newOrderCount(ps);
  const pendingLabs = ps.labs.filter((l) => l.status === 'pending').length;
  return h('li', { class: `student-patient${ps.callLight ? ' has-light' : ''}` },
    h('button', { class: 'sp-open', onclick: () => onOpen(pid), 'aria-label': `Open chart: ${d.name}, room ${d.room}` },
      h('div', { class: 'sp-main' },
        h('span', { class: 'room' }, `Rm ${d.room}`),
        h('strong', {}, d.name),
        h('span', { class: 'muted' }, `${d.age}${d.sex} · ${view.admittingDx}`),
        view.tag ? triageChip(ps.tag) : null, // instructor tag, only if settings.showTagsTo includes 'student'
        newOrders ? badge(`${newOrders} new order${newOrders > 1 ? 's' : ''}`, 'pending') : null,
        pendingLabs ? badge(`${pendingLabs} lab${pendingLabs > 1 ? 's' : ''} pending`, 'neutral') : null,
      ),
      h('div', { class: 'sp-seen muted' }, seenAt != null ? `Last seen ${formatShiftTime(runner.state.startClock, seenAt)}` : 'Not seen yet'),
    ),
    h('div', { class: 'sp-prio' }, priorityPicker(scale, currentPriority(runner.state, user.userId, pid), (levelId) => runner.assignPriority(pid, levelId, user))),
    ps.callLight ? h('div', { class: 'sp-light' },
      h('span', { class: 'call-light-dot', 'aria-hidden': 'true' }),
      h('span', {}, `Call light · ${elapsed(simMin, ps.callLight.since)}`),
      h('button', { class: 'btn btn-primary btn-small', onclick: () => runner.answerCallLight(pid, user) }, 'Answer'),
      h('div', { class: 'sp-light-msg' }, ps.callLight.message),
    ) : null,
  );
}

export function mountStudentHome(root, ctx) {
  const { store, runner, scenario, user, groupId } = ctx;
  const groupName = scenario.groups.find((g) => g.id === groupId)?.name || groupId;
  const OPEN_KEY = `ui.${user.userId}.patient`;
  // Student views (UI convenience only, B11). Rebuilt when the instructor pushes an order.
  let views = {};
  let viewsFor = null;
  function refreshViews() {
    const t = runner.templates();
    if (t === viewsFor) return;
    viewsFor = t;
    views = Object.fromEntries(Object.keys(runner.state.patients).map((pid) => [pid, studentView(t[pid], { showTags: canSeeInstructorTags(scenario.settings, 'student') })]));
  }
  refreshViews();
  let cleanupChild = null;

  function showHome() {
    if (cleanupChild) cleanupChild();
    save(OPEN_KEY, null);
    cleanupChild = mountHome();
  }

  function openPatient(pid) {
    save(OPEN_KEY, pid); // remembered now, so a reload with the handoff report open comes back to it
    const mode = scenario.settings.handoffMode;
    const handoff = runner.state.students[user.userId]?.handoff?.[pid];
    if (mode === 'once' && !handoff && views[pid].handoff) {
      runner.chart('openHandoff', pid, {}, user);
      openHandoffModal({ view: views[pid], draftKey: `handoff.${user.userId}.${pid}`, onClose: (notes) => {
        runner.chart('closeHandoff', pid, { notes }, user);
        showPatient(pid);
      } });
      return;
    }
    if (mode === 'once' && handoff && handoff.closedAt == null) {
      // Page reloaded mid-handoff: the report is still open, so show it again.
      openHandoffModal({ view: views[pid], notes: handoff.notes, draftKey: `handoff.${user.userId}.${pid}`, onClose: (notes) => {
        runner.chart('closeHandoff', pid, { notes }, user);
        showPatient(pid);
      } });
      return;
    }
    showPatient(pid);
  }

  function showPatient(pid) {
    if (cleanupChild) cleanupChild();
    save(OPEN_KEY, pid);
    runner.chart('openPatient', pid, {}, user);
    refreshViews();
    cleanupChild = mountPatientView(clear(root), { ...ctx, pid, view: views[pid], views, getView: () => { refreshViews(); return views[pid]; }, onBack: () => { showHome(); navPush({ patient: null, section: null }); }, onOpenPatient: openPatient });
    navPush({ tab: user.userId, patient: pid });
  }

  // End-of-sim reflection (questions: data/catalogs/reflection.json). Built once, so typing isn't lost on re-render.
  let reflectionForm = null;
  function reflectionPanel(state) {
    const done = state.reflections?.[user.userId];
    if (done) return h('section', { class: 'panel' }, h('h3', {}, 'Reflection'), h('p', {}, 'Thanks, your reflection was submitted.'));
    if (reflectionForm) return reflectionForm;
    const qs = ctx.catalogs.reflection?.questions || [];
    const boxes = Object.fromEntries(qs.map((q) => [q.id, h('textarea', { class: 'input', rows: 3, 'aria-label': q.text })]));
    const drafts = Object.entries(boxes).map(([id, el]) => textDraft(el, `reflection.${user.userId}.${id}`));
    const err = h('p', { class: 'form-error', role: 'alert' });
    reflectionForm = h('section', { class: 'panel reflection' }, h('h3', {}, 'The shift is over: reflection'),
      drafts.some((d) => d.restored) ? draftNote(() => { Object.values(boxes).forEach((el) => { el.value = ''; }); drafts.forEach((d) => d.clear()); }) : null,
      qs.map((q) => h('label', { class: 'field' }, h('span', {}, q.text), boxes[q.id])), err,
      h('button', { class: 'btn btn-primary', onclick: () => {
        try { runner.submitReflection(user.userId, Object.fromEntries(Object.entries(boxes).map(([k, el]) => [k, el.value])), user); drafts.forEach((d) => d.clear()); }
        catch (e) { err.textContent = e.message; }
      } }, 'Submit reflection'));
    return reflectionForm;
  }
  let renderReflection = () => {};

  function mountHome() {
    const clock = simClock(store, runner);
    const busy = busyBanner(store, runner, user, (id) => `Rm ${views[id]?.demographics.room ?? '?'}`);
    const reflectBox = h('div', {});
    renderReflection = (state) => { if (state.clock.status === 'ended') clear(reflectBox).append(reflectionPanel(state)); };
    const list = h('ul', { class: 'student-patients' });
    const staffBox = h('div', {});
    const alerts = h('div', {});

    function render() {
      clear(staffBox).append(...[staffPanel(runner, groupId, (id) => `Rm ${views[id]?.demographics.room ?? '?'}`)].filter(Boolean));
      const state = runner.state;
      renderReflection(state);
      const simMin = runner.simMin();
      const seen = state.students[user.userId]?.seen || {};
      refreshViews();
      const mine = Object.entries(state.patients).filter(([, ps]) => ps.groupId === groupId && ps.present);
      clear(list).append(...(mine.length
        ? mine.map(([pid, ps]) => patientRow(pid, ps, views[pid], { runner, user, simMin, seenAt: seen[pid], onOpen: openPatient, scale: activeScale(scenario.settings, ctx.catalogs) }))
        : [h('li', { class: 'muted' }, 'No patients assigned.')]));

      const ids = new Set(mine.map(([pid]) => pid));
      const recent = state.alerts.filter((a) => a.audience.includes('student') && (!a.patientId || ids.has(a.patientId))).reverse().slice(0, 8);
      clear(alerts).append(recent.length
        ? h('ol', { class: 'feed' }, recent.map((a) => h('li', {},
          h('span', { class: 'feed-time' }, formatShiftTime(state.startClock, a.simMin)),
          a.patientId ? h('span', { class: 'feed-room' }, `Rm ${views[a.patientId].demographics.room}`) : null,
          h('span', {}, a.message))))
        : h('p', { class: 'muted' }, 'No alerts yet.'));
    }

    clear(root).append(
      h('header', { class: 'screen-header' }, h('h2', {}, `${user.name} · ${groupName}`),
        ctx.sound ? ctx.sound.toggle() : null,
        h('button', { class: 'btn', onclick: () => {
          const mine = Object.entries(runner.state.patients).filter(([, ps]) => ps.groupId === groupId && ps.present).map(([pid]) => pid);
          refreshViews();
          printReportSheet(runner.state, user.userId, mine, views, user.name);
        } }, 'Print report sheet'),
        clock.el),
      busy.el,
      reflectBox,
      h('section', { class: 'panel' }, h('h3', {}, 'My patients'), list),
      h('section', { class: 'panel' }, h('h3', {}, 'Alerts'), alerts),
      staffBox,
    );
    render();
    const offSet = store.subscribe(render);
    let lastMin = -1;
    const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
    return () => { clock.destroy(); busy.destroy(); offSet(); offTick(); };
  }

  const reopen = load(OPEN_KEY);
  if (reopen && views[reopen] && runner.state.patients[reopen]?.present) openPatient(reopen);
  else cleanupChild = mountHome();
  // Back / Forward: chart ↔ my patients (shared/nav.js).
  const offNav = onNav((e) => {
    if (e.tab !== user.userId) return;
    const open = load(OPEN_KEY);
    if (e.patient && e.patient !== open && views[e.patient]) showPatient(e.patient);
    else if (!e.patient && open) showHome();
  });
  return () => { offNav(); if (cleanupChild) cleanupChild(); };
}
