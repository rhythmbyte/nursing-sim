// Call-light sound for one student tab: beep when a light comes on for one of the student's patients,
// then a gentle repeat while any stays unanswered. On/off is remembered per student (storage.js).
// Timing/tones are data (data/catalogs/ui.json callLightSound).

import { h } from '../shared/dom.js';
import { beep } from '../shared/sound.js';
import { load, save } from '../../storage.js';

/** Pure: ids of lit lights for a group, and which are new compared with `prev`. */
export function litLights(state, groupId, prev = new Set()) {
  const lit = new Set(Object.entries(state.patients).filter(([, ps]) => ps.present && ps.groupId === groupId && ps.callLight).map(([pid, ps]) => `${pid}@${ps.callLight.since}`));
  return { lit, fresh: [...lit].filter((k) => !prev.has(k)) };
}

export function createCallLightSound({ store, runner, user, groupId, config = {} }) {
  const KEY = `ui.${user.userId}.callLightSound`;
  let on = load(KEY, true) !== false;
  let prev = litLights(runner.state, groupId).lit;
  const buttons = new Set();
  const label = () => (on ? '🔔 Call-light sound on' : '🔕 Call-light sound off');

  const off = store.subscribe(() => {
    const { lit, fresh } = litLights(runner.state, groupId, prev);
    prev = lit;
    if (on && fresh.length) beep({ freq: config.freq || 660, ms: 220, volume: 0.08 });
  });
  const timer = setInterval(() => {
    if (on && prev.size && runner.state.clock.status === 'running') beep({ freq: config.repeatFreq || 520, ms: 160, volume: 0.04 });
  }, (config.repeatSec || 30) * 1000);

  return {
    toggle() {
      const b = h('button', { class: 'btn btn-small', type: 'button', 'aria-pressed': String(on), onclick: () => {
        on = !on; save(KEY, on);
        for (const x of buttons) { x.textContent = label(); x.setAttribute('aria-pressed', String(on)); }
      } }, label());
      buttons.add(b);
      return b;
    },
    destroy() { off(); clearInterval(timer); buttons.clear(); },
  };
}
