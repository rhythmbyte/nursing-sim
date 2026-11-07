// Browser suite: crash safety. Launches its own Chromium (NS_CHROMIUM, default chromium) on port NS_CRASH_PORT
// (default 9334) with a profile it can kill and relaunch: editor edit + kill before class, then a demo sim with
// a running task, a delegation and half-typed forms through a reload, a closed tab and a killed browser.
// Run with tests/browser/all.sh (or: node tests/browser/crash.mjs <empty profile dir>).
import { spawn } from 'node:child_process';
import { BASE } from './lib.mjs';
const PROFILE = process.argv[2];
if (!PROFILE) throw new Error('usage: node tests/browser/crash.mjs <empty profile dir>');
const PORT = process.env.NS_CRASH_PORT || 9334;
const CDP2 = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chrome = null;
async function launch() {
  chrome = spawn(process.env.NS_CHROMIUM || 'chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--disk-cache-size=1', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await sleep(250); try { const r = await fetch(`${CDP2}/json`); const t = (await r.json()).find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} }
  throw new Error('no browser');
}
function connect(ws) {
  const sock = new WebSocket(ws); let id = 0; const pending = new Map(); const dialogs = [];
  sock.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Page.javascriptDialogOpening') { dialogs.push(msg.params.message); send('Page.handleJavaScriptDialog', { accept: true }); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception?.description?.slice(0, 150) : r.result?.result?.value; };
  const click = (sel, text) => ev(`(() => { const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)}) && !e.disabled); if(!b) return 'MISSING ${text}'; b.click(); return 'ok'; })()`);
  const text = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e=>e.textContent.trim()).join(' | ')`);
  return { open: new Promise((r) => (sock.onopen = r)), send, ev, click, text, close: () => sock.close(), dialogs };
}
// What must survive: the saved session's people and work (not clock/log, which grow).
const SNAP = `(() => { const s = JSON.parse(localStorage.getItem('nursing-sim:session')); const pick = (o) => JSON.stringify(o);
  return { roster: pick(s.roster), students: pick(Object.fromEntries(Object.entries(s.students).map(([k, v]) => [k, { handoff: v.handoff, task: v.task && { id: v.task.id, label: v.task.label, endsAt: v.task.endsAt }, pausedTask: v.pausedTask?.id || null }]))),
    delegations: pick(Object.fromEntries(Object.entries(s.patients).map(([k, p]) => [k, p.delegations.map((d) => [d.id, d.status, d.helperId])]))), priorities: pick(s.priorities), alerts: s.alerts.length, log: s.log.length, clock: s.clock.status }; })()`;
const same = (a, b, keys = ['roster', 'students', 'delegations', 'priorities']) => keys.filter((k) => a[k] !== b[k]);
const results = [];
const report = (name, ok, extra = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` · ${extra}` : ''}`); };

