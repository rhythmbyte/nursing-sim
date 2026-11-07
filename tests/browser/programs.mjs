// Browser suite: program profiles. First visit asks "Which program do you teach?"; choosing LPN limits the wizard to
// LPN cases, the LPN assessment tools and CNA helpers, hides the charge-nurse choice where the program has none, and
// the Builder library to LPN cases (with "every program" to see all). Switching to RN from the header brings them back.
// Run with tests/browser/all.sh (or: node tests/browser/programs.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, shot, sleep, fail, BASE } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `${BASE}/` }); await sleep(2000);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true")');
await send('Page.reload'); await sleep(5000);

const q = await text('.program-picker h2');
console.log('first visit:', q, '| cards:', await text('.program-card h3'));
if (!/Which program/.test(q)) fail('no program picker on the first visit');
await shot('program-picker');
await click('.program-card', 'LPN'); await sleep(4000);
await click('.mode-btn', 'Build step by step'); await sleep(400); // Setup opens on the sim library
console.log('header program:', await ev(`document.querySelector('select[aria-label="Program"]')?.selectedOptions[0]?.text`), '| phase:', await text('.phase-btn.active'));
const counts = async () => {
  for (let i = 0; i < 2; i++) { await click('button', 'Next'); await sleep(250); }
  const cases = await ev(`[...document.querySelectorAll('.wizard section.panel:not([hidden]) .pick-row label.inline:first-child')].length`);
  for (let i = 0; i < 2; i++) { await click('button', 'Next'); await sleep(250); }
  const tools = await ev(`document.querySelectorAll('input[aria-label^="Offer "]').length`);
  const roles = await ev(`[...document.querySelectorAll('input[aria-label$=" helpers"]')].map(i=>i.getAttribute('aria-label').split(' ').slice(-2,-1)[0]).join(',')`);
  const charge = await ev(`[...document.querySelectorAll('.wizard section.panel:not([hidden]) label.field span')].some(s=>s.textContent.startsWith('Charge nurse'))`);
  for (let i = 0; i < 4; i++) { await click('button', '← Back'); await sleep(150); }
  return { cases, tools, roles, charge };
};
const lpn = await counts();
console.log('LPN wizard:', JSON.stringify(lpn));
if (!(lpn.cases >= 1 && lpn.cases < 6)) fail(`LPN should offer only LPN cases (${lpn.cases})`);
if (lpn.tools !== 6) fail(`LPN should offer 6 assessment tools (${lpn.tools})`);
if (lpn.roles !== 'CNA') fail(`LPN helpers should be CNA only (${lpn.roles})`);
await click('.tab', 'Builder'); await sleep(300); await click('.subnav-btn', 'Patient library'); await sleep(400);
const libLpn = await ev(`document.querySelectorAll('.patient-card').length`);
await ev(`document.querySelector('details.panel').open=true`);
await ev(`[...document.querySelectorAll('label.inline')].find(l=>l.textContent.includes('every program')).querySelector('input').click()`); await sleep(300);
const libAll = await ev(`document.querySelectorAll('.patient-card').length`);
console.log('library: LPN', libLpn, '| every program', libAll);
if (!(libLpn < libAll && libAll === 6)) fail('library program filter');
await ev(`[...document.querySelectorAll('label.inline')].find(l=>l.textContent.includes('every program')).querySelector('input').click()`); await sleep(200);
// Switch to RN from the header.
await ev(`(() => { const s=document.querySelector('select[aria-label="Program"]'); s.value='rn'; s.dispatchEvent(new Event('change')); })()`); await sleep(4000);
await click('.tab', 'Instructor'); await sleep(400);
const rn = await counts();
console.log('RN wizard:', JSON.stringify(rn));
if (lpn.charge) fail('LPN has no charge-nurse choice in its program, but setup shows one');
if (rn.cases !== 6 || rn.roles.split(',').sort().join() !== 'CNA,LPN' || !rn.charge) fail('RN should offer every case, CNA and LPN helpers, and the charge nurse choice');
// Presets: step 5 starts with "Choose a preset"; Beginner fills in its settings under Customize; Review names it.
for (let i = 0; i < 4; i++) { await click('button', 'Next'); await sleep(250); }
console.log('presets:', await ev(`[...document.querySelector('select[aria-label="Preset"]').options].map(o=>o.text).join(', ')`));
await ev(`(() => { const s=document.querySelector('select[aria-label="Preset"]'); s.value='beginner'; s.dispatchEvent(new Event('change')); })()`); await sleep(300);
const handoff = await ev(`[...document.querySelectorAll('.customize select')].find(s=>[...s.options].some(o=>o.value==='always'))?.value`);
console.log('beginner → handoff', handoff, '| customize closed by default:', await ev(`!document.querySelector('.customize').open`), '|', await text('.preset-desc'));
if (handoff !== 'always') fail('choosing the Beginner preset did not set its handoff mode');
await click('button', 'Next'); await sleep(300);
const review = await text('.review-list');
console.log('review:', review.slice(0, 200));
if (!/Preset: Beginner/.test(review)) fail('Review does not name the preset');
const u = await unl(); console.log('unlabeled', u); if (u !== 'none') fail(`unlabeled controls: ${u}`);
sock.close();
