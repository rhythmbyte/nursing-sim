// Browser suite: ready-to-run sims. Setup opens on the sim library (the starter sim with its readiness and reasons);
// Generate a sim (3 students × 2 patients, Standard, Beginner preset) shows a one-screen summary with readiness, then
// "Save to library and start" goes to the Ready screen; the library lists it and Start → Start sim runs it in two
// clicks. The Builder library shows Ready / Needs work per case with the reasons.
// Run with tests/browser/all.sh (or: node tests/browser/library-generate.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, shot, sleep, fail, reset } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
await reset('/');

const mode = await text('.mode-btn.active');
await sleep(1500); // readiness fills in after the page shows
const starter = await text('.sim-card');
console.log('setup opens on:', mode, '| starter sim:', starter.slice(0, 220));
if (mode !== 'Sim library') fail('Setup should open on the sim library');
if (!/Needs work|Ready/.test(starter)) fail('no readiness badge on the starter sim');
if (/Needs work/.test(starter) && !/James Carter|draft|tool/.test(starter)) fail('Needs work without a reason');
let u = await unl(); if (u !== 'none') fail(`unlabeled controls (library): ${u}`);

await click('.mode-btn', 'Generate a sim'); await sleep(400);
const set = (label, v) => ev(`(() => { const e=document.querySelector('[aria-label="${label}"]'); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('change',{bubbles:true})); return e.value; })()`);
await set('Students', '3'); await set('Patients per student', '2'); await set('Difficulty', 'standard'); await set('Preset', 'beginner');
await click('.panel .controls button', 'Generate'); await sleep(1500);
const groups = await ev(`document.querySelectorAll('.gen-summary tbody tr').length`);
const badge = await text('.gen-summary .readiness .badge');
console.log('generated:', await text('.gen-summary h3'), '| groups', groups, '| readiness', badge, '| warnings', await text('.gen-summary .case-warnings li'));
if (groups !== 3) fail(`expected 3 groups, got ${groups}`);
if (!badge) fail('no readiness on the generated sim');
u = await unl(); if (u !== 'none') fail(`unlabeled controls (generate): ${u}`);
await shot('generate-summary');
const genName = await text('.gen-summary h3');
await click('.gen-summary button', 'Save to library and start'); await sleep(5000);
const ready = await text('.ready h2');
console.log('after start:', ready, '| code', await text('.join-code-big .code'));
if (!ready.includes(genName)) fail('Save to library and start did not open the Ready screen for the generated sim');

// Back to setup: the library lists it; Start → Start sim (two clicks).
await click('button', 'Change setup'); await sleep(800);
await click('.mode-btn', 'Sim library'); await sleep(1500);
const card = await ev(`[...document.querySelectorAll('.sim-card')].find(c => c.querySelector('h3').textContent === ${JSON.stringify(genName)})?.textContent`);
console.log('in library:', (card || 'missing').slice(0, 200));
if (!card) fail('the generated sim is not in the library');
await ev(`[...document.querySelectorAll('.sim-card')].find(c => c.querySelector('h3').textContent === ${JSON.stringify(genName)}).querySelector('.btn-primary').click()`); await sleep(5000);
await click('button', 'Start sim'); await sleep(1500);
const phase = await text('.phase-btn.active');
const cards = await ev(`document.querySelectorAll('.cc-card').length`);
console.log('two clicks later:', phase, '| group cards', cards);
if (phase !== '2. Overview' || cards < 3) fail('Start → Start sim did not run the sim');
await ev(`window.confirm = () => true`); await click('button', 'End sim'); await sleep(1500);

// Builder: case readiness on every card, reasons in the detail.
await click('.tab', 'Builder'); await sleep(300); await click('.subnav-btn', 'Patient library'); await sleep(2500);
const badges = await text('.card-ready');
console.log('case readiness:', badges, '| detail:', (await text('.case-readiness')).slice(0, 160));
if ((badges.match(/Ready|Needs work/g) || []).length !== 6) fail('not every case shows its readiness');
sock.close();
