// allergy-conflict: a med was given that matches a patient allergy, by name or by drug class
// (classes are data in rules.json, e.g. penicillin → amoxicillin; instructor question in SPEC §14).
import { flag, ruleConfig } from './helpers.js';

export function allergyMatch(allergyAgent, medText, classes = {}) {
  const agent = allergyAgent.toLowerCase();
  const med = medText.toLowerCase();
  const names = new Set([agent.split(/\s+/)[0]]);
  for (const [cls, drugs] of Object.entries(classes)) if (agent.includes(cls)) drugs.forEach((d) => names.add(d.toLowerCase()));
  return [...names].find((n) => n.length > 2 && med.includes(n)) || null;
}

export default {
  id: 'allergy-conflict',
  label: 'Medication matches an allergy',
  evaluate(state, ctx) {
    const cfg = ruleConfig(state, ctx, 'allergy-conflict');
    const flags = [];
    for (const l of state.log) {
      if (l.action !== 'med' || l.details.result !== 'given') continue;
      for (const a of ctx.templatesById[l.patientId]?.allergies || []) {
        const hit = allergyMatch(a.agent, l.details.med || '', cfg.classes);
        if (hit) {
          flags.push(flag('allergy-conflict', cfg.severity || 'red', { patientId: l.patientId, userIds: [l.userId], atMin: l.simMin, logIds: [l.id],
            message: `Gave ${l.details.med} to a patient allergic to ${a.agent}${a.reaction ? ` (${a.reaction})` : ''}.` }));
        }
      }
    }
    return flags;
  },
};
