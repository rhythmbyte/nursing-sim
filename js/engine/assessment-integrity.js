// Broken-reference checks for assessment data in a patient file (run by engine/integrity.js): expected answers
// (baseline, script states, assessment-change events, reaction effects), order requirements and reaction triggers
// must name real tools and items, with values the item allows.

import { toolById } from './assessment-score.js';

function answersProblems(at, answers, catalogs) {
  const p = [];
  for (const [toolId, items] of Object.entries(answers || {})) {
    const tool = toolById(catalogs, toolId);
    if (!tool) { p.push(`${at}: assessment tool "${toolId}" is not in data/catalogs/assessment-tools.json`); continue; }
    if (tool.scoring === 'auto') { p.push(`${at}: ${tool.name} is calculated from vitals; it has no answers to script`); continue; }
    for (const [itemId, v] of Object.entries(items || {})) {
      const item = tool.items.find((i) => i.id === itemId);
      if (!item) { p.push(`${at}: ${tool.name} has no item "${itemId}"`); continue; }
      if (item.type === 'choice' && !item.options.some((o) => o.points === v)) p.push(`${at}: ${tool.name} "${item.label}" has no option worth ${v} (options: ${item.options.map((o) => o.points).join(', ')})`);
      if (item.type === 'scale' && !(typeof v === 'number' && v >= item.min && v <= item.max)) p.push(`${at}: ${tool.name} "${item.label}" must be ${item.min}–${item.max}`);
    }
  }
  return p;
}

export function assessmentProblems(t, catalogs) {
  if (!catalogs?.assessmentTools) return [];
  const p = [...answersProblems('assessments.baseline', t.assessments?.baseline, catalogs)];
  for (const s of t.script?.states || []) p.push(...answersProblems(`script state "${s.id}" assessments`, s.assessments, catalogs));
  for (const e of t.events) if (e.type === 'assessment-change') p.push(...answersProblems(`events "${e.id}"`, e.payload?.answers, catalogs));
  for (const r of t.script?.reactions || []) {
    r.then.forEach((e, i) => { if (e.type === 'assessment') p.push(...answersProblems(`reaction "${r.id}" then[${i}]`, e.answers, catalogs)); });
    if (r.when.kind === 'assessment') {
      const tool = toolById(catalogs, r.when.toolId);
      if (!tool) p.push(`reaction "${r.id}" when: assessment tool "${r.when.toolId}" is not in the catalog`);
      else if (tool.scoring === 'none') p.push(`reaction "${r.id}" when: ${tool.name} has no score to compare`);
      if (r.when.rise == null && (r.when.op == null || typeof r.when.value !== 'number')) p.push(`reaction "${r.id}" when: an assessment trigger needs op and value, or rise`);
    }
  }
  for (const o of t.orders) {
    for (const id of o.assessment?.tools || []) if (!toolById(catalogs, id)) p.push(`orders "${o.id}" assessment: tool "${id}" is not in the catalog`);
    if (o.assessment?.afterDoseMin != null && !o.med) p.push(`orders "${o.id}" assessment.afterDoseMin: only med orders have doses`);
  }
  return p;
}
