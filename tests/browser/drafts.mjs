// Browser suite: saving everything instantly. Builder editor draft survives a reload (before class). In a demo
// sim the student's handoff notes, a half-typed note and a half-filled O₂ form survive reloads; the chart section
// and scroll position come back; the Back button walks back through chart sections to the home screen and then
// asks before leaving the app (answered Cancel, so the page stays).
// Run with tests/browser/all.sh (or: node tests/browser/drafts.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, sleep, fail, reset, dialogs, answerDialogs, ignore, BASE } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // a visible page: scroll events need rendering
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 600, deviceScaleFactor: 1, mobile: false });
await reset('/');
const NAME = `[...document.querySelectorAll('label.field')].find(l=>l.textContent.startsWith('Name'))?.querySelector('input')`;

// Builder editor draft (the Builder is closed while a sim runs, so before the demo).
await click('.tab', 'Builder'); await sleep(300); await click('.subnav-btn', 'Patient editor'); await sleep(400);
await ev(`(() => { const i=${NAME}; i.value='Robert X'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()`); await sleep(1500);
await send('Page.reload'); await sleep(5000);
const ed = await ev(`${NAME}?.value`);
console.log('editor after reload:', ed, '|', await text('.draft-note'));
if (ed !== 'Robert X') fail(`editor draft lost after reload (${ed})`);
await ev(`document.querySelector('.draft-note button')?.click()`); await sleep(300);

await click('.tab', 'Instructor'); await sleep(300);
await click('button', 'Start demo sim'); await sleep(5000);
await click('.tab', 'Student 1'); await sleep(400);
await ev(`document.querySelector('.sp-open').click()`); await sleep(300);
await ev(`(() => { const b=document.querySelector('dialog textarea'); b.value='Pt anxious, recheck BP'; b.dispatchEvent(new Event("input",{bubbles:true})); return 1; })()`); await sleep(1500);
await send('Page.reload'); await sleep(5000);
const notes = await ev(`document.querySelector('dialog textarea')?.value`);
console.log('handoff notes after reload:', notes);
if (notes !== 'Pt anxious, recheck BP') fail('handoff notes lost after reload');
await click('dialog button', 'Close report'); await sleep(300);
await click('.chart-tab', 'Notes'); await sleep(200);
await ev(`(() => { const t=document.querySelector('textarea[aria-label="Nursing note"]'); t.value='Half-typed note'; t.dispatchEvent(new Event("input",{bubbles:true})); return 1; })()`); await sleep(1500);
await click('.chart-tab', 'Interventions'); await sleep(200);
await ev(`(() => { const s=document.querySelector('input[aria-label="Search interventions"]'); s.value='oxygen'; s.dispatchEvent(new Event('input')); return 1; })()`); await sleep(150);
await click('.pill-iv', 'Apply'); await sleep(150);
await ev(`(() => { const i=document.querySelector('form input[name="lpm"]'); i.value='3'; i.dispatchEvent(new Event("input",{bubbles:true})); return 1; })()`); await sleep(1500);
await ev(`window.scrollTo(0, 400)`); await sleep(600);
await send('Page.reload'); await sleep(5000);
const section = await text('.chart-tab.active');
const lpm = await ev(`document.querySelector('form input[name="lpm"]')?.value`);
const y = await ev('window.scrollY');
console.log('after reload: section', section, '| lpm', lpm, '| draft note:', await text('.draft-note'), '| scrollY', y);
if (section !== 'Interventions' || lpm !== '3') fail('chart section or half-filled O₂ form not restored');
if (!(y > 100)) fail(`scroll position not restored (${y})`);
await click('.chart-tab', 'Notes'); await sleep(200);
const note = await ev(`document.querySelector('textarea[aria-label="Nursing note"]').value`);
console.log('note draft:', note);
if (note !== 'Half-typed note') fail('note draft lost');

// Back button: chart sections, then the home screen, then "leave the app?" (Cancel keeps the page).
await ev(`history.back()`); await sleep(400);
console.log('back → section:', await text('.chart-tab.active'));
for (let i = 0; i < 8 && await ev(`!!document.querySelector('.chart-tab')`); i++) { await ev(`history.back()`); await sleep(400); }
console.log('back to home:', await text('.screen-header h2'));
if (await ev(`!!document.querySelector('.chart-tab')`)) fail('Back did not return to the student home');
answerDialogs(false);
for (let i = 0; i < 5; i++) { await ev(`history.back()`); await sleep(400); }
const href = await ev('location.href');
console.log('leave-app dialogs:', JSON.stringify(dialogs), '| still here:', href);
if (!href?.startsWith(BASE)) fail('Back left the app');
ignore(/Saved session discarded/);
sock.close();
