// Broken-reference checks for a patient's reaction script (run by engine/integrity.js, so by the loader,
// the editor and the tests). Each problem names the reaction/state, the field and the missing id.

import { resolveRhythm } from '../monitor.js';
import { EFFECT_TYPES } from './effects.js';
import { RECOVERABLE } from '../penalties.js';

const SINCE = ['state', 'event', 'reaction', 'start'];

export function scriptProblems(t, catalogs) {
  const sc = t.script;
  if (!sc) return [];
  const p = [];
  const ivs = new Map((catalogs?.interventions?.interventions || []).map((i) => [i.id, i]));
  const stateIds = new Set(sc.states.map((s) => s.id));
  const reactionIds = new Set(sc.reactions.map((r) => r.id));
  const eventIds = new Set(t.events.map((e) => e.id));
  const orders = new Map(t.orders.map((o) => [o.id, o]));
  const orderSets = new Set(t.orders.map((o) => o.orderSet));
  const changes = new Set((t.findings.changes || []).map((c) => c.eventId));
  const dup = (list, what) => list.forEach((id, i) => { if (list.indexOf(id) !== i) p.push(`script: ${what} "${id}" is defined twice`); });
  dup(sc.states.map((s) => s.id), 'state');
  dup(sc.reactions.map((r) => r.id), 'reaction');
  const state = (at, id) => { if (!stateIds.has(id)) p.push(`${at}: no state "${id}" in script.states`); };
  if (!stateIds.has(sc.initialState)) p.push(`script.initialState: no state "${sc.initialState}" in script.states`);

  for (const s of sc.states) {
    const at = `script state "${s.id}"`;
    if (s.findings && !changes.has(s.findings)) p.push(`${at} findings: no finding change "${s.findings}" (findings.changes[].eventId)`);
    if (s.rhythm && !resolveRhythm(catalogs, s.rhythm)) p.push(`${at} rhythm: "${s.rhythm}" is not in data/catalogs/rhythms.json`);
    if (s.vitals?.values?.rhythm && !resolveRhythm(catalogs, s.vitals.values.rhythm)) p.push(`${at} vitals rhythm: "${s.vitals.values.rhythm}" is not in data/catalogs/rhythms.json`);
  }

  const matcher = (at, m) => {
    if (m.kind === 'intervention') {
      const iv = ivs.get(m.interventionId);
      if (!iv) { p.push(`${at}: intervention "${m.interventionId}" is not in data/catalogs/interventions.json`); return; }
      const alts = !m.where ? [] : Array.isArray(m.where) ? m.where : [m.where];
      for (const k of alts.flatMap((w) => Object.keys(w))) if (!(iv.chartFields || []).includes(k)) p.push(`${at}: "${iv.label}" has no field "${k}" (chartFields: ${(iv.chartFields || []).join(', ') || 'none'})`);
    } else if (m.kind === 'order') {
      if (!orders.has(m.orderId)) p.push(`${at}: no order "${m.orderId}" in this patient`);
    } else if (m.kind === 'med') {
      if (m.orderId && !orders.get(m.orderId)?.med) p.push(`${at}: "${m.orderId}" is not a med order in this patient`);
      if (!m.orderId && !m.med) p.push(`${at}: a med trigger needs an order or a med name`);
    }
  };

  for (const r of sc.reactions) {
    const at = `reaction "${r.id}"`;
    const w = r.when;
    if (['intervention', 'order', 'med'].includes(w.kind)) matcher(`${at} when`, w);
    if ((w.kind === 'vitals' || w.kind === 'duration') && (w.field == null || w.op == null || typeof w.value !== 'number')) p.push(`${at} when: a vitals trigger needs field, op and value`);
    if (w.kind === 'duration' && typeof w.forMin !== 'number') p.push(`${at} when.forMin: how many minutes the threshold must hold`);
    if (w.kind === 'penalty' && typeof w.atLeastPercent !== 'number') p.push(`${at} when.atLeastPercent: the total penalty % that fires it`);
    if (w.kind === 'elapsed') {
      if (!SINCE.includes(w.since)) p.push(`${at} when.since: must be one of ${SINCE.join(', ')}`);
      if (typeof w.afterMin !== 'number') p.push(`${at} when.afterMin: needs a number of minutes`);
      if (w.since === 'state') state(`${at} when.state`, w.state);
      if (w.since === 'event' && !eventIds.has(w.eventId)) p.push(`${at} when.eventId: no event "${w.eventId}" in this patient`);
      if (w.since === 'reaction' && !reactionIds.has(w.reactionId)) p.push(`${at} when.reactionId: no reaction "${w.reactionId}"`);
      (w.without || []).forEach((m, i) => matcher(`${at} when.without[${i}]`, m));
    }
    if (w.kind === 'fired') {
      if (!w.eventId && !w.reactionId) p.push(`${at} when: a "fired" trigger needs eventId or reactionId`);
      if (w.eventId && !eventIds.has(w.eventId)) p.push(`${at} when.eventId: no event "${w.eventId}" in this patient`);
      if (w.reactionId && !reactionIds.has(w.reactionId)) p.push(`${at} when.reactionId: no reaction "${w.reactionId}"`);
      if (w.reactionId === r.id) p.push(`${at} when: a reaction can't be triggered by itself`);
    }
    (r.if?.inState || []).forEach((id) => state(`${at} if.inState`, id));
    (r.if?.notInState || []).forEach((id) => state(`${at} if.notInState`, id));
    [...(r.if?.done || []), ...(r.if?.notDone || [])].forEach((m, i) => matcher(`${at} if (action ${i + 1})`, m));
    if (!r.then.length) p.push(`${at} then: needs at least one effect`);
    r.then.forEach((e, i) => {
      const ea = `${at} then[${i}]`;
      if (!EFFECT_TYPES.includes(e.type)) p.push(`${ea}: unknown effect "${e.type}"`);
      if (e.type === 'state') state(ea, e.to);
      if (e.type === 'findings' && !changes.has(e.change)) p.push(`${ea}: no finding change "${e.change}" (findings.changes[].eventId)`);
      if (e.type === 'penalty') {
        if (!(e.percent > 0) && !Object.keys(e.caps || {}).length) p.push(`${ea}: a penalty needs a percent or at least one cap`);
        for (const [k, v] of Object.entries(e.caps || {})) if (!RECOVERABLE.includes(k) || typeof v !== 'number') p.push(`${ea}: cap "${k}" must be one of ${RECOVERABLE.join(', ')} with a number`);
      }
      if (e.type === 'fire' && !eventIds.has(e.eventId)) p.push(`${ea}: no event "${e.eventId}" in this patient`);
      if (e.type === 'vitals' && e.values?.rhythm && !resolveRhythm(catalogs, e.values.rhythm)) p.push(`${ea}: rhythm "${e.values.rhythm}" is not in data/catalogs/rhythms.json`);
      if (e.type === 'event' && e.event?.type === 'new-orders' && !orderSets.has(e.event.payload?.orderSet)) p.push(`${ea}: no orders in order set "${e.event.payload?.orderSet}"`);
      if (e.type === 'event' && e.event?.type === 'lab-result' && !t.labs.some((l) => l.code === e.event.payload?.code && l.status === 'pending')) p.push(`${ea}: no pending lab "${e.event.payload?.code}" in this patient`);
    });
  }
  return p;
}

