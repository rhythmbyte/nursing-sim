// Chart sections, left to right (SPEC §6). Adding a section = one new file + one line here.
// Section: { id, label, mount(root, ctx) → { update(state), destroy?() } }
//   ctx: { store, runner, pid, view (student view of the template), user, catalogs, scenario,
//          act(name, args) → runner.chart(name, pid, args, user), patientState() }
//   mount builds static parts (forms) once; update(state) re-renders only dynamic parts.

import summary from './summary.js';
import orders from './orders.js';
import flowsheet from './flowsheet.js';
import mar from './mar.js';
import labs from './labs.js';
import interventions from './interventions.js';
import notes from './notes.js';
import handoff from './handoff.js';

export function chartSections(handoffMode) {
  const list = [summary, orders, flowsheet, mar, labs, interventions, notes];
  if (handoffMode === 'always') list.push(handoff);
  return list;
}
