// Browser suite: Talking points leave out should-recognize items the student's reflection already mentions, and show them on request with who mentioned them.
// Run with tests/browser/all.sh (or: node tests/browser/reflection.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(2000);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn"))'); await send('Page.reload'); await sleep(5000);
await click('button', 'Start demo sim'); await sleep(4000);
await ev(`window.confirm = () => true`); await click('button', 'End sim'); await sleep(1500);
// The student writes the reflection on their tab.
await click('.tab', 'Student 1'); await sleep(800);
console.log('reflection form:', await ev(`document.querySelectorAll('.reflection textarea, form textarea').length`));
await ev(`(() => { const t=[...document.querySelectorAll('textarea')]; t.forEach(x => { x.value = 'Linda was deteriorating and developing septic shock, so I escalated and called rapid response.'; x.dispatchEvent(new Event('input',{bubbles:true})); }); return t.length; })()`);
await click('button', 'Submit'); await sleep(800);
console.log('submitted:', await ev(`!!JSON.parse(localStorage.getItem('nursing-sim:session')).reflections?.['student-1']`));
await click('.tab', 'Instructor'); await sleep(800);
console.log('summary points:', await text('.sum-card .btn-primary'));
await click('.sum-card .btn', 'Talking points'); await sleep(800);
console.log('header:', await text('.debrief-points header button'));
await click('.debrief-points header button', 'Show'); await sleep(600);
console.log('labeled:', (await text('.point-mentioned')).slice(0, 200));
await shot('mentioned');
console.log('errors', JSON.stringify(errors)); sock.close();
