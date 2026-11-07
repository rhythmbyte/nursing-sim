// Browser suite: Instructor flow: wizard from a saved scenario → Create → Ready → a student joins → Start → Overview, patient and student drawers, More controls → End → Debrief; Builder hidden while running.
// Run with tests/browser/all.sh (or: node tests/browser/instructor-flow.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(1500);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true")'); await send("Page.reload"); await sleep(7000);
console.log('tabs:', await text('.tab'), '| phase:', await text('.phase-btn'));
console.log('wizard step:', await text('.wizard section.panel:not([hidden]) h3'));
await ev(`(() => { const s=document.querySelector('select[aria-label="Start from"]'); s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
for (let i = 0; i < 5; i++) { await click('button', 'Next'); await sleep(300); console.log(' step:', await text('.wizard section.panel:not([hidden]) h3')); }
await shot('w-review');
console.log('review:', await text('.review-list li'));
await click('button', 'Create sim'); await sleep(3000);
console.log('ready:', await text('.ready h2'), '| code:', await text('.join-code-big .code'), '| cases rows', await ev(`document.querySelectorAll('.ready tbody tr').length`));
await shot('ready');
const code = await text('.join-code-big .code');
await click('.tab', 'Student 1'); await sleep(800);
await ev(`(() => { const c=document.querySelector('input[name=code]'); c.value=${JSON.stringify(code)}; const n=document.querySelector('input[name=name]'); n.value='Ana'; document.querySelector('.join-panel form').requestSubmit(); })()`); await sleep(800);
console.log('student home patients:', await text('.patient-list .name, .sp-name, .patient-card .card-name'));
await click('.tab', 'Instructor'); await sleep(600);
await click('button', 'Start sim'); await sleep(1500);
console.log('after start tabs:', await text('.tab'), '| phase:', await text('.phase-btn.active'), '| overview h2:', await text('.overview h2'));
console.log('alerts:', await text('.alerts-strip'));
await click('.cc-patient', ''); await sleep(800);
console.log('drawer:', await text('.drawer-title'), '| sections:', await text('.drawer-section > h4'));
await shot('drawer');
await click('.drawer button', '✕'); await sleep(200);
await click('.cc-student', ''); await sleep(500); console.log('student drawer:', await text('.drawer-title'), (await text('.drawer tbody')).slice(0, 120));
await click('.drawer button', '✕');
await ev(`document.querySelector('.more-controls').open = true`); await sleep(1200);
console.log('more controls panels:', (await text('.more-controls h3')).slice(0, 300));
await ev(`document.querySelector('.more-controls').open = false`); await sleep(300);
await shot('overview');
// End → debrief
await ev(`window.confirm = () => true`);
await click('button', 'End sim'); await sleep(1500);
console.log('after end phase:', await text('.phase-btn.active'), '| tabs:', await text('.tab'), '| debrief h2:', await text('.debrief-header h2, .screen-header h2'));
await shot('debrief');
console.log('errors', JSON.stringify(errors)); sock.close();
