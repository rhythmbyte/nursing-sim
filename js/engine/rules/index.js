// Registers every flag rule and evaluates them. Adding a rule = one new file + one line here.
// Rules are pure functions of the session: flags are recomputed on demand (live control, debrief),
// never stored, so they can't drift from the log.
import { registerRule, allRules } from '../registry.js';
import priorityOrder from './priority-order.js';
import tierTimeout from './tier-timeout.js';
import callLightResponse from './call-light-response.js';
import parameterBreach from './parameter-breach.js';
import inappropriateDelegation from './inappropriate-delegation.js';
import allergyConflict from './allergy-conflict.js';
import prnLimit from './prn-limit.js';
import leftUnattended from './left-unattended.js';
import priorityMismatch from './priority-mismatch.js';
import alarmResponse from './alarm-response.js';
import assessmentMismatch from './assessment-mismatch.js';
import assessmentOverdue from './assessment-overdue.js';
import requiredAssessmentMissing from './required-assessment-missing.js';
import { ruleConfig } from './helpers.js';
import { withoutStruck } from '../struck.js';

[priorityOrder, tierTimeout, callLightResponse, parameterBreach, inappropriateDelegation, allergyConflict, prnLimit, leftUnattended, priorityMismatch, alarmResponse, assessmentMismatch, assessmentOverdue, requiredAssessmentMissing]
  .forEach(registerRule);

/** All flags for the session at ctx.simMin, sorted by time. ctx: { templatesById, catalogs, simMin, studentIdsForGroup } */
export function evaluateRules(fullState, ctx) {
  const state = withoutStruck(fullState); // entries marked "entered in error" don't count
  const flags = [];
  for (const rule of allRules()) {
    if (ruleConfig(state, ctx, rule.id).enabled === false) continue; // any rule can be switched off in rules.json
    try {
      flags.push(...rule.evaluate(state, ctx));
    } catch (err) {
      console.error(`Rule ${rule.id} failed:`, err);
    }
  }
  return flags.sort((a, b) => a.atMin - b.atMin);
}
