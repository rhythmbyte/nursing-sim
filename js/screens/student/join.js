// Student tab: "Join sim" (code + name) until the student is on the roster, then their home.
// Prototype: each tab stands in for one student's device.

import { h, clear } from '../shared/dom.js';
import { mountStudentHome } from './home.js';
import { createCallLightSound } from './call-light-sound.js';
import { createWakeLock } from '../shared/wake-lock.js';
import { load, save } from '../../storage.js';

// Rejoin (SPEC §10): this device remembers who it is (device.<tab>) and a rejoin token per join code and name.
const norm = (s) => String(s || '').trim().toLowerCase();
const tokenKey = (code, name) => `rejoin.${code}.${norm(name)}`;

export function mountStudentTab(root, ctx) {
  const { store, runner } = ctx;
  const DEVICE = `device.${ctx.user.userId}`;
  let me = load(DEVICE) || ctx.user.userId; // a rejoin from this tab can make it act as an earlier identity
  let user = { ...ctx.user, userId: me };
  let cleanup = null;
  let joined = null;
  let waiting = null; // { name } while the instructor confirms a rejoin
  const become = (id) => { me = id; save(DEVICE, id); user = { ...ctx.user, userId: id }; joined = null; render(); };

  function render() {
    // An approved rejoin request for this tab: switch to that student.
    const ok = (runner.state.rejoinRequests || []).find((q) => q.fromUserId === me && q.status === 'approved' && !runner.state.roster[me]);
    if (ok) { become(ok.userId); return; }
    const entry = runner.state.roster[user.userId];
    if (entry && joined) return;
    if (cleanup) cleanup();
    cleanup = null;
    if (entry) {
      joined = entry;
      const sound = createCallLightSound({ store, runner, user, groupId: entry.groupId, config: ctx.catalogs.ui?.callLightSound });
      const stopHome = mountStudentHome(clear(root), { ...ctx, user: { ...user, name: entry.name }, groupId: entry.groupId, sound });
      cleanup = () => { stopHome(); sound.destroy(); };
      return;
    }
    joined = null;
    const code = h('input', { class: 'input', name: 'code', autocomplete: 'off', placeholder: 'e.g. K7Q2ZP', 'aria-label': 'Join code' });
    const name = h('input', { class: 'input', name: 'name', autocomplete: 'name', 'aria-label': 'Your name' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    clear(root).append(h('section', { class: 'panel join-panel' },
      h('h2', {}, 'Join sim'),
      h('p', { class: 'muted' }, 'Enter the code your instructor shows and your name. Back after a reload or on another device? Enter the same name to rejoin.'),
      waiting ? h('p', { class: 'banner', role: 'status' }, `Waiting for your instructor to confirm it's you, ${waiting.name}…`) : null,
      h('form', {
        class: 'iv-form',
        onsubmit: (e) => {
          e.preventDefault();
          const c = code.value.trim().toUpperCase();
          const error = runner.join(user.userId, name.value, code.value, load(tokenKey(c, name.value))?.token || null);
          const r = runner.lastJoin() || {};
          if (r.token && !r.rejoinAs) save(tokenKey(c, name.value), { userId: user.userId, token: r.token });
          if (r.rejoinAs && r.rejoinAs !== user.userId) { become(r.rejoinAs); return; }
          if (r.pending) { waiting = { name: name.value.trim() }; render(); return; } // the join re-rendered the form; show the wait
          err.textContent = error || '';
        },
      },
        h('label', { class: 'field' }, h('span', {}, 'Join code'), code),
        h('label', { class: 'field' }, h('span', {}, 'Your name'), name),
        err,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Join'),
      ),
    ));
  }

  // Screen stays awake while the sim runs (released on pause, break or end).
  const wake = createWakeLock(() => runner.state.clock.status === 'running');
  render();
  const off = store.subscribe(() => { render(); wake.update(); });
  return () => { off(); wake.destroy(); if (cleanup) cleanup(); };
}
