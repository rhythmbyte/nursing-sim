// Shared helpers for the browser suites (tests/browser/*.mjs): a Chrome DevTools Protocol connection to one page
// of a headless Chromium, plus small DOM helpers. Run the suites with tests/browser/all.sh (it starts the static
// server and a fresh browser for each suite). A suite is run as: node <suite>.mjs <page websocket url> <output dir>.
//
// Environment: NS_BASE (site URL, default http://localhost:8765), NS_CDP_PORT (DevTools port, default 9333).
// A suite FAILS (exit code 1) when the page logged an error or warning, threw, or a click found no target
// ("MISSING …"), an evaluation threw ("EXC …"), or the suite called fail().

import { writeFileSync, mkdirSync } from 'node:fs';

export const BASE = process.env.NS_BASE || 'http://localhost:8765';
export const CDP = `http://localhost:${process.env.NS_CDP_PORT || 9333}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Connect to the page given on the command line. Returns the helpers every suite uses. */
export async function openPage(ws = process.argv[2], out = process.argv[3] || 'tests/browser/.out/shots') {
  if (!ws) throw new Error('usage: node <suite>.mjs <page websocket url> [output dir] (or run tests/browser/all.sh)');
  mkdirSync(out, { recursive: true });
  const sock = new WebSocket(ws);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const problems = [];
  sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) errors.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) { const e = `EXC ${r.result.exceptionDetails.exception?.description?.slice(0, 200)}`; problems.push(e); return e; }
    return r.result?.result?.value;
  };
  const shot = async (name, { full = false } = {}) => {
    const r = await send('Page.captureScreenshot', { format: 'png', ...(full ? { captureBeyondViewport: true } : {}) });
    writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  };
  const click = async (sel, label) => {
    const r = await ev(`(() => { const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)}) && !e.disabled); if(!b) return 'MISSING ${label.replace(/'/g, '')}'; b.click(); return 'ok'; })()`);
    if (r !== 'ok' && !String(r).startsWith('EXC')) problems.push(`${r} (${sel})`);
    return r;
  };
  const text = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e=>e.textContent.trim()).join(' | ')`);
  // Visible controls with no accessible name (no label, aria-label or button text).
  const unl = () => ev(`[...document.querySelectorAll('input, select, textarea, button')].filter(e => e.offsetParent && !e.closest('label') && !e.getAttribute('aria-label') && !(e.tagName === 'BUTTON' && e.textContent.trim())).map(e=>e.outerHTML.slice(0,80)).join(' ; ') || 'none'`);
  const setSel = (sel, v) => ev(`(() => { const s=document.querySelector(${JSON.stringify(sel)}); if(!s) return 'MISSING'; s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); return s.value; })()`);
  // Case-template placeholders left unfilled on screen ({firstName}, {med.doac}…).
  const braces = () => ev(`(document.body.innerText.match(/\\{[A-Za-z][A-Za-z0-9./-]*\\}/g) || []).join(' ')`);
  const fail = (why) => problems.push(why);
  const ignored = [];
  /** A page warning this suite expects (e.g. /Saved session discarded/) doesn't fail it. */
  const ignore = (re) => ignored.push(re);
  /** Fresh start: the app with empty storage (no welcome popup). */
  const reset = async (path = '/?debug=1', settleMs = 5000) => {
    await send('Page.navigate', { url: `${BASE}${path}` }); await sleep(2000);
    await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true")');
    await send('Page.reload'); await sleep(settleMs);
  };
  process.on('exit', () => {
    const bad = [...errors.filter((e) => !ignored.some((re) => re.test(e))).map((e) => `page: ${e}`), ...problems];
    if (bad.length) { console.log(`PROBLEMS (${bad.length}):\n  ${bad.slice(0, 12).join('\n  ')}`); process.exitCode = 1; }
  });
  await new Promise((r) => { sock.onopen = r; });
  return { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, problems, fail, ignore, reset, out, BASE, CDP };
}
