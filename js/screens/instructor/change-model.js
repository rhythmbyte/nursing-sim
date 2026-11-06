// "Scenario changes" ⇄ patient template. No DOM, pure (tested in tests/editor.test.mjs).
// A scenario change = one moment in the case: the events sharing a `group` (an ungrouped event is its own
// change), plus the vitals keyframe, finding change, order set and "should recognize" notes they point to.
// Saving rewrites only those parts and REUSES existing event ids, so references elsewhere keep working
// (order activeOnEvent, parameter watchEvent, keyframe/finding eventIds). Event types the builder doesn't
// manage (admission, code, lab-result) are kept and retimed with the change.

import { lines } from '../shared/text.js';
const MANAGED = ['call-light', 'staff-message', 'vitals-change', 'findings-change', 'new-orders'];
const VITAL_KEYS = ['rhythm', 'bp', 'hr', 'rr', 'tempF', 'spo2', 'o2', 'pain'];
const NUMERIC = ['hr', 'rr', 'tempF', 'spo2', 'gcs', 'glucose'];

export const clockToMin = (startClock, hhmm) => {
  const [sh, sm] = startClock.split(':').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return (((h * 60 + m) - (sh * 60 + sm)) % 1440 + 1440) % 1440;
};
export const minToClock = (startClock, min) => {
  const [sh, sm] = startClock.split(':').map(Number);
  const t = ((sh * 60 + sm + Math.round(min)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const keyOf = (e) => e.group || e.id;

/** All scenario changes in a template, ordered by time (instructor-triggered last). */
export function listChanges(t) {
  const byKey = new Map();
  for (const e of t.events) {
    if (!byKey.has(keyOf(e))) byKey.set(keyOf(e), []);
    byKey.get(keyOf(e)).push(e);
  }
  return [...byKey.entries()].map(([key, events]) => {
    const start = events.find((e) => e.type === 'call-light' || e.type === 'staff-message') || events[0];
    return { key, events, atMin: events[0].atMin ?? null, manual: events[0].atMin == null, label: start.payload?.message || `${start.type} (${start.id})`, type: start.type };
  }).sort((a, b) => (a.atMin ?? Infinity) - (b.atMin ?? Infinity));
}

/** Builder form for a change (or a blank one when key is null). */
export function changeToForm(t, key, startClock) {
  const events = key ? t.events.filter((e) => keyOf(e) === key) : [];
  const first = events[0];
  const start = events.find((e) => e.type === 'call-light' || e.type === 'staff-message');
  const ve = events.find((e) => e.type === 'vitals-change');
  const fe = events.find((e) => e.type === 'findings-change');
  const oe = events.find((e) => e.type === 'new-orders');
  const kf = ve && t.vitals.keyframes?.find((k) => k.eventId === ve.payload.keyframe);
  const fc = fe && t.findings.changes?.find((c) => c.eventId === fe.payload.change);
  const orders = oe ? t.orders.filter((o) => o.orderSet === oe.payload.orderSet) : [];
  const manual = first ? first.atMin == null : false;
  return {
    key,
    time: first && !manual ? minToClock(startClock, first.atMin) : '08:00',
    manual,
    start: start ? start.type : (manual && !start ? 'silent' : 'silent'),
    from: start?.payload?.from || 'CNA',
    message: start?.payload?.message || oe?.payload?.message || '',
    // Every key the keyframe has (gcs, hrNote, …) plus the standard ones, so nothing is lost on save.
    vitals: { ...Object.fromEntries(VITAL_KEYS.map((k) => [k, ''])), ...(kf?.values || {}) },
    findings: fc ? fc.findings.join('\n') : '',
    orders: orders.map((o) => ({ id: o.id, text: o.text, type: o.type, tier: o.tier, interventionId: o.interventionIds?.[0] || '', med: o.med || '', delegable: Boolean(o.delegable) })),
    recognize: (t.debrief?.byChange?.[key] || []).join('\n'),
    keep: events.filter((e) => !MANAGED.includes(e.type)),
    ids: { start: start?.id, vitals: ve?.id, findings: fe?.id, orders: oe?.id, orderSet: oe?.payload?.orderSet },
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'change';

/** New template with the change written from the form. Returns { template, key }. */
export function formToChange(t, f, startClock) {
  const short = t.id.split('-')[0];
  const key = f.key || `${short}-${slug(f.message || f.time)}-${Date.now().toString(36).slice(-4)}`;
  const id = (role) => f.ids?.[role] || `e-${short}-${slug(key)}-${role}`;
  const timing = f.manual ? { trigger: 'manual' } : { atMin: clockToMin(startClock, f.time) };
  const old = new Set(t.events.filter((e) => keyOf(e) === f.key && MANAGED.includes(e.type)).map((e) => e.id));
  const events = t.events.filter((e) => !old.has(e.id) && !(f.key && keyOf(e) === f.key));
  const prev = Object.fromEntries(t.events.filter((e) => old.has(e.id)).map((e) => [e.id, e]));
  const ev = (role, type, payload) => {
    const eid = id(role);
    const was = prev[eid] || {};
    const { atMin, trigger, ...rest } = was;
    return { ...rest, id: eid, group: key, type, ...timing, payload: { ...(was.payload || {}), ...payload } };
  };
  const out = [];
  if (f.start === 'call-light') out.push(ev('start', 'call-light', { message: f.message }));
  if (f.start === 'staff-message') out.push(ev('start', 'staff-message', { from: f.from || 'CNA', message: f.message }));

  const vitals = Object.fromEntries(Object.entries(f.vitals || {}).filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => [k, NUMERIC.includes(k) && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v]));
  const oldKfId = f.ids?.vitals ? prev[f.ids.vitals]?.payload?.keyframe : null;
  const oldKf = (t.vitals.keyframes || []).find((k) => k.eventId === oldKfId) || {};
  let keyframes = (t.vitals.keyframes || []).filter((k) => k.eventId !== key && k.eventId !== oldKfId);
  if (Object.keys(vitals).length) {
    const kfId = oldKfId || key;
    const { atMin: _a, values: _v, ...kfRest } = oldKf; // keep review, notes, etc.
    keyframes = [...keyframes, { ...kfRest, ...(f.manual ? {} : { atMin: timing.atMin }), eventId: kfId, values: vitals }];
    out.push(ev('vitals', 'vitals-change', { keyframe: kfId }));
  }
  const fl = lines(f.findings);
  const oldChange = f.ids?.findings ? prev[f.ids.findings]?.payload?.change : null;
  let changes = (t.findings.changes || []).filter((c) => c.eventId !== key && c.eventId !== oldChange);
  if (fl.length) {
    const cid = oldChange || key;
    changes = [...changes, { eventId: cid, findings: fl }];
    out.push(ev('findings', 'findings-change', { change: cid }));
  }
  const orderSet = f.ids?.orderSet || `os-${slug(key)}`;
  let orders = t.orders.filter((o) => o.orderSet !== orderSet);
  const newOrders = (f.orders || []).filter((o) => o.text?.trim()).map((o, i) => {
    const was = t.orders.find((x) => x.id === o.id) || {};
    const { activeFromMin, activeOnEvent, ...rest } = was;
    return { ...rest, id: o.id || `o-${short}-${slug(key)}-${i + 1}`, text: o.text.trim(), type: o.type || 'once', tier: Number(o.tier) || 2,
      orderSet, interventionIds: o.interventionId ? [o.interventionId] : (was.interventionIds || []), delegable: Boolean(o.delegable),
      ...(o.med ? { med: o.med } : {}), activeOnEvent: id('orders') };
  });
  if (newOrders.length) {
    orders = [...orders, ...newOrders];
    const msg = f.start === 'silent' && f.message ? f.message : prev[id('orders')]?.payload?.message || 'New orders from provider.';
    out.push(ev('orders', 'new-orders', { orderSet, message: msg }));
  }
  for (const k of f.keep || []) { const { atMin, trigger, ...rest } = k; out.push({ ...rest, group: key, ...timing }); }

  const byChange = { ...(t.debrief?.byChange || {}) };
  const rec = lines(f.recognize);
  if (rec.length) byChange[key] = rec; else delete byChange[key];
  return {
    key,
    template: {
      ...t,
      events: [...events, ...out],
      vitals: { ...t.vitals, keyframes },
      findings: { ...t.findings, changes },
      orders,
      debrief: { ...t.debrief, byChange },
    },
  };
}

/** Remove a change entirely. */
export function deleteChange(t, key, startClock) {
  const f = changeToForm(t, key, startClock);
  const { template } = formToChange(t, { ...f, start: 'silent', vitals: {}, findings: '', orders: [], recognize: '', keep: [] }, startClock);
  return { ...template, events: template.events.filter((e) => keyOf(e) !== key) };
}

/** Move a change to a new sim minute (timeline drag). */
export function retimeChange(t, key, atMin) {
  const ids = new Set(t.events.filter((e) => keyOf(e) === key).map((e) => e.id));
  const kfIds = new Set(t.events.filter((e) => ids.has(e.id) && e.type === 'vitals-change').map((e) => e.payload.keyframe));
  return {
    ...t,
    events: t.events.map((e) => (ids.has(e.id) ? (({ trigger, ...rest }) => ({ ...rest, atMin }))(e) : e)),
    vitals: { ...t.vitals, keyframes: (t.vitals.keyframes || []).map((k) => (kfIds.has(k.eventId) ? { ...k, atMin } : k)) },
  };
}

/** Copy a change 15 min later with new ids. */
export function duplicateChange(t, key, startClock) {
  const f = changeToForm(t, key, startClock);
  const time = f.manual ? f.time : minToClock(startClock, clockToMin(startClock, f.time) + 15);
  return formToChange(t, { ...f, key: null, ids: {}, time, keep: [], orders: f.orders.map((o) => ({ ...o, id: null })) }, startClock);
}
