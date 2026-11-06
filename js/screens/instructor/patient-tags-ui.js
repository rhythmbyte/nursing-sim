// "Patient tags" chips (never the triage tag): one row per tag group, click a chip to add/remove it. Used by the
// patient editor (the patient's tags), the library (filter) and Sim setup (randomizer filter). With `data`, the
// instructor can add tags and groups; they're saved in this browser's copy of patient-tags.json (no reload).

import { h, clear } from '../shared/dom.js';
import { toast } from '../shared/toast.js';
import { saveLocalCatalog } from '../../data-loader.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/** value = { groupId: [tagIds] } (mutated in place). Returns { el, value() }. */
export function tagChips(catalog, value = {}, { onChange = () => {}, data = null, label = 'Patient tags' } = {}) {
  const cur = structuredClone(value || {});
  const box = h('div', { class: 'tag-chips', role: 'group', 'aria-label': label });
  function saveCatalog(next) {
    const errors = saveLocalCatalog('patientTags', next, data.schemas);
    if (errors.length) { toast(`Not saved: ${errors[0]}`, 5000); return false; }
    catalog.groups = next.groups; // same object the app uses, so other screens see it without a reload
    toast('Patient tags saved in this browser. Export data/catalogs/patient-tags.json to publish.', 4000);
    return true;
  }
  function render() {
    clear(box).append(...catalog.groups.map((g) => {
      const on = new Set(cur[g.id] || []);
      const add = data ? h('input', { class: 'input input-small', 'aria-label': `New tag in ${g.name}`, placeholder: '+ new tag' }) : null;
      return h('div', { class: 'tag-row' }, h('span', { class: 'tag-group' }, g.name),
        ...g.tags.map((t) => h('button', { type: 'button', class: `tag-chip${on.has(t.id) ? ' on' : ''}`, 'aria-pressed': on.has(t.id) ? 'true' : 'false',
          onclick: () => { on.has(t.id) ? on.delete(t.id) : on.add(t.id); cur[g.id] = [...on]; if (!cur[g.id].length) delete cur[g.id]; render(); onChange(cur); } }, `${on.has(t.id) ? '✓ ' : ''}${t.label}`)),
        add ? h('span', { class: 'pick-row' }, add, h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
          const lbl = add.value.trim(); const id = slug(lbl);
          if (!id || g.tags.some((t) => t.id === id)) { toast(id ? 'That tag already exists' : 'Type a tag name'); return; }
          const next = structuredClone({ ...catalog, groups: catalog.groups });
          next.groups.find((x) => x.id === g.id).tags.push({ id, label: lbl });
          if (saveCatalog(next)) render();
        } }, 'Add tag')) : null);
    }), data ? (() => {
      const name = h('input', { class: 'input input-small', 'aria-label': 'New tag group', placeholder: '+ new group (e.g. Course)' });
      return h('div', { class: 'tag-row' }, name, h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
        const nm = name.value.trim(); const id = slug(nm);
        if (!id || catalog.groups.some((x) => x.id === id)) { toast(id ? 'That group already exists' : 'Type a group name'); return; }
        if (saveCatalog({ ...structuredClone(catalog), groups: [...structuredClone(catalog.groups), { id, name: nm, tags: [] }] })) render();
      } }, 'Add group'));
    })() : '');
  }
  render();
  return { el: box, value: () => structuredClone(cur) };
}
