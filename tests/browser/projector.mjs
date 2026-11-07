// Browser suite: Projector page in a second tab: join code and who joined, live; never patient information; follows Start.
// Run with tests/browser/all.sh (or: node tests/browser/projector.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(2000);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true")'); await send('Page.reload'); await sleep(5000);
await ev(`(() => { const s=document.querySelector('select[aria-label="Start from"]'); s.value=s.options[1].value; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await click('button', 'Run the saved scenario'); await sleep(4000);
console.log('ready:', await text('.ready h2'), '| projector button:', await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Projector view')`));
const code = await text('.join-code-big .code');
// projector in its own tab
const t = await (await fetch(`${CDP}/json/new?${BASE}/?projector=1`, { method: 'PUT' })).json();
const ps = new WebSocket(t.webSocketDebuggerUrl); let pid = 0; const pp = new Map();
ps.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pp.has(msg.id)) { pp.get(msg.id)(msg); pp.delete(msg.id); } };
await new Promise((r) => (ps.onopen = r));
const pev = (expr) => new Promise((r) => { const i = ++pid; pp.set(i, (m) => r(m.result?.result?.value)); ps.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
await sleep(5000);
console.log('projector before:', await pev(`document.querySelector('.projector-code')?.textContent + ' | ' + document.querySelector('.projector-count')?.textContent + ' | tabs? ' + !!document.querySelector('.tab')`), '| main code', code);
await click('.tab', 'Student 1'); await sleep(500);
await ev(`(() => { const f=document.querySelector('form.iv-form'); f.querySelector('[aria-label="Join code"]').value=${JSON.stringify(code)}; f.querySelector('[aria-label="Your name"]').value='Ana'; f.requestSubmit(); return 1; })()`); await sleep(1500);
console.log('projector after join:', await pev(`document.querySelector('.projector-count')?.textContent + ' | ' + [...document.querySelectorAll('.projector-group')].map(g=>g.textContent).join(' / ')`));
console.log('projector shows patients?', await pev(`/Robert|Linda|Cardiac|\\(C1\\)/.test(document.body.innerText)`));
const r = await new Promise((res) => { const i = ++pid; pp.set(i, res); ps.send(JSON.stringify({ id: i, method: 'Page.captureScreenshot', params: { format: 'png' } })); });
(await import('node:fs')).writeFileSync(`${out}/projector.png`, Buffer.from(r.result.data, 'base64'));
await click('.tab', 'Instructor'); await sleep(300); await click('button', 'Start sim'); await sleep(1500);
console.log('projector after start:', await pev(`document.querySelector('.projector-count')?.textContent`));
console.log('main errors', JSON.stringify(errors)); ps.close(); sock.close();
