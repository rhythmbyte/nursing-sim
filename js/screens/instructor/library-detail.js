// Read-only view of one patient template, sectioned like the instructor's case write-ups.

import { h } from '../shared/dom.js';
import { badge, reviewBadge } from '../shared/badge.js';
import { triageChip } from '../shared/triage-chip.js';
import { formatShiftTime } from '../../engine/time.js';

const VITAL_LABELS = { bp: 'BP', hr: 'HR', rr: 'RR', tempF: 'Temp °F', spo2: 'SpO₂ %', o2: 'O₂', pain: 'Pain' };
const TIER_LABELS = { 1: 'Tier 1 · immediate', 2: 'Tier 2 · urgent', 3: 'Tier 3 · routine' };

function section(title, obj, ...body) {
  return h('section', { class: 'detail-section' },
    h('h3', {}, title, ' ', reviewBadge(obj)),
    ...body,
  );
}

const list = (items) => (items?.length ? h('ul', {}, items.map((i) => h('li', {}, i))) : h('p', { class: 'muted' }, 'None'));

function vitalsTable(values) {
  return h('dl', { class: 'vitals' },
    Object.entries(VITAL_LABELS)
      .filter(([k]) => values[k] != null)
      .map(([k, label]) => [h('dt', {}, label), h('dd', {}, values[k])]),
  );
}

function labsTable(labs, catalog) {
  const byCode = Object.fromEntries((catalog?.labs || []).map((l) => [l.code, l]));
  return h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Lab', 'Value', 'Ref range', 'Status'].map((c) => h('th', {}, c)))),
    h('tbody', {}, labs.map((l) => {
      const cat = byCode[l.code] || {};
      const unit = l.unit || cat.unit || '';
      return h('tr', {},
        h('td', {}, l.label || cat.name || l.code, ' ', reviewBadge(l)),
        h('td', {}, l.value != null ? `${l.value} ${unit}`.trim() : '—'),
        h('td', {}, cat.refRange || ''),
        h('td', {}, l.status === 'pending' ? badge(`Pending${l.resultDelayMin != null ? ` · ${l.resultDelayMin} min` : ''}`, 'pending') : 'Resulted'),
      );
    })),
  );
}

function ordersTable(orders, startClock) {
  return h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['Order', 'Type', 'Tier', 'Set', 'Active', 'Delegable'].map((c) => h('th', {}, c)))),
    h('tbody', {}, orders.map((o) => h('tr', {},
      h('td', {}, o.text, ' ', reviewBadge(o)),
      h('td', {}, o.type),
      h('td', {}, h('span', { class: `tier tier-${o.tier}` }, TIER_LABELS[o.tier])),
      h('td', {}, h('code', {}, o.orderSet)),
      h('td', {}, o.activeOnEvent ? `on ${o.activeOnEvent}` : `atMin ${o.activeFromMin} = ${formatShiftTime(startClock, o.activeFromMin)}`),
      h('td', {}, o.delegable ? 'Yes' : 'No'),
    ))),
  );
}

function eventsTable(events, startClock) {
  const sorted = [...events].sort((a, b) => (a.atMin ?? Infinity) - (b.atMin ?? Infinity));
  return h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, ['When', 'Type', 'Details'].map((c) => h('th', {}, c)))),
    h('tbody', {}, sorted.map((e) => h('tr', {},
      h('td', {}, e.atMin != null ? `atMin ${e.atMin} = ${formatShiftTime(startClock, e.atMin)}` : 'On trigger'),
      h('td', {}, h('code', {}, e.type)),
      h('td', {}, e.payload?.message || e.id, ' ', reviewBadge(e)),
    ))),
  );
}

export function patientDetail(p, { catalogs, startClock }) {
  const d = p.demographics;
  const allergies = p.allergies.length
    ? p.allergies.map((a) => `${a.agent}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')
    : p.allergyText || 'NKDA';

  return h('article', { class: 'patient-detail' },
    h('header', { class: 'chart-banner' },
      h('div', {},
        h('h2', {}, d.name, ' ', triageChip(p.tag)),
        h('div', {}, `${d.age}${d.sex} · Room ${d.room} · ${p.codeStatus}`),
        h('div', {}, h('strong', {}, 'Allergies: '), allergies),
      ),
      h('div', { class: 'banner-right' },
        h('div', {}, p.priorityLabel),
        h('div', { class: 'muted' }, p.source),
        h('div', {}, badge(`File: ${p.review}`, p.review === 'approved' ? 'ok' : 'review')),
      ),
    ),

    p.reviewNotes?.length
      ? h('div', { class: 'banner banner-review' }, h('strong', {}, 'For the instructor to confirm:'), list(p.reviewNotes))
      : null,

    section('Admitting diagnosis', null, h('p', {}, p.admittingDx)),
    section('History of present illness', null, h('p', {}, p.hpi || '—')),
    section('Past medical history', null, list(p.pmh)),
    section('Home medications', null, list((p.homeMeds || []).map((m) => [m.name, m.dose, m.freq].filter(Boolean).join(' ')))),
    p.handoff ? section('Handoff (SBAR)', p.handoff,
      h('dl', { class: 'sbar' },
        ['situation', 'background', 'assessment', 'recommendation'].map((k) => [
          h('dt', {}, k[0].toUpperCase() + k.slice(1)), h('dd', {}, p.handoff[k] || '—'),
        ]),
      ),
    ) : null,
    section('Baseline vitals', p.vitals, vitalsTable(p.vitals.baseline)),
    section('Assessment findings (baseline)', p.findings, list(p.findings.baseline)),
    section('Labs', null, labsTable(p.labs, catalogs.labs), p.labNote ? h('p', { class: 'muted' }, p.labNote) : null),
    section('Orders', null, ordersTable(p.orders, startClock)),
    section('Events timeline', null, eventsTable(p.events, startClock)),
    section('Outcome', p.codeBranch, h('p', {}, `Mode: ${p.outcome.mode}. ${p.outcome.notes || ''}`),
      p.codeBranch ? h('p', {}, `Code branch (${p.codeBranch.enabled ? 'enabled' : 'disabled'}): ${p.codeBranch.description || ''}`) : null),
    section('Debrief: should recognize (instructor only)', p.debrief, list(p.debrief.shouldRecognize)),
  );
}
