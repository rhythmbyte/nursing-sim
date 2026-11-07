// Browser suite: Rejoin: same name with the device token rejoins at once; without the token the Overview alerts strip and student drawer ask the instructor to approve.
// Run with tests/browser/all.sh (or: node tests/browser/rejoin.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(1500);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn")); localStorage.setItem("nursing-sim:ui.overview.showAll", "true")'); await send('Page.reload'); await sleep(2000);
await ev(`(async () => { const dl = await import('/js/data-loader.js'); const d = await dl.loadAll();
  const sc = { id: 'sc-rj', name: 'Rejoin test', startClock: '07:00', speed: 1, assignment: 'random', events: [], notes: '', settings: {},
    groups: [{ id: 'g1', name: 'Group 1', studentCount: 3, patients: ['p1-robert-miller', 'p4-linda-garcia'] }] };
  dl.saveLocal('scenario', sc, d.schemas); localStorage.setItem('nursing-sim:ui.scenario', JSON.stringify('sc-rj')); localStorage.setItem('nursing-sim:ui.setup.ready', JSON.stringify('sc-rj')); localStorage.removeItem('nursing-sim:session'); return 1; })()`);
await send('Page.reload'); await sleep(5000);
await click('.tab', 'Instructor'); await sleep(300);
console.log('ready screen:', await text('.ready h2'));
const code = await ev(`document.querySelector('.join-code-big .code').textContent`);
await click('button', 'Start sim'); await sleep(800);
console.log('phase after Start sim:', await text('.phase-btn.active'));
const join = async (tab, name) => { await click('.tab', tab); await sleep(300); return ev(`(() => { const f=document.querySelector('form.iv-form'); f.querySelector('[aria-label="Join code"]').value=${JSON.stringify(code)}; f.querySelector('[aria-label="Your name"]').value=${JSON.stringify(name)}; f.requestSubmit(); return 1; })()`); };
await join('Student 1', 'Ana'); await sleep(500);
console.log('S1:', await text('.screen-header h2'));
await join('Student 2', 'Ana'); await sleep(600);
console.log('S2 after re-entering Ana (token on device):', await text('.screen-header h2'), '| roster', await ev(`Object.values(JSON.parse(localStorage.getItem('nursing-sim:session')).roster).map(r=>r.name).join()`));
await ev(`Object.keys(localStorage).filter(k => k.includes('rejoin.')).forEach(k => localStorage.removeItem(k))`);
await join('Student 3', 'Ana'); await sleep(600);
console.log('S3 without token:', await text('.join-panel .banner, .form-error'), '| panel', await ev(`document.querySelector('.tab-panel')?.textContent.slice(0,200)`), '| lastJoin', await ev(`JSON.stringify(window.__nursingSim?.runner.lastJoin())`));
await click('.tab', 'Instructor'); await sleep(500);
console.log('attention list:', await text('.attention-item'));
await ev(`[...document.querySelectorAll('.attention-item')].find(b=>b.textContent.includes('Ana'))?.click()`); await sleep(500);
console.log('student drawer:', await text('.drawer-title'), '|', await text('.drawer .banner-review'));
await click('.drawer button', 'Approve Ana'); await sleep(500);
await click('.tab', 'Student 3'); await sleep(500);
console.log('S3 after approval:', await text('.screen-header h2'), '| roster size', await ev(`Object.keys(JSON.parse(localStorage.getItem('nursing-sim:session')).roster).length`));
await click('.tab', 'Instructor'); await sleep(500);
console.log('attention after approval:', await text('.attention-item'));
console.log('drawer still open after reload-safe save:', await text('.drawer-title'));
console.log('connection column:', await ev(`[...document.querySelectorAll('.drawer table.data-table tr')].find(r=>r.textContent.includes('Ana'))?.textContent.slice(0,140)`));
ignore(/Saved session discarded/); // the suite swaps the scenario under a saved session on purpose
console.log('errors', JSON.stringify(errors.filter((e) => !/Saved session discarded/.test(e)))); sock.close();
