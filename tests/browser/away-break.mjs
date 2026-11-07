// Browser suite: away status, breaks and shared computers. A demo student goes quiet for a minute: the Overview
// card and the student drawer show "Away / reconnecting". Break 10, Extend break +5 and Resume from the Overview
// clock bar (the break banner on every screen). The student comes back (reconnect logged), then "End of sim on this
// computer" clears their drafts and shows the join form. Takes about 75 s (the away check waits a real minute).
// Run with tests/browser/all.sh (or: node tests/browser/away-break.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, sleep, fail, reset } = await openPage();
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // headless reports "hidden" otherwise (no heartbeats)
await reset('/');
await click('button', 'Start demo sim'); await sleep(5000);
await click('.tab', 'Student 1'); await sleep(1000);
await click('.tab', 'Instructor'); await sleep(64000); // the student's screen is closed: no heartbeat for > 45 s
const card = await text('.cc-students .away');
console.log('away on the Overview card:', card);
if (!/Away/.test(card)) fail('the Overview card does not show the student as away');
await ev(`document.querySelector('.cc-student')?.click()`); await sleep(500);
const drawer = await text('.drawer td.away');
console.log('away in the student drawer:', drawer);
if (!/Away/.test(drawer)) fail('the student drawer does not show away');
await click('.drawer button', '✕'); await sleep(200);
console.log('break buttons:', await ev(`[...document.querySelectorAll('.overview-controls button')].map(b=>b.textContent).filter(t=>/Break/.test(t)).join(', ')`));
await click('.overview-controls button', 'Break 10'); await sleep(400);
const banner = await text('.break-banner');
console.log('banner:', banner);
if (!/Break/.test(banner)) fail('no break banner');
await click('.overview-controls button', 'Extend break'); await sleep(400);
const extended = await text('.break-banner');
console.log('extended:', extended);
if (extended === banner) fail('Extend break did not move the return time');
await click('.overview-controls button', 'Resume'); await sleep(400);
if (await ev(`!!document.querySelector('.break-banner:not([hidden])')`)) fail('break banner still shown after Resume');

await click('.tab', 'Student 1'); await sleep(1000);
const back = await ev(`JSON.parse(localStorage.getItem('nursing-sim:session')).log.filter(l=>l.action==='reconnected').map(l=>l.details.awayMin+' min via '+l.details.via).join()`);
console.log('student back; reconnect logged:', back);
if (!back) fail('no reconnect logged when the student came back');
await ev(`document.querySelector('.sp-open').click()`); await sleep(300); await click('dialog button', 'Close report'); await sleep(200);
await click('.chart-tab', 'Notes');
await ev(`(() => { const t=document.querySelector('textarea[aria-label="Nursing note"]'); t.value='draft'; t.dispatchEvent(new Event('input',{bubbles:true})); t.dispatchEvent(new Event('blur')); return 1; })()`); await sleep(600);
await ev(`document.querySelector('.chart-top button').click()`); await sleep(400);
await click('button', 'End of sim on this computer'); await sleep(800);
const joinForm = await text('.join-panel h2');
const drafts = await ev(`Object.keys(localStorage).filter(k=>k.includes('draft.notes')).length`);
console.log('after sign-out:', joinForm, '| drafts left', drafts);
if (joinForm !== 'Join sim' || drafts) fail('sign-out did not clear the drafts and show the join form');
const u = await unl(); console.log('unlabeled', u); if (u !== 'none') fail(`unlabeled controls: ${u}`);
sock.close();
