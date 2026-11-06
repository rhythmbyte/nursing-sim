// Script builder: state diagram. States are boxes (columns by distance from the starting state), reactions
// that change state are arrows labelled with their trigger. Click (or Enter) a box or an arrow to edit it.
// Text from data is set with textContent (B10). Layout is pure (diagramLayout) and tested.

import { h } from '../shared/dom.js';
import { names, triggerText } from '../../engine/reactions/describe.js';

const W = 214; const H = 54; const GX = 110; const GY = 34; const PAD = 16;
const ANY = '*';

/** Where each state box goes and which arrows to draw. Reactions without a state change are listed apart. */
export function diagramLayout(script) {
  const ids = script.states.map((s) => s.id);
  const edges = [];
  const other = [];
  for (const r of script.reactions) {
    const targets = r.then.filter((e) => e.type === 'state').map((e) => e.to).filter((to) => ids.includes(to));
    if (!targets.length) { other.push(r.id); continue; }
    const from = r.if?.inState?.length ? r.if.inState : r.when.kind === 'elapsed' && r.when.since === 'state' ? [r.when.state] : [ANY];
    for (const f of from) for (const to of targets) if (f !== to) edges.push({ from: f, to, reactionId: r.id });
  }
  const col = { [script.initialState]: 0 };
  const queue = [script.initialState];
  while (queue.length) {
    const s = queue.shift();
    for (const e of edges) if ((e.from === s || (e.from === ANY && s === script.initialState)) && col[e.to] == null) { col[e.to] = col[s] + 1; queue.push(e.to); }
  }
  const maxCol = Math.max(0, ...Object.values(col));
  for (const id of ids) col[id] ??= maxCol + 1; // not reachable from the start by a state change
  const rows = {};
  const pos = {};
  for (const id of ids) { const c = col[id]; rows[c] = (rows[c] || 0) + 1; pos[id] = { col: c, row: rows[c] - 1 }; }
  const hasAny = edges.some((e) => e.from === ANY);
  return { pos, edges, other, hasAny, cols: Math.max(...Object.values(col)) + 1, rows: Math.max(1, ...Object.values(rows)) };
}

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
function clickable(el, label, fn) {
  el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', label);
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  return el;
}

/** onState(id), onReaction(id). `current` highlights a state (e.g. in the dry run). */
export function stateDiagram(template, catalogs, { onState, onReaction, current = null }) {
  const sc = template.script;
  const n = names(template, catalogs);
  const L = diagramLayout(sc);
  const x0 = PAD + (L.hasAny ? W * 0.6 + GX * 0.6 : 0);
  const box = (id) => ({ x: x0 + L.pos[id].col * (W + GX), y: PAD + L.pos[id].row * (H + GY) });
  const width = x0 + L.cols * (W + GX) - GX + PAD;
  const height = PAD * 2 + L.rows * (H + GY) - GY + 20;
  const root = svg('svg', { class: 'script-diagram', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `State diagram: ${sc.states.length} states, ${sc.reactions.length} reactions` });
  const defs = svg('defs');
  const marker = svg('marker', { id: 'sd-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'sd-arrowhead' }));
  defs.append(marker);
  root.append(defs);
  const anyBox = { x: PAD, y: PAD };
  if (L.hasAny) root.append(svg('rect', { x: anyBox.x, y: anyBox.y, width: W * 0.6, height: H, rx: 27, class: 'sd-any' }), svg('text', { x: anyBox.x + W * 0.3, y: anyBox.y + H / 2 + 4, 'text-anchor': 'middle', class: 'sd-any-text' }, 'Any state'));
  const pairCount = {};
  for (const e of L.edges) {
    const a = e.from === ANY ? { x: anyBox.x + W * 0.6, y: anyBox.y + H / 2 } : { x: box(e.from).x + W, y: box(e.from).y + H / 2 };
    const bb = box(e.to);
    const backward = e.from !== ANY && L.pos[e.to].col <= L.pos[e.from].col;
    const b = backward ? { x: bb.x + W / 2, y: bb.y + H } : { x: bb.x, y: bb.y + H / 2 };
    const k = `${e.from}>${e.to}`; const i = (pairCount[k] = (pairCount[k] || 0) + 1) - 1;
    const bend = backward ? 70 + i * 26 : (i % 2 ? 1 : -1) * (i ? 18 + i * 14 : 0);
    const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2 + bend;
    const g = clickable(svg('g', { class: 'sd-edge' }), `Edit reaction ${n.reaction(e.reactionId)}`, () => onReaction(e.reactionId));
    const label = short(triggerText(sc.reactions.find((r) => r.id === e.reactionId).when, n), 34);
    g.append(svg('path', { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, class: 'sd-line', 'marker-end': 'url(#sd-arrow)' }),
      svg('title', {}, n.reaction(e.reactionId)),
      svg('rect', { x: cx - label.length * 3.1 - 4, y: (a.y + b.y) / 2 + bend / 2 - 9, width: label.length * 6.2 + 8, height: 16, rx: 4, class: 'sd-label-bg' }),
      svg('text', { x: cx, y: (a.y + b.y) / 2 + bend / 2 + 3, 'text-anchor': 'middle', class: 'sd-label' }, label));
    root.append(g);
  }
  for (const s of sc.states) {
    const p = box(s.id);
    const g = clickable(svg('g', { class: `sd-state${s.id === sc.initialState ? ' sd-initial' : ''}${s.id === current ? ' sd-current' : ''}` }), `Edit state ${s.label}`, () => onState(s.id));
    g.append(svg('rect', { x: p.x, y: p.y, width: W, height: H, rx: 8 }),
      svg('text', { x: p.x + 10, y: p.y + 21, class: 'sd-state-label' }, short(s.label, 31)),
      svg('text', { x: p.x + 10, y: p.y + 40, class: 'sd-state-sub' }, short(Object.entries(s.vitals?.values || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || (s.id === sc.initialState ? 'start' : 'no vitals change'), 35)));
    root.append(g);
  }
  return h('div', { class: 'script-diagram-wrap' }, root,
    L.other.length ? h('p', { class: 'muted small' }, 'Reactions without a state change: ', ...L.other.flatMap((id, i) => [i ? ', ' : '', h('button', { class: 'btn-link', type: 'button', onclick: () => onReaction(id) }, n.reaction(id))])) : null);
}
