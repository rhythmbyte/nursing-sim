// Browser suite: 4-hour soak (simulated clock): 3 groups with activity every minute; heap, log and storage size every 30 min; tick, Overview, drawer, More controls and debrief render times; no errors.
// Run with tests/browser/all.sh (or: node tests/browser/soak.mjs <page websocket url> <output dir>).
import { openPage } from './lib.mjs';

const { sock, send, ev, click, text, unl, setSel, braces, shot, sleep, errors, fail, ignore, reset, out, BASE, CDP } = await openPage();
await send('Runtime.enable'); await send('Page.enable'); await send('HeapProfiler.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
// Controllable clock: Date.now() = real start + offset (the app ticks normally; the soak moves time forward).
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const real = Date.now.bind(Date); const base = real(); window.__off = Number(sessionStorage.getItem('__off') || 0); Date.now = () => base + window.__off + (real() - base) * 0; window.__advance = (ms) => { window.__off += ms; sessionStorage.setItem('__off', window.__off); }; })();` });
await send('Page.navigate', { url: `${BASE}/?debug=1` }); await sleep(1500);
await ev('localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase("nursing-sim"); sessionStorage.setItem("nursing-sim:welcomeShown","true"); localStorage.setItem("nursing-sim:ui.program", JSON.stringify("rn"))'); await send('Page.reload'); await sleep(5000);
// 3-group sim with every feature on
console.log('create:', await ev(`(async () => {
  const dl = await import('/js/data-loader.js'); const d = await dl.loadAll();
  const sc = { id: 'sc-soak', name: 'Soak 4h', startClock: '07:00', endClock: '11:00', speed: 1, assignment: 'random', events: [], notes: '',
    settings: { taskTimerMode: 'manikin', assessmentTools: 'all', delegationQueue: true },
    groups: [{ id: 'g1', name: 'Group 1', studentCount: 1, patients: ['p1-robert-miller', 'p4-linda-garcia'] }, { id: 'g2', name: 'Group 2', studentCount: 1, patients: ['p2-margaret-wilson', 'p5-dorothy-evans'] }, { id: 'g3', name: 'Group 3', studentCount: 1, patients: ['p3-harold-thompson'], admissions: ['p6-james-carter'] }] };
  const errs = dl.saveLocal('scenario', sc, d.schemas); localStorage.setItem('nursing-sim:ui.scenario', JSON.stringify('sc-soak')); localStorage.removeItem('nursing-sim:session'); return errs.join(';') || 'ok'; })()`));
await send('Page.reload'); await sleep(5000);
console.log('scenario:', await ev(`window.__nursingSim.scenario.name + ' groups ' + window.__nursingSim.scenario.groups.length`));
await ev(`(() => { const { runner } = window.__nursingSim; const I = { userId: 'instructor', role: 'instructor' };
  ['Ana','Ben','Cal'].forEach((n, i) => runner.join('student-' + (i + 1), n, runner.state.joinCode)); runner.clock('start', I); return 1; })()`);
// activity per sim minute, measured
const act = `(() => { const { runner } = window.__nursingSim; const st = runner.state; const m = Math.floor(runner.simMin()); let n = 0;
  const ivs = ['assess-focused','vs-full','reassess','o2-apply','position-hob','io','iv-check','reposition','teach','glucose-poc'];
  for (const [uid, r] of Object.entries(st.roster)) {
    const user = { userId: uid, role: 'student' };
    const pids = Object.entries(st.patients).filter(([, ps]) => ps.present && ps.groupId === r.groupId).map(([p]) => p);
    for (const p of pids) if (st.patients[p].callLight) { runner.answerCallLight(p, user); n++; }
    if (!pids.length) continue;
    const pid = pids[m % pids.length];
    try {
      if (!runner.busy(uid)) {
        if (m % 15 === 3) runner.chart('chartAssessment', pid, { toolId: 'gcs', answers: { eye: 4, verbal: 5, motor: 6 } }, user);
        else if (m % 4 === 0) runner.chart('chartIntervention', pid, { interventionId: ivs[(m / 4) % ivs.length], fields: { device: 'NC', lpm: '4' } }, user);
      }
      if (m % 20 === 7) runner.chart('chartIntervention', pid, { interventionId: 'vs-full', delegatedTo: 'CNA', queue: true }, user);
      if (m % 10 === 5) runner.chart('addNote', pid, { text: 'Note at ' + m }, user);
      n++;
    } catch (e) { n += 0; }
  }
  return n; })()`;
const sample = async (label) => {
  await send('HeapProfiler.collectGarbage');
  const heap = await send('Runtime.getHeapUsage');
  const info = await ev(`(() => { const s = window.__nursingSim.runner.state; return { simMin: Math.round(window.__nursingSim.runner.simMin()), log: s.log.length, alerts: s.alerts.length, storageKB: Math.round((localStorage.getItem('nursing-sim:session') || '').length / 1024) }; })()`);
  console.log(label, JSON.stringify({ heapMB: Math.round(heap.result.usedSize / 1e5) / 10, ...info }));
};
await click('.tab', 'Instructor'); await sleep(500);
console.log('phase at start:', await text('.phase-btn.active'));
await sample('t0');
const tickTimes = [];
for (let m = 1; m <= 240; m++) {
  await ev(`window.__advance(60000)`);
  const t = await ev(`(() => { const t0 = performance.now(); window.__nursingSim.runner.tick(); return performance.now() - t0; })()`);
  tickTimes.push(t);
  await ev(act);
  if (m % 30 === 0) { await sleep(300); await sample(`t${m}`); }
  else await sleep(40);
  if (m === 235) {
    // Overview (cards + alerts) and the patient drawer and More controls, late in a long sim.
    console.log('overview store-set re-render ms:', await ev(`(() => { const { runner } = window.__nursingSim; const t0 = performance.now(); runner.chart('addNote', 'p1-robert-miller', { text: 'x' }, { userId: 'student-1', role: 'student' }); return Math.round(performance.now() - t0); })()`));
    console.log('drawer open ms:', await ev(`(() => { const b=[...document.querySelectorAll('.cc-patient')].find(x=>/S1/.test(x.textContent)); const t0 = performance.now(); b.click(); return Math.round(performance.now() - t0); })()`), '|', await text('.drawer-title'));
    await click('.drawer button', '✕');
    console.log('more controls mount ms:', await ev(`new Promise((r) => { const d=document.querySelector('.more-controls'); const t0 = performance.now(); d.addEventListener('toggle', () => r(Math.round(performance.now() - t0)), { once: true }); d.open = true; })`));
    console.log('store-set ms with More controls open:', await ev(`(() => { const { runner } = window.__nursingSim; const t0 = performance.now(); runner.chart('addNote', 'p1-robert-miller', { text: 'x' }, { userId: 'student-1', role: 'student' }); return Math.round(performance.now() - t0); })()`));
    await ev(`document.querySelector('.more-controls').open = false`);
  }
  if (m === 120) { await ev(`window.__nursingSim.runner.assignAdmission && Object.entries(window.__nursingSim.runner.state.patients).filter(([, p]) => p.admission?.status === 'pending').forEach(([pid]) => window.__nursingSim.runner.assignAdmission(pid, 'g3', { userId: 'instructor', role: 'charge' })) || 1`); }
}
const avg = (a) => Math.round(a.reduce((s, x) => s + x, 0) / a.length * 10) / 10;
console.log('tick ms: first 30 avg', avg(tickTimes.slice(0, 30)), '| last 30 avg', avg(tickTimes.slice(-30)), '| max', Math.round(Math.max(...tickTimes)));
const timeClick = (sel, text) => ev(`(() => { const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return 'MISSING ' + ${JSON.stringify(text)}; const t0 = performance.now(); b.click(); return Math.round(performance.now() - t0); })()`);
await sleep(1500);
console.log('phase at the end:', await text('.phase-btn.active'), '| summary cards', await ev(`document.querySelectorAll('.sum-card').length`));
console.log('summary re-render ms:', await timeClick('.phase-btn', 'Debrief'));
console.log('talking points render ms:', await timeClick('.sum-card .btn', 'Talking points'), '| points', await ev(`document.querySelectorAll('.point').length`));
console.log('full breakdown render ms:', await timeClick('.debrief-nav .btn', 'Full breakdown'));
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: `${out}/dl` });
console.log('CSV export ms:', await timeClick('button', 'Export CSV'));
await sample('end');
console.log('status', await ev(`window.__nursingSim.runner.state.clock.status`), '| errors', JSON.stringify(errors.slice(0, 5)), errors.length); sock.close();
