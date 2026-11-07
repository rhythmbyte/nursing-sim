// Browser suite: Main tour: every wizard step and Builder view (no unlabeled controls), demo sim → Overview, drawer and More controls, the student chart and assessments, charge tab, skip to events, End → all three debrief tiers.
// Run with tests/browser/all.sh (or: node tests/browser/tour.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/` }); await sleep(1500);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn")); localStorage.setItem("nursing-sim:ui.overview.showAll", "true")'); await send('Page.reload'); await sleep(6000);

console.log('load problems banner:', (await text('.banner-error')) || 'none');
console.log('tabs:', await text('.tab'), '| phase:', await text('.phase-btn.active'));
// ---- Wizard: every step, unlabeled controls
await click('.home-card', 'Custom setup'); await sleep(400); // the Instructor tab opens on Home
for (let i = 0; i < 6; i++) { console.log(`[wizard ${i + 1}] unlabeled: ${await unl()}`); await click('button', 'Next'); await sleep(250); }
console.log('setup tools:', await ev(`document.querySelectorAll('input[aria-label^="Offer "]').length`), 'ticked', await ev(`[...document.querySelectorAll('input[aria-label^="Offer "]')].filter(x=>x.checked).length`));
// ---- Builder (before the sim)
await click('.tab', 'Builder'); await sleep(400);
for (const v of (await text('.subnav-btn')).split(' | ')) { await click('.subnav-btn', v); await sleep(400); console.log(`[builder] ${v}: ${await text('.screen-header h2')} | unlabeled: ${await unl()}`); }
await click('.subnav-btn', 'Patient library'); await sleep(300);
console.log('library tools:', await ev(`[...document.querySelectorAll('details.panel summary')].map(s=>s.textContent).find(t=>t.startsWith('Assessment tools'))`));
await click('.subnav-btn', 'Patient editor'); await sleep(300);
console.log('pick dorothy:', await setSel('select[aria-label="Patient"]', 'p5-dorothy-evans')); await sleep(400);
console.log('case section:', await ev(`document.querySelector('input[aria-label="Case title"]').value + ' / ' + document.querySelector('input[aria-label="Case code"]').value`));
await ev(`[...document.querySelectorAll('.change-list li')].find(li=>li.textContent.includes('08:45'))?.querySelector('button').click()`); await sleep(400);
console.log('change dialog:', await text('dialog h2'));
await click('dialog button', 'Cancel'); await sleep(200);
console.log('pick margaret:', await setSel('select[aria-label="Patient"]', 'p2-margaret-wilson')); await sleep(400);
await click('button', 'Test this patient'); await sleep(600);
console.log('dry run rows:', await ev(`document.querySelectorAll('dialog .test-results tbody tr').length`));
await click('dialog button', 'Close'); await sleep(200);
// ---- Start demo sim → Overview
await click('.tab', 'Instructor'); await sleep(300);
await click('button', 'Start demo sim'); await sleep(5000);
console.log('running tabs:', await text('.tab'), '| phase:', await text('.phase-btn.active'));
console.log('command counts:', await ev(`[...document.querySelector('.cc-card').querySelectorAll('.cc-count')].map(c=>c.querySelector('span').textContent).join(', ')`));
console.log('cc script chips:', await text('.cc-script'));
console.log('overview unlabeled:', await unl());
await ev(`[...document.querySelectorAll('.cc-patient')].find(b=>/S1/.test(b.textContent)).click()`); await sleep(700);
console.log('drawer:', await text('.drawer-title'), '| sections:', await text('.drawer-section > h4'), '| script panel:', await ev(`!!document.querySelector('.drawer .script-row')`));
console.log('drawer unlabeled:', await unl());
await click('.drawer button', '✕'); await sleep(200);
await ev(`document.querySelector('.more-controls').open = true`); await sleep(1200);
console.log('more: add-event buttons', await ev(`[...document.querySelectorAll('.more-controls button')].filter(b=>b.textContent==='Add event').length`), '| scripts', await ev(`[...document.querySelectorAll('.more-controls .script-row .script-head strong')].map(x=>x.textContent).join(', ')`));
await ev(`document.querySelector('.more-controls').open = false`); await sleep(300);
// ---- Student
await click('.tab', 'Student 1'); await sleep(400);
console.log('student patients:', await text('.sp-open'));
await ev(`document.querySelector('.sp-open').click()`); await sleep(300);
await click('dialog button', 'Close report'); await sleep(300);
console.log('chart tabs:', await text('.chart-tab'));
await click('.chart-tab', 'Assessments'); await sleep(300);
console.log('tool pills:', await ev(`document.querySelectorAll('.pill').length`), '| license-needed offered:', await ev(`[...document.querySelectorAll('.pill')].some(p=>/Braden|Morse/.test(p.textContent))`));
await click('.pill', 'Numeric pain'); await sleep(200);
await ev(`[...document.querySelectorAll('button')].filter(b=>b.textContent==='Check patient').forEach(b=>b.click())`); await sleep(200);
console.log('pain hints:', await text('.assess-hint'), '| total:', await text('.assess-total'));
await click('form button', 'Save'); await sleep(300);
// Task timers (manikin mode): the student is busy for a short lockout; the pain score is charted when it ends.
for (let i = 0; i < 60 && await ev(`!!document.querySelector('.busy-banner')`); i++) await sleep(1000);
if (await ev(`!!document.querySelector('.busy-banner')`)) fail('still busy 60 s after saving the pain score');
console.log('charted list:', await ev(`[...document.querySelectorAll('.feed li')].map(l=>l.textContent).filter(t=>/pain/i.test(t)).slice(0,2).join(' || ')`));
// NEWS2's license is unconfirmed, so it isn't offered by default (only public tools are).
const news2 = await ev(`[...document.querySelectorAll('.pill')].some(p=>/NEWS2/.test(p.textContent))`);
console.log('NEWS2 offered (should be false until its license is confirmed):', news2);
if (news2) fail('NEWS2 offered although its license is not confirmed');
if (!/pain/i.test(await ev(`[...document.querySelectorAll('.feed li')].map(l=>l.textContent).join(' ')`))) fail('pain score not in the charted list');
await shot('student-assess');
console.log('assess unlabeled:', await unl());
await click('.chart-tab', 'Interventions'); await sleep(300);
await ev(`(() => { const s=document.querySelector('input[aria-label="Search interventions"]'); s.value='neuro'; s.dispatchEvent(new Event('input')); return 1; })()`); await sleep(200);
await click('.pill-iv', 'Neuro check'); await sleep(200);
console.log('linked tools:', await ev(`[...document.querySelectorAll('.iv-form p.small button')].map(b=>b.textContent).join(', ')`));
await click('.iv-form p.small button', 'Glasgow'); await sleep(300);
console.log('jumped to:', await text('.chart-tab.active'), '| selected tool:', await text('.pill.active'));
for (const t of (await text('.chart-tab')).split(' | ')) { await click('.chart-tab', t.replace(/\d+$/, '')); await sleep(250); const u = await unl(); if (u !== 'none') console.log(`chart ${t} unlabeled: ${u}`); }
// ---- Charge, skip, end, debrief
await click('.tab', 'Charge'); await sleep(300); console.log('charge:', await text('.screen-header h2'), '| unlabeled:', await unl());
await click('.tab', 'Instructor'); await sleep(500);
for (let i = 0; i < 4; i++) { await click('button', 'Skip to next event'); await sleep(400); }
console.log('command center after skips:', await ev(`[...document.querySelectorAll('.cc-card')].map(c=>c.querySelector('h3').textContent+': '+[...c.querySelectorAll('.cc-count')].filter(x=>/reassess/.test(x.textContent)).map(x=>x.textContent).join()).join(' | ')`));
console.log('attention:', await text('.attention-item'));
await ev(`window.confirm = () => true`);
await click('button', 'End sim'); await sleep(2500);
console.log('phase after end:', await text('.phase-btn.active'), '| summary cards:', await ev(`document.querySelectorAll('.sum-card').length`), '| unlabeled:', await unl());
await click('.sum-card .btn', 'Talking points'); await sleep(800);
console.log('themes:', await text('.debrief-points section h3'), '| unlabeled:', await unl());
await click('.debrief-nav .btn', 'Full breakdown'); await sleep(1000);
console.log('breakdown sections:', await ev(`[...document.querySelectorAll('section.panel h3')].map(h=>h.firstChild.textContent.trim()).join(', ')`));
await shot('breakdown');
console.log('breakdown unlabeled:', await unl());
console.log('errors', JSON.stringify(errors)); sock.close();