/**
 * Checks for data/catalogs/reaction-templates.json: each template must be a self-contained script piece
 * (its reactions only point at its own states and reactions, and at catalog interventions). Uses scriptProblems
 * on a bare patient, so a template can't depend on one patient's orders or events.
 */
export function reactionTemplateProblems(catalog, catalogs) {
  return (catalog?.templates || []).flatMap((tpl) => {
    const changes = [];
    const states = tpl.states.map(({ findingsText, ...s }) => (findingsText?.length ? (changes.push({ eventId: `state-${s.id}`, findings: findingsText }), { ...s, findings: `state-${s.id}` }) : s));
    const reactions = tpl.reactions.map((r) => ({ ...r, then: r.then.map((e, i) => (e.type === 'findings' && e.findingsText ? (changes.push({ eventId: `${r.id}-f${i}`, findings: e.findingsText }), { type: 'findings', change: `${r.id}-f${i}` }) : e)) }));
    const all = states.length ? states : [{ id: 'template-start', label: 'Start' }]; // a template may add reactions only
    const bare = { events: [], orders: [], labs: [], findings: { changes }, script: { initialState: all[0].id, states: all, reactions } };
    return scriptProblems(bare, catalogs).map((m) => `template "${tpl.id}": ${m.replace(' in this patient', ' (templates cannot use a patient\'s own orders or events)')}`);
  });
}
