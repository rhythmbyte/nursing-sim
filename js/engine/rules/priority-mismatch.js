// priority-mismatch: a student's priority for a patient doesn't match the instructor's tag for longer
// than graceMin (after either side changes). Optional: patients never prioritized (flagUnassigned).
// Whether it fires at all and its severity are data (rules.json: enabled, severity, graceMin).
import { flag, ruleConfig } from './helpers.js';
import { activeScale, priorityTimeline } from '../priority.js';

export default {
  id: 'priority-mismatch',
  label: 'Student priority differs from the instructor tag',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'priority-mismatch');
    const scale = activeScale(state.settings, ctx.catalogs);
    const labelOf = Object.fromEntries(scale.levels.map((l) => [l.id, l.label]));
    const flags = [];
    for (const [userId, r] of Object.entries(state.roster || {})) {
      for (const [pid, ps] of Object.entries(state.patients)) {
        if (!ps.present || ps.groupId !== r.groupId) continue;
        const segs = priorityTimeline(state, userId, pid, scale, ctx.simMin);
        for (const s of segs) {
          const long = s.toMin - s.fromMin > (cfg.graceMin ?? 0);
          if (s.match === false && long) {
            flags.push(flag('priority-mismatch', cfg.severity || 'amber', { patientId: pid, userIds: [userId], atMin: s.fromMin,
              message: `Prioritized ${labelOf[s.levelId]}; instructor tag was ${s.tag} (${Math.round(s.toMin - s.fromMin)} min).` }));
          }
        }
        if (cfg.flagUnassigned && segs.length && segs.every((s) => s.levelId == null) && ctx.simMin - segs[0].fromMin > (cfg.graceMin ?? 0)) {
          flags.push(flag('priority-mismatch', cfg.severity || 'amber', { patientId: pid, userIds: [userId], atMin: segs[0].fromMin, message: 'Never prioritized this patient.' }));
        }
      }
    }
    return flags;
  },
};
