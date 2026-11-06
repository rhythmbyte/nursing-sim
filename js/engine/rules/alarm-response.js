// alarm-response: a monitor alarm wasn't acknowledged (silenced) within amberAfterMin / redAfterMin
// (rules.json; SPEC §14). Alarms that clear on their own before the amber threshold aren't flagged.
import { flag, ruleConfig, responsible, mins } from './helpers.js';
import { alarmEpisodes } from '../monitor-alarms.js';

export default {
  id: 'alarm-response',
  label: 'Monitor alarm response time',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'alarm-response');
    const flags = [];
    for (const pid of Object.keys(state.patients)) {
      for (const ep of alarmEpisodes(state.log, pid)) {
        const until = ep.ack ?? ep.end ?? ctx.simMin;
        const waited = until - ep.start;
        if (ep.ack == null && ep.end != null && waited <= cfg.amberAfterMin) continue; // cleared on its own quickly
        const severity = waited > cfg.redAfterMin ? 'red' : waited > cfg.amberAfterMin ? 'amber' : null;
        if (!severity) continue;
        flags.push(flag('alarm-response', severity, {
          patientId: pid, userIds: ep.ackBy ? [ep.ackBy] : responsible(state, ctx, pid), atMin: ep.start,
          message: ep.ack != null ? `Monitor alarm (${ep.alarms.join(', ')}) acknowledged after ${mins(waited)}.` : `Monitor alarm (${ep.alarms.join(', ')}) not acknowledged for ${mins(waited)}.`,
        }));
      }
    }
    return flags;
  },
};
