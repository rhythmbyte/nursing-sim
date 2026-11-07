// Browser suite: Instructor Home. The Instructor tab opens on Home (Run a sim / Build / Review). Create a patient and
// Edit patients open the Builder at the right place, whose Home button comes back. Saved sims: Edit (the wizard filled
// in), Duplicate, Rename, Delete. Start a saved sim → Ready, and Home offers Resume. During the running sim Home is only
// in the Overview's Menu (with a confirm), and Resume returns. After End, Past debriefs lists the sim and Open shows its
// debrief; Recent lists the sim and the debrief.
// Run with tests/browser/all.sh (or: node tests/browser/home.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, shot, sleep, fail, reset, dialogs } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
await reset('/');
const homeIs = async (label) => { const t = await text('.nav-title'); if (t !== label) fail(`expected to be on ${label}, got ${t}`); return t; };

// Home.
console.log('landing:', await homeIs('Home'), '| groups:', await text('.home-group > h3'));
console.log('cards:', await text('.home-card strong'));
for (const c of ['Start a saved sim', 'Generate a sim', 'Custom setup', 'Create a patient', 'Edit patients', 'Create a sim', 'Edit saved sims', 'Past debriefs', 'Review queue']) if (!(await text('.home-card strong')).includes(c)) fail(`Home is missing "${c}"`);
if ((await text('.home-card strong')).includes('Resume')) fail('Resume shown with no sim in progress');
let u = await unl(); if (u !== 'none') fail(`unlabeled controls (home): ${u}`);
await shot('home');

// Build → the Builder at the right place; its Home button comes back.
await click('.home-card', 'Create a patient'); await sleep(800);
console.log('create a patient →', await text('.tab.active'), '/', await text('.subnav-btn.active'), '|', await text('.screen-header .badge'));
if ((await text('.subnav-btn.active')) !== 'Patient editor' || !/New, not saved/.test(await text('.screen-header .badge'))) fail('Create a patient did not open a new patient in the editor');
await click('.nav-home', '⌂ Home'); await sleep(600);
if ((await text('.tab.active')) !== 'Instructor') fail('the Builder Home button did not go to the Instructor tab');
await homeIs('Home');
await click('.home-card', 'Edit patients'); await sleep(800);
console.log('edit patients →', await text('.subnav-btn.active'));
if ((await text('.subnav-btn.active')) !== 'Patient library') fail('Edit patients did not open the patient library');
await click('.nav-home', '⌂ Home'); await sleep(600);

// Saved sims: duplicate, rename, delete, edit.
await click('.home-card', 'Edit saved sims'); await sleep(1500);
const count = () => ev(`document.querySelectorAll('.sim-card').length`);
const before = await count();
await ev(`[...document.querySelector('.sim-card').querySelectorAll('button')].find(b=>b.textContent==='Duplicate').click()`); await sleep(3500);
const dup = await ev(`[...document.querySelectorAll('.sim-card h3')].map(x=>x.textContent).find(t=>t.endsWith('(copy)'))`);
console.log('duplicate:', before, '→', await count(), dup);
if (await count() !== before + 1 || !dup) fail('Duplicate did not add a copy');
const card = (name) => `[...document.querySelectorAll('.sim-card')].find(c=>c.querySelector('h3').textContent===${JSON.stringify(name)})`;
await ev(`[...${card(dup)}.querySelectorAll('button')].find(b=>b.textContent==='Rename').click()`); await sleep(400);
await ev(`(() => { const i=document.querySelector('dialog input'); i.value='Thursday lab'; i.dispatchEvent(new Event('input',{bubbles:true})); [...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Rename').click(); })()`); await sleep(3500);
console.log('renamed:', await ev(`!!${card('Thursday lab')}`));
if (!(await ev(`!!${card('Thursday lab')}`))) fail('Rename did not rename the sim');
await ev(`[...${card('Thursday lab')}.querySelectorAll('button')].find(b=>b.textContent==='Edit').click()`); await sleep(1200);
const editing = await text('.wizard .screen-header h3');
console.log('edit →', editing, '| step:', await text('.wizard-steps .current'));
if (editing !== 'Editing: Thursday lab') fail(`Edit should open the wizard on the sim (${editing})`);
await click('.nav-home', '⌂ Home'); await sleep(400);
await click('.home-card', 'Edit saved sims'); await sleep(1500);
await ev(`[...${card('Thursday lab')}.querySelectorAll('button')].find(b=>b.textContent==='Delete').click()`); await sleep(3500);
console.log('deleted:', !(await ev(`!!${card('Thursday lab')}`)), '| asked first:', dialogs.some((d) => /Delete "Thursday lab"/.test(d)));
if (await ev(`!!${card('Thursday lab')}`)) fail('Delete did not remove the sim');
if (!dialogs.some((d) => /Delete "Thursday lab"/.test(d))) fail('Delete did not ask first');

// Start a saved sim → Ready; Home offers Resume.
await ev(`document.querySelector('.sim-card .btn-primary').click()`); await sleep(5000);
await homeIs('Ready');
await click('.nav-home', '⌂ Home'); await sleep(400);
const resume = await text('.home-primary strong');
console.log('home while ready:', resume);
if (!/^Resume/.test(resume)) fail('no Resume for the sim waiting to start');
await click('.home-card', 'Resume'); await sleep(500);
await homeIs('Ready');
await click('button', 'Start sim'); await sleep(1500);
await homeIs('Overview');
const homeBtn = await ev(`!!document.querySelector('.top-nav .nav-home')`);
console.log('running: Home button in the top bar?', homeBtn, '| menu:', await text('.overview-menu-list button'));
if (homeBtn) fail('Home should be behind the Overview menu while the sim runs');
await ev(`document.querySelector('.overview-menu').open = true`); await sleep(200);
const asked = dialogs.length;
await click('.overview-menu-list button', '⌂ Home'); await sleep(600);
console.log('menu → Home asked first:', dialogs.length > asked, '|', await text('.nav-title'), '| resume:', await text('.home-primary strong'));
if (dialogs.length === asked) fail('Home from the Overview menu did not ask first');
await homeIs('Home');
if ((await ev(`[...document.querySelectorAll('.home-card')].find(c=>c.textContent.startsWith('Create a patient'))?.disabled`)) !== true) fail('Create a patient should be disabled while a sim runs (the Builder is closed)');
await click('.home-card', 'Resume'); await sleep(600);
await homeIs('Overview');

// End → debrief; Past debriefs keeps it; Recent lists it.
await click('button', 'End sim'); await sleep(3500);
await homeIs('Debrief');
await click('.nav-home', '⌂ Home'); await sleep(400);
await click('.home-card', 'Past debriefs'); await sleep(500);
const rows = await text('.data-table tbody tr td:first-child');
console.log('past debriefs:', rows);
if (!rows) fail('the finished sim is not in Past debriefs');
await ev(`document.querySelector('.data-table tbody .btn-primary').click()`); await sleep(1500);
const sum = await ev(`document.querySelectorAll('.sum-card').length`);
console.log('opened: summary cards', sum, '|', await text('.debrief-summary h2'));
if (!sum) fail('Open did not show the past debrief');
u = await unl(); if (u !== 'none') fail(`unlabeled controls (past debrief): ${u}`);
await click('.nav-home', '⌂ Home'); await sleep(400);
const recent = await text('.home-recent li');
console.log('recent:', recent.slice(0, 200));
if (!/Set up/.test(recent) || !/Debrief/.test(recent)) fail('Recent should list the sim and the debrief');
sock.close();
