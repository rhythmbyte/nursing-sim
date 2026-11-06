// Patient editor ⇄ template JSON (no JSON in the normal workflow). Form fields cover demographics, H&P,
// SBAR, baseline vitals, findings, debrief, outcome, code branch and review notes; orders and labs come
// from their tables; events/vitals changes/finding changes are edited as scenario changes (change-model.js).
// No DOM.

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
    reviewNotes: (t.reviewNotes || []).join('\n'),
    outcomeMode: t.outcome?.mode || 'survive', outcomeNotes: t.outcome?.notes || '',
    cbOn: Boolean(t.codeBranch), cbEnabled: Boolean(t.codeBranch?.enabled), cbDescription: t.codeBranch?.description || '',
    cbIfNotCharted: (t.codeBranch?.trigger?.ifNotCharted || []).join(', '), cbByMin: t.codeBranch?.trigger?.byMin ?? '',
    cbRhythm: t.codeBranch?.event?.payload?.rhythm || '', cbMessage: t.codeBranch?.event?.payload?.message || '',
  };
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? v : Number(v));

function codeBranchFrom(f, base) {
  if (!f.cbOn) return null;
  const prev = base.codeBranch || {};
  return {
    ...prev,
    enabled: Boolean(f.cbEnabled),
    description: f.cbDescription,
    trigger: { ...(prev.trigger || {}), ifNotCharted: f.cbIfNotCharted.split(',').map((x) => x.trim()).filter(Boolean), byMin: num(f.cbByMin) },
    event: { id: prev.event?.id || `e-${base.id.split('-')[0]}-code`, type: 'code', ...(prev.event || {}), payload: { ...(prev.event?.payload || {}), rhythm: f.cbRhythm, message: f.cbMessage } },
  };
}

/** Builds a template from form values over `base` (keeps everything the form doesn't show). */
export function fromForm(f, base, { orders = base.orders, labs = base.labs } = {}) {
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
    vitals: { ...base.vitals, baseline },
    findings: { ...base.findings, baseline: lines(f.findings) },
    orders,
    labs,
    reviewNotes: lines(f.reviewNotes),
    outcome: { ...(base.outcome || {}), mode: f.outcomeMode, notes: f.outcomeNotes },
    codeBranch: codeBranchFrom(f, base),
    debrief: { ...(base.debrief || {}), shouldRecognize: lines(f.shouldRecognize), instructorNotes: lines(f.instructorNotes) },
  };
  if (f.allergyText.trim()) t.allergyText = f.allergyText.trim(); else delete t.allergyText;
  return t;
}
