// Charge tab (SPEC §9): Admissions board + Unit overview. Played by a student (userId "charge") or by
// the instructor (role "charge"), per settings.chargeNurse. Full build: a student account assigned the role.

import { h, clear } from '../shared/dom.js';
import { simClock } from '../shared/timer.js';
import { unitOverview } from './unit-overview.js';
import { staffBoard } from './staff-board.js';
import { admissionsBoard } from './admissions-board.js';
import { canSeeInstructorTags } from '../../engine/priority.js';

export function mountCharge(root, { store, runner, scenario, instructorUser, catalogs: ctxCatalogs }) {
  const user = scenario.settings.chargeNurse === 'instructor'
    ? { userId: instructorUser.userId, role: 'charge', name: 'Instructor (charge)' }
    : { userId: 'charge', role: 'charge', name: 'Charge nurse' };
  // Viewer role for tag visibility: the instructor playing charge is still the instructor.
  const seesTags = canSeeInstructorTags(scenario.settings, scenario.settings.chargeNurse === 'instructor' ? 'instructor' : 'charge');
  const clock = simClock(store, runner);
  const board = h('div', {});
  const unit = h('div', {});
  const staff = h('div', {});

  function render() {
    const t = runner.templates();
    clear(board).append(admissionsBoard(runner, t, scenario, user, { seesTags, catalogs: ctxCatalogs }));
    clear(unit).append(unitOverview(runner, t, scenario, { seesTags }));
    clear(staff).append(staffBoard(runner, scenario, user, t, ctxCatalogs));
  }

  root.append(
    h('header', { class: 'screen-header' }, h('h2', {}, `Charge nurse · ${user.name}`), clock.el),
    h('section', { class: 'panel' }, h('h3', {}, 'Admissions board'), board),
    h('section', { class: 'panel' }, h('h3', {}, 'Unit overview'), unit),
    h('section', { class: 'panel' }, h('h3', {}, 'Staff'), staff),
  );
  render();
  const off = store.subscribe(render);
  let lastMin = -1;
  const offTick = store.on('tick', (m) => { if (Math.floor(m) !== lastMin) { lastMin = Math.floor(m); render(); } });
  return () => { off(); offTick(); clock.destroy(); };
}
