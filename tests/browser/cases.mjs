// Browser suite: Case templates: Ready screen with codes, Reroll (session follows), reload keeps patients, Lock variant, the demo as written, students never see codes or placeholders, Overview and debrief labels, editor warnings and Check variants, library groups.
// Run with tests/browser/all.sh (or: node tests/browser/cases.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(1500);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn"))'); await send('Page.reload'); await sleep(5000);
// 1. Run the saved starter as is → Ready: cases panel with codes; nothing unfilled.
await click('.home-card', 'Custom setup'); await sleep(400); // the Instructor tab opens on Home
await ev(`(() => { const s=document.querySelector('select[aria-label="Start from"]'); s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await click('button', 'Run the saved scenario'); await sleep(4000);
const casesRows = () => text('.ready tbody td:nth-child(2)');
console.log('ready rows:', (await casesRows()).slice(0, 200));
console.log('braces on Ready:', await braces());
// 2. Reroll the first patient before start; session vitals follow.
const before = await ev(`window.__nursingSim.runner.templates()['p1-robert-miller'].demographics.name`);
await ev(`document.querySelector('.ready tbody tr button').click()`); await sleep(4000);
const after = await ev(`window.__nursingSim.runner.templates()['p1-robert-miller'].demographics.name`);
console.log('reroll:', before, '→', after, '| session vitals follow:', await ev(`(() => { const r = window.__nursingSim.runner; return r.state.patients['p1-robert-miller'].vitals.bp + ' vs ' + r.templates()['p1-robert-miller'].vitals.baseline.bp; })()`), '| still Ready:', await text('.ready h2'));
// 3. Reload: same patients.
await send('Page.reload'); await sleep(5000);
console.log('after reload:', await ev(`window.__nursingSim.runner.templates()['p1-robert-miller'].demographics.name`));
// 4. Lock it.
await click('.ready tbody tr:first-child button', 'Lock variant'); await sleep(4000);
console.log('locked:', await ev(`JSON.parse(localStorage.getItem('nursing-sim:library.patients') || '{}')['p1-robert-miller']?.case?.locked?.[0]?.label`));
// 5. Start demo sim: cases as written, except the locked one.
await click('button', 'Start demo sim'); await sleep(5000);
console.log('demo names:', await ev(`Object.values(window.__nursingSim.runner.templates()).filter(t=>t.instance).map(t=>t.demographics.name).join(', ')`));
// 6. Student view: no codes, titles or braces.
await click('.tab', 'Student 1'); await sleep(1200);
console.log('student braces:', await braces(), '| student sees case title or code?', await ev(`/Cardiac 1|Sepsis 1|Neuro 1|\\(C1\\)|\\(S1\\)/.test(document.body.innerText)`));
await ev(`document.querySelector('.sp-open')?.click()`); await sleep(400);
console.log('handoff:', (await text('dialog')).slice(0, 200));
await click('dialog button', 'Close'); await sleep(200);
// 7. Overview and debrief labels.
await click('.tab', 'Instructor'); await sleep(600);
console.log('overview rooms:', await text('.cc-room'));
await click('.phase-btn', 'Debrief'); await sleep(800); await click('.sum-card .btn', 'Full breakdown'); await sleep(1000);
console.log('debrief cases:', await text('.debrief-cases li'));
await ev(`window.confirm = () => true`); await click('.phase-btn', 'Overview'); await sleep(500); await click('button', 'End sim'); await sleep(1500);
// 8. Builder editor: case section, warnings, check variants.
await click('.tab', 'Builder'); await sleep(500); await click('.subnav-btn', 'Patient editor'); await sleep(800);
await ev(`(() => { const s=document.querySelector('select[aria-label="Patient"]'); s.value='p4-linda-garcia'; s.dispatchEvent(new Event('change')); })()`); await sleep(800);
console.log('editor case:', await ev(`document.querySelector('input[aria-label="Case title"]').value + ' / ' + document.querySelector('input[aria-label="Case code"]').value`));
await ev(`(() => { const lo=document.querySelector('input[aria-label="SBP low"]'); lo.value='85'; lo.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(300);
console.log('broken range warns:', (await text('.case-fields .case-warnings li')).slice(0, 160));
await click('.case-fields button', 'Check variants'); await sleep(3000);
console.log('check variants errors:', await ev(`[...document.querySelectorAll('.case-fields .case-warnings li.form-error')].length`));
// 9. Library grouping.
await click('.subnav-btn', 'Patient library'); await sleep(500);
console.log('library groups:', await text('.library-group'), '| cards:', (await text('.patient-card .card-name')).slice(0, 160));
console.log('errors', JSON.stringify(errors)); sock.close();
