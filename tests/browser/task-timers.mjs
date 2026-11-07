// Browser suite: task timers and the delegation staff pool. Demo sim at top speed; the student charts a head-to-toe
// (busy banner, a second task is refused with a toast, Interrupt), then delegates three walks to a CNA: the third
// finds no CNA free and is queued. The Overview card, the student drawer and More controls → Staff show it; the
// charge tab has the staff board; after End the full breakdown has Task time and Delegation.
// Run with tests/browser/all.sh (or: node tests/browser/task-timers.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, shot, sleep, fail, reset } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
await reset('/');
await click('button', 'Start demo sim'); await sleep(5000);
console.log('speed', await ev(`(() => { const s=document.querySelector('select[aria-label="Sim speed"]'); s.value=[...s.options].at(-1).value; s.dispatchEvent(new Event('change')); return s.value; })()`));

await click('.tab', 'Student 1'); await sleep(400);
console.log('student staff panel:', await text('.staff-panel li'));
await ev(`[...document.querySelectorAll('.sp-open')].find(b=>b.textContent.includes('Linda')).click()`); await sleep(300); await click('dialog button', 'Close report'); await sleep(200);
await click('.chart-tab', 'Interventions'); await sleep(200);
const search = (q) => ev(`(() => { const s=document.querySelector('input[aria-label="Search interventions"]'); s.value=${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); return 1; })()`);
await search('head-to-toe'); await sleep(150);
await click('.pill-iv', 'Head-to-toe'); await sleep(150);
await click('form button', 'Save'); await sleep(400);
const busy = await text('.busy-banner');
console.log('busy banner:', busy.slice(0, 120));
if (!/Busy/.test(busy)) fail('no busy banner after charting a head-to-toe');
await search('ambulate'); await sleep(150);
// While busy, starting another task is refused (the pill or Save is disabled, or a toast explains why).
const blocked = await ev(`(() => { const p=[...document.querySelectorAll('.pill-iv')].find(e=>e.textContent.trim().startsWith('Ambulate')); if (!p || p.disabled) return 'pill disabled'; p.click(); const b=[...document.querySelectorAll('form button')].find(e=>e.textContent.trim()==='Save'); if (!b || b.disabled) return 'save disabled'; b.click(); return 'clicked'; })()`);
await sleep(300);
console.log('second task while busy:', blocked, '| toast:', await text('.toast'));
if (blocked === 'clicked' && !(await text('.toast'))) fail('a second task started while busy, with no explanation');
await click('.busy-banner button', 'Interrupt'); await sleep(400);
console.log('after interrupt:', (await text('.busy-banner')) || 'no banner');
if (await text('.busy-banner')) fail('still busy after Interrupt');

// Delegate three walks to a CNA (2 CNAs): the third has no helper → queue it.
for (let i = 0; i < 3; i++) {
  await search('ambulate'); await sleep(150);
  await click('.pill-iv', 'Ambulate'); await sleep(150);
  await ev(`(() => { const s=document.querySelector('form select[name="by"]'); s.value='CNA'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()`);
  await click('form button', 'Save'); await sleep(400);
}
const dlg = await text('dialog h2');
console.log('no-helper dialog:', dlg, '|', await text('dialog .modal-actions button'));
if (!/No CNA free/i.test(dlg)) fail(`expected the "No CNA free" dialog, got: ${dlg}`);
await click('dialog button', 'Queue for a CNA'); await sleep(300);
const panel = await text('.staff-panel h4');
console.log('staff panel now:', await text('.staff-panel li'), '| waiting:', panel);
await shot('staff-student');

await click('.tab', 'Instructor'); await sleep(500);
const cc = await text('.cc-staff');
console.log('overview staff line:', cc);
if (!/waiting for a helper/.test(cc)) fail('the Overview card does not show the queued task');
await ev(`[...document.querySelectorAll('.cc-student')][0]?.click()`); await sleep(500);
console.log('student drawer:', (await text('.drawer tbody')).slice(0, 140));
await click('.drawer button', '✕'); await sleep(200);
await ev(`document.querySelector('.more-controls').open = true`); await sleep(1200);
console.log('More controls staff board rows:', await ev(`document.querySelectorAll('.more-controls .staff-board tr').length`));
await ev(`document.querySelector('.more-controls').open = false`); await sleep(300);
await click('.tab', 'Charge'); await sleep(400);
const rows = await ev(`document.querySelectorAll('.staff-board tr').length`);
console.log('charge staff rows:', rows);
if (!rows) fail('no staff board on the charge tab');
await click('.tab', 'Instructor'); await sleep(400);
await ev(`window.confirm = () => true`); await click('button', 'End sim'); await sleep(2000);
await click('.sum-card .btn', 'Full breakdown'); await sleep(1000);
const debrief = await ev(`[...document.querySelectorAll('section.panel')].filter(p=>/^(Task time|Delegation)/.test(p.querySelector('h3')?.textContent)).map(p=>p.querySelector('h3').textContent + ': ' + (p.querySelector('p')?.textContent || '')).join(' || ')`);
console.log('debrief:', debrief.slice(0, 220));
if (!/Task time/.test(debrief) || !/Delegation/.test(debrief)) fail('Task time or Delegation missing from the breakdown');
const u = await unl(); console.log('unlabeled', u); if (u !== 'none') fail(`unlabeled controls: ${u}`);
sock.close();
