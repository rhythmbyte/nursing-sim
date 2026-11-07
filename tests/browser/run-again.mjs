// Browser suite: Run again after End: same scenario and cases, new join code, new patient variants, back on Ready.
// Run with tests/browser/all.sh (or: node tests/browser/run-again.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(2000);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn")); localStorage.setItem("nursing-sim:ui.overview.showAll", "true")'); await send('Page.reload'); await sleep(5000);
await click('.home-card', 'Custom setup'); await sleep(400); // the Instructor tab opens on Home
await ev(`(() => { const s=document.querySelector('select[aria-label="Start from"]'); s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
for (let i = 0; i < 5; i++) { await click('button', 'Next'); await sleep(250); }
await click('button', 'Create sim'); await sleep(4000);
const before = { code: await text('.join-code-big .code'), pts: await text('.ready tbody td:nth-child(2)'), scen: await ev(`window.__nursingSim.scenario.id`) };
await click('button', 'Start sim'); await sleep(1000);
await ev(`window.confirm = () => true`); await click('button', 'End sim'); await sleep(2000);
console.log('debrief buttons:', await text('.debrief-actions button'));
await click('.debrief-actions button', 'Run again'); await sleep(5000);
const after = { code: await text('.join-code-big .code'), pts: await text('.ready tbody td:nth-child(2)'), scen: await ev(`window.__nursingSim.scenario.id`) };
console.log('phase:', await text('.phase-btn.active'), '| ready:', await text('.ready h2'));
console.log('same scenario:', before.scen === after.scen, '| new code:', before.code !== after.code, before.code, after.code);
console.log('before:', before.pts.slice(0, 160)); console.log('after: ', after.pts.slice(0, 160));
console.log('same cases, new patients:', before.pts.split(' | ').map((x) => x.split(' — ')[0]).join() === after.pts.split(' | ').map((x) => x.split(' — ')[0]).join(), before.pts !== after.pts);
console.log('errors', JSON.stringify(errors)); sock.close();