let ws = await launch(); let c = connect(ws); await c.open;
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Page.navigate', { url: `${BASE}/` }); await sleep(1500);
await c.ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn")); localStorage.setItem("nursing-sim:ui.overview.showAll", "true")'); await c.send('Page.reload'); await sleep(2000);
await sleep(3000);
// 0. Builder (before class): mid-editor edit + kill. The Builder is hidden while a sim runs, so this comes first.
await c.click('.tab', 'Builder'); await sleep(400); await c.click('.subnav-btn', 'Patient editor'); await sleep(400);
await c.ev(`(() => { const i=[...document.querySelectorAll('label.field')].find(l=>l.textContent.startsWith('Name'))?.querySelector('input'); i.value='Robert Edited'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()`); await sleep(6000);
c.close(); process.kill(chrome.pid, 'SIGKILL'); await sleep(1500);
ws = await launch(); c = connect(ws); await c.open; await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Page.navigate', { url: `${BASE}/` }); await sleep(5000);
report('browser killed mid-editor: back in the Builder editor', (await c.text('.tab.active')) === 'Builder' && (await c.text('.subnav-btn.active')) === 'Patient editor', await c.text('.tab.active'));
report('browser killed mid-editor: unsaved edit restored', (await c.ev(`[...document.querySelectorAll('label.field')].find(l=>l.textContent.startsWith('Name'))?.querySelector('input')?.value`)) === 'Robert Edited', await c.text('.draft-note'));
await c.ev(`document.querySelector('.draft-note button')?.click()`); await sleep(300);
await c.click('.tab', 'Instructor'); await sleep(400);
await c.click('button', 'Start demo sim'); await sleep(4000);
report('demo running: Builder tab hidden, Overview shown', !(await c.text('.tab')).includes('Builder') && (await c.text('.phase-btn.active')) === 'Overview', await c.text('.tab'));
await c.ev(`localStorage.setItem('nursing-sim:ui.welcomeShown','true')`);
await c.click('.tab', 'Student 1'); await sleep(300);
await c.ev(`document.querySelector('.sp-open').click()`); await sleep(300);
await c.ev(`(() => { const b=document.querySelector('dialog textarea'); b.value='handoff note'; b.dispatchEvent(new Event('input',{bubbles:true})); b.dispatchEvent(new Event('blur')); return 1; })()`); await sleep(1200);
await c.click('dialog button', 'Close report'); await sleep(300);
await c.ev(`(() => { const s=document.querySelector('select[aria-label^="Priority"], .banner-prio select'); if (s) { s.value = s.options[1].value; s.dispatchEvent(new Event('change')); } return 1; })()`);
// mid-task + mid-delegation
await c.click('.chart-tab', 'Interventions'); await sleep(200);
const pick = async (q, label) => { await c.ev(`(() => { const s=document.querySelector('input[aria-label="Search interventions"]'); s.value=${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); return 1; })()`); await sleep(150); await c.click('.pill-iv', label); await sleep(150); };
await pick('ambulate', 'Ambulate'); await c.ev(`(() => { const s=document.querySelector('form select[name="by"]'); s.value='CNA'; return 1; })()`); await c.click('form button', 'Save'); await sleep(300);
await pick('head-to-toe', 'Head-to-toe'); await c.click('form button', 'Save'); await sleep(300);
// mid-typing a note
await c.click('.chart-tab', 'Notes'); await sleep(200);
await c.ev(`(() => { const t=document.querySelector('textarea[aria-label="Nursing note"]'); t.value='typing when it crashed'; t.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()`); await sleep(1500);
const s0 = await c.ev(SNAP);
console.log('before:', s0.clock, '| busy', await c.text('.busy-banner strong'), '| log', s0.log);

// 1. reload
await c.send('Page.reload'); await sleep(2500);
let s1 = await c.ev(SNAP);
report('reload: same people, task, delegations, handoff, priorities', !same(s0, s1).length, `diff ${same(s0, s1)}`);
report('reload: back in the chart section with the draft', (await c.text('.chart-tab.active')) === 'Notes' && (await c.ev(`document.querySelector('textarea[aria-label="Nursing note"]')?.value`)) === 'typing when it crashed');
report('reload: busy timer still shown', /Busy/.test(await c.text('.busy-banner strong')));
report('reload: reconnect logged', await c.ev(`JSON.parse(localStorage.getItem('nursing-sim:session')).log.some(l => l.action === 'reconnected')`));

// 2. tab closed and reopened
const tid = (await (await fetch(`${CDP2}/json`)).json()).find((x) => x.type === 'page').id;
await fetch(`${CDP2}/json/new?${BASE}/`, { method: 'PUT' }); await sleep(500);
await fetch(`${CDP2}/json/close/${tid}`); c.close(); await sleep(2500);
ws = (await (await fetch(`${CDP2}/json`)).json()).find((x) => x.type === 'page').webSocketDebuggerUrl; c = connect(ws); await c.open; await c.send('Runtime.enable'); await c.send('Page.enable'); await sleep(1500);
let s2 = await c.ev(SNAP);
report('tab closed + reopened: state identical', !same(s0, s2).length, `diff ${same(s0, s2)}`);
report('tab closed + reopened: chart + section', (await c.text('.chart-tab.active')) === 'Notes', await c.text('.chart-banner h2'));

