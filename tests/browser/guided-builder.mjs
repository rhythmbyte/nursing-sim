// Browser suite: guided event builder. Builder → Patient editor → Linda: baseline rhythm and O₂ dropdowns; a new
// scenario change at 09:30 with a vitals row ("From" auto-filled, readable preview) and a code event; edit a
// reaction and a state through the same form; save the patient. Then in a running sim, the Overview drawer's
// Add event sends a family message to Linda.
// Run with tests/browser/all.sh (or: node tests/browser/guided-builder.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, shot, sleep, fail, reset } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
await reset('/');

// ---- Builder (before class)
await click('.tab', 'Builder'); await sleep(300); await click('.subnav-btn', 'Patient editor'); await sleep(400);
await setSel('select[aria-label="Patient"]', 'p4-linda-garcia'); await sleep(500);
const rhythm = await ev(`document.querySelector('select[aria-label="v_rhythm"]')?.value`);
console.log('baseline rhythm select:', rhythm, '| o2:', await ev(`document.querySelector('select[aria-label="Baseline O₂ device"]')?.value + ' ' + document.querySelector('input[aria-label="Baseline O₂ L/min"]')?.value`));
if (rhythm !== 'sinus-tach') fail(`baseline rhythm dropdown shows ${rhythm}`);
await click('button', 'Add scenario change'); await sleep(500);
await ev(`(() => { const t=document.querySelector('dialog input[type=time]'); t.value='09:30'; t.dispatchEvent(new Event('change')); return 1; })()`); await sleep(300);
console.log('event types:', await ev(`[...document.querySelector('dialog select[aria-label="Event type"]').options].map(o=>o.text).join(', ')`));
await setSel('dialog select[aria-label="Event type"]', 'vitals'); await sleep(300);
const from = await ev(`document.querySelector('dialog input[aria-label="Row 1 from"]').value`);
console.log('From auto at 09:30:', from, '| hint:', await text('dialog .guided-row .muted.small'));
if (!from) fail('"From" not auto-filled for the vitals row');
await ev(`(() => { const i=document.querySelector('dialog input[aria-label="Row 1 to"]'); i.value='80'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()`); await sleep(200);
const preview = await text('dialog .guided-preview');
console.log('row preview:', preview);
if (!/to 80/.test(preview)) fail(`row preview doesn't read back the value: ${preview}`);
await click('dialog button', 'Add event'); await sleep(200);
await ev(`(() => { const s=[...document.querySelectorAll('dialog select[aria-label="Event type"]')].at(-1); s.value='code'; s.dispatchEvent(new Event('change')); return 1; })()`); await sleep(200);
console.log('code fields:', await ev(`[...[...document.querySelectorAll('dialog .guided-event')].at(-1).querySelectorAll('select')].map(s=>s.getAttribute('aria-label')+':'+s.options.length).join(', ')`));
await ev(`(() => { const e=[...document.querySelectorAll('dialog .guided-event')].at(-1); const a=e.querySelector('select[aria-label="Arrest rhythm"]'); a.value='vf'; a.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()`);
await shot('guided-change');
await click('dialog button', 'Save change'); await sleep(400);
const list = await ev(`[...document.querySelectorAll('.change-list li')].map(l=>l.textContent.slice(0,40)).join(' || ')`);
console.log('saved?', await ev(`!document.querySelector('dialog[open]')`), '| list:', list);
if (!/09:30/.test(list)) fail('the 09:30 scenario change is not in the list');
const sec = `[...document.querySelectorAll('section.panel')].find(p=>p.querySelector('h3')?.textContent.startsWith('Reactive script'))`;
await ev(`[...${sec}.querySelectorAll('tr')].find(r=>r.textContent.includes('No O₂ within 5 min'))?.querySelector('button').click()`); await sleep(400);
console.log('reaction then:', await text('dialog .guided-summary'));
await click('dialog button', 'Save reaction'); await sleep(300);
if (!(await ev(`!document.querySelector('dialog[open]')`))) fail(`reaction didn't save: ${await text('dialog .form-error')}`);
await ev(`[...${sec}.querySelectorAll('tr')].find(r=>r.textContent.includes('Hypoxic (SpO'))?.querySelector('button').click()`); await sleep(400);
console.log('state events:', await text('dialog .guided-summary'));
await click('dialog button', 'Save state'); await sleep(300);
if (!(await ev(`!document.querySelector('dialog[open]')`))) fail(`state didn't save: ${await text('dialog .form-error')}`);
const u = await unl(); console.log('editor unlabeled:', u); if (u !== 'none') fail(`unlabeled controls: ${u}`);
await ev(`[...document.querySelectorAll('.controls button')].find(b=>b.textContent==='Save').click()`); await sleep(2500);
const badge = await text('.screen-header .badge');
console.log('patient saved:', badge);
if (!/Edited in this browser/.test(badge)) fail(`patient not saved: ${badge}`);

// ---- Running sim: Overview drawer → Add event
await click('.tab', 'Instructor'); await sleep(300);
await click('button', 'Start demo sim'); await sleep(5000);
await ev(`[...document.querySelectorAll('.cc-patient')].find(b=>/\\(S1\\)/.test(b.textContent)).click()`); await sleep(600);
await click('.drawer button', 'Add event'); await sleep(400);
await setSel('dialog select[aria-label="Event type"]', 'staff-message'); await sleep(200);
await ev(`(() => { const f=document.querySelector('dialog select[aria-label="From"]'); f.value='Family'; f.dispatchEvent(new Event('change',{bubbles:true})); const m=document.querySelector('dialog textarea, dialog input[aria-label="Message"]'); m.value='She seems more confused'; m.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()`); await sleep(200);
console.log('live preview:', await text('dialog .guided-summary'));
await click('dialog button', 'Apply now'); await sleep(600);
const logged = await ev(`JSON.parse(localStorage.getItem('nursing-sim:session')).log.some(l => JSON.stringify(l.details||{}).includes('She seems more confused'))`);
console.log('message in the sim log:', logged);
if (!logged) fail('the live staff message was not applied');
const u2 = await unl(); console.log('overview unlabeled:', u2); if (u2 !== 'none') fail(`unlabeled controls: ${u2}`);
sock.close();
