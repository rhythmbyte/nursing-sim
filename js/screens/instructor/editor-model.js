// Patient editor ⇄ template JSON. The simple sections are form fields; the nested ones (labs, events,
// vitals changes, finding changes, outcome, code branch, review notes) are edited as JSON. No DOM.

export const ADVANCED_KEYS = ['reviewNotes', 'labs', 'events', 'outcome', 'codeBranch'];

const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const pipes = (line) => line.split('|').map((x) => x.trim());

export function blankPatient(id) {
  return {
    id, review: 'proposed', reviewNotes: [], source: 'New patient',
    demographics: { name: '', age: 50, sex: 'F', room: '' }, tag: 'green', priorityLabel: '',
    admittingDx: '', codeStatus: 'Full code', allergies: [], hpi: '', pmh: [], homeMeds: [],
    handoff: { situation: '', background: '', assessment: '', recommendation: '' },
    vitals: { baseline: { bp: '120/80', hr: 80, rr: 16, tempF: 98.6, spo2: 98, o2: 'RA', pain: '0/10' }, keyframes: [] },
    findings: { baseline: [], changes: [] }, labs: [], orders: [], events: [],
    outcome: { mode: 'survive', notes: '' }, codeBranch: null, debrief: { shouldRecognize: [], instructorNotes: [] },
  };
}

export function toForm(t) {
  return {
    name: t.demographics.name, age: t.demographics.age, sex: t.demographics.sex, room: t.demographics.room,
    tag: t.tag, priorityLabel: t.priorityLabel || '', admittingDx: t.admittingDx, codeStatus: t.codeStatus, review: t.review, source: t.source || '',
    allergies: t.allergies.map((a) => [a.agent, a.reaction].filter(Boolean).join(' | ')).join('\n'), allergyText: t.allergyText || '',
    hpi: t.hpi || '', pmh: (t.pmh || []).join('\n'), homeMeds: (t.homeMeds || []).map((m) => [m.name, m.dose, m.freq].join(' | ')).join('\n'),
    ...Object.fromEntries(['situation', 'background', 'assessment', 'recommendation'].map((k) => [k, t.handoff?.[k] || ''])),
    ...Object.fromEntries(Object.entries(t.vitals.baseline).map(([k, v]) => [`v_${k}`, String(v)])),
    findings: t.findings.baseline.join('\n'),
    shouldRecognize: (t.debrief?.shouldRecognize || []).join('\n'), instructorNotes: (t.debrief?.instructorNotes || []).join('\n'),
    keyframes: JSON.stringify(t.vitals.keyframes || [], null, 2),
    findingChanges: JSON.stringify(t.findings.changes || [], null, 2),
    advanced: JSON.stringify(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, t[k] ?? null])), null, 2),
  };
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? v : Number(v));

/** Builds a template from form values over `base` (keeps fields the form doesn't show). Throws on bad JSON. */
export function fromForm(f, base, orders) {
  const parse = (label, text) => {
    try { return JSON.parse(text); } catch (e) { throw new Error(`${label}: ${e.message}`); }
  };
  const adv = parse('Advanced JSON', f.advanced);
  const baseline = Object.fromEntries(Object.entries(f).filter(([k, v]) => k.startsWith('v_') && v !== '').map(([k, v]) => [k.slice(2), ['hr', 'rr', 'tempF', 'spo2'].includes(k.slice(2)) ? num(v) : v]));
  const t = {
    ...base,
    review: f.review, source: f.source,
    demographics: { name: f.name.trim(), age: num(f.age), sex: f.sex, room: f.room.trim() },
    tag: f.tag, priorityLabel: f.priorityLabel, admittingDx: f.admittingDx.trim(), codeStatus: f.codeStatus,
    allergies: lines(f.allergies).map(pipes).map(([agent, reaction]) => ({ agent, ...(reaction ? { reaction } : {}) })),
    hpi: f.hpi, pmh: lines(f.pmh),
    homeMeds: lines(f.homeMeds).map(pipes).map(([name, dose, freq]) => ({ name, ...(dose ? { dose } : {}), ...(freq ? { freq } : {}) })),
    handoff: { ...(base.handoff || {}), situation: f.situation, background: f.background, assessment: f.assessment, recommendation: f.recommendation },
    vitals: { ...base.vitals, baseline, keyframes: parse('Vitals changes', f.keyframes) },
    findings: { ...base.findings, baseline: lines(f.findings), changes: parse('Finding changes', f.findingChanges) },
    orders,
    debrief: { ...(base.debrief || {}), shouldRecognize: lines(f.shouldRecognize), instructorNotes: lines(f.instructorNotes) },
  };
  if (f.allergyText.trim()) t.allergyText = f.allergyText.trim(); else delete t.allergyText;
  for (const k of ADVANCED_KEYS) if (k in adv) t[k] = adv[k];
  return t;
}