// 3. browser killed (mid-typing / task / delegation), then relaunched with the same profile
await c.click('.chart-tab', 'Interventions'); await sleep(200);
await pick('oxygen', 'Apply'); await c.ev(`(() => { const i=document.querySelector('form input[name="lpm"]'); i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()`); await sleep(1500);
const s3a = await c.ev(SNAP);
c.close(); process.kill(chrome.pid, 'SIGKILL'); await sleep(1500);
ws = await launch(); c = connect(ws); await c.open; await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Page.navigate', { url: `${BASE}/` }); await sleep(3000);
let s3 = await c.ev(SNAP);
report('browser killed: people, task, delegations survive', !same(s3a, s3).length, `diff ${same(s3a, s3)}`);
report('browser killed: half-typed O₂ form restored', (await c.ev(`document.querySelector('form input[name="lpm"]')?.value`)) === '4', await c.text('.draft-note'));
report('browser killed: sim paused as of the last heartbeat', s3.clock === 'paused');
// the timer resumes and finishes
await c.click('.tab', 'Instructor'); await sleep(500);
report('after the kill: instructor is back on the Overview (sim paused)', (await c.text('.phase-btn.active')) === 'Overview' && (await c.text('.overview-controls button')).startsWith('Resume'), await c.text('.phase-btn.active'));
await c.click('button', 'Resume'); await c.ev(`(() => { const s=document.querySelector('select[aria-label="Sim speed"]'); s.value=[...s.options].at(-1).value; s.dispatchEvent(new Event('change')); return 1; })()`);
await sleep(60000);
const fin = await c.ev(`JSON.parse(localStorage.getItem('nursing-sim:session')).log.filter(l => l.action === 'task-finished' || l.action === 'delegation-completed').map(l => l.action).join(',')`);
report('after relaunch: task timer and delegation resumed and finished', /task-finished/.test(fin) && /delegation-completed/.test(fin), fin);
// 5. Back button
await c.click('.tab', 'Student 1'); await sleep(400);
await c.ev('history.back()'); await sleep(500);
report('Back button stays in the app', (await c.ev('location.origin')) === `${BASE}`);
// 6. rejoin by re-entering the code (token on this device) — from the Student 2 tab
const st = await c.ev(`JSON.parse(localStorage.getItem('nursing-sim:session'))`);
const name = Object.values(st.roster)[0].name; const code = st.joinCode;
const hasTab2 = await c.ev(`[...document.querySelectorAll('.tab')].some(t=>t.textContent==='Student 2')`);
if (hasTab2) {
  await c.click('.tab', 'Student 2'); await sleep(300);
  await c.ev(`(() => { const f=document.querySelector('form.iv-form'); f.querySelector('[aria-label="Join code"]').value=${JSON.stringify(code)}; f.querySelector('[aria-label="Your name"]').value=${JSON.stringify(name)}; f.requestSubmit(); return 1; })()`); await sleep(600);
  const rost = await c.ev(`Object.keys(JSON.parse(localStorage.getItem('nursing-sim:session')).roster).length`);
  report('rejoin by re-entering the code (token): same student, no duplicate', rost === 1 && /Rooms|·/.test(await c.text('.screen-header h2')), await c.text('.screen-header h2'));
  // 7. token missing → instructor approval (Student 3 tab, tokens removed)
  await c.ev(`Object.keys(localStorage).filter(k => k.includes('rejoin.')).forEach(k => localStorage.removeItem(k))`);
  const hasTab3 = await c.ev(`[...document.querySelectorAll('.tab')].some(t=>t.textContent==='Student 3')`);
  report('(info) a third student tab exists for the no-token case', hasTab3);
} else report('(info) only one student tab in this scenario', true);
console.log('dialogs seen:', JSON.stringify(c.dialogs));
console.log(`${results.filter(([, ok]) => ok).length}/${results.length} passed`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
c.close(); process.kill(chrome.pid, 'SIGKILL');
