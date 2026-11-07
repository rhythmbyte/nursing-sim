// Browser suite: patient tags. Builder → Patient library filter (LPN) and search; Patient editor tag chips (toggle,
// add a new tag to a group, save); setup wizard → Patients → "Random by patient tags": the match counts change
// when the randomizer is limited to LPN patients, with a warning when there aren't enough.
// Run with tests/browser/all.sh (or: node tests/browser/patient-tags.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, shot, sleep, fail, reset } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
await reset('/');

await click('.tab', 'Builder'); await sleep(300); await click('.subnav-btn', 'Patient library'); await sleep(400);
await ev(`document.querySelector('details.panel').open=true`);
await click('.tag-chip', 'LPN'); await sleep(300);
const lpn = await text('details.panel summary .muted');
console.log('library LPN:', lpn);
if (!/^2 of 6/.test(lpn)) fail(`LPN filter should match 2 of 6: ${lpn}`);
await ev(`(() => { const s=document.querySelector('input[aria-label="Search patients"]'); s.value='knee'; s.dispatchEvent(new Event('input')); return 1; })()`); await sleep(200);
console.log('search knee:', await text('details.panel summary .muted'));
await click('.tag-chip', '✓ LPN'); await sleep(200); // filter off again (it's remembered; an active chip reads "✓ LPN")

await click('.subnav-btn', 'Patient editor'); await sleep(400);
console.log('editor tags on:', await ev(`[...document.querySelectorAll('.tag-chip.on')].map(c=>c.textContent).join(', ')`));
await click('.tag-chip', 'ICU'); await sleep(150);
await ev(`(() => { const i=document.querySelector('input[aria-label="New tag in Topic"]'); i.value='Diabetes'; return 1; })()`);
await ev(`[...document.querySelectorAll('.tag-row')].find(r=>r.textContent.startsWith('Topic')).querySelector('button.btn').click()`); await sleep(300);
const added = await ev(`[...document.querySelectorAll('.tag-chip')].some(c=>c.textContent==='Diabetes')`);
const icu = await ev(`[...document.querySelectorAll('.tag-chip.on')].some(c=>c.textContent.includes('ICU'))`);
console.log('new tag chip:', added, '| ICU still on:', icu);
if (!added || !icu) fail('adding a tag lost the chip or the ICU selection');
await ev(`[...document.querySelectorAll('.controls button')].find(b=>b.textContent==='Save').click()`); await sleep(2500);
const badge = await text('.screen-header .badge');
console.log('saved:', badge);
if (!/Edited in this browser/.test(badge)) fail(`patient not saved: ${badge}`);

// Setup wizard → Patients → random by patient tags.
await click('.tab', 'Instructor'); await sleep(400);
await click('.home-card', 'Custom setup'); await sleep(400); // the Instructor tab opens on Home
await click('button', 'Next'); await sleep(250); await click('button', 'Next'); await sleep(250);
await ev(`(() => { const sel=[...document.querySelectorAll('.wizard select')].find(s=>[...s.options].some(o=>o.value==='tags')); sel.value='tags'; sel.dispatchEvent(new Event('change')); return 1; })()`); await sleep(300);
const before = await text('.wizard section.panel:not([hidden]) .tag-count');
console.log('counts before:', before);
const randomizer = `[...document.querySelectorAll('.wizard h4')].find(h=>h.textContent.startsWith('Patient tags for')).parentElement`;
await ev(`[...${randomizer}.querySelectorAll('.tag-row')].find(r=>r.textContent.startsWith('License')).querySelectorAll('.tag-chip')[0].click()`); await sleep(300);
const after = await text('.wizard section.panel:not([hidden]) .tag-count');
const warn = await text('.wizard section.panel:not([hidden]) .form-error[role=status]');
console.log('LPN only:', after, '| warn:', warn);
if (before === after) fail('randomizer counts did not change with the LPN tag');
if (!/Not enough matching patients/.test(warn)) fail('no "not enough patients" warning for LPN-only red patients');
await shot('setup-tags');
const u = await unl(); console.log('unlabeled', u); if (u !== 'none') fail(`unlabeled controls: ${u}`);
sock.close();
