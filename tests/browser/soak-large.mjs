// Browser suite: large 4-hour soak (simulated clock): 10 students × 6 patients (60 patients, every feature on), activity
// every minute; heap, log and storage size every 30 min; tick, attention queue, Overview (exception-first and Show all),
// drawer, More controls and debrief render times; no errors. Fails if a tick or a render passes its budget.
// Run with tests/browser/all.sh (or: node tests/browser/soak-large.mjs <page websocket url> <output dir>).
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
  const cases = ['p1-robert-miller', 'p2-margaret-wilson', 'p3-harold-thompson', 'p4-linda-garcia', 'p5-dorothy-evans', 'p6-james-carter'];
  const sc = { id: 'sc-soak-large', name: 'Soak 10 × 6', startClock: '07:00', endClock: '11:00', speed: 1, assignment: 'random', events: [], notes: '',
    settings: { taskTimerMode: 'manikin', assessmentTools: 'all', delegationQueue: true, recoveryPenalties: true, chargeNurse: 'instructor' },
    groups: Array.from({ length: 10 }, (_, i) => ({ id: 'g' + (i + 1), name: 'Group ' + (i + 1), studentCount: 1, patients: cases.filter((c) => c !== 'p6-james-carter'), admissions: ['p6-james-carter'] })) };
  const errs = dl.saveLocal('scenario', sc, d.schemas); localStorage.setItem('nursing-sim:ui.scenario', JSON.stringify('sc-soak-large')); localStorage.removeItem('nursing-sim:session'); return errs.join(';') || 'ok'; })()`));
await send('Page.reload'); await sleep(5000);
console.log('scenario:', await ev(`window.__nursingSim.scenario.name + ' groups ' + window.__nursingSim.scenario.groups.length`));
await ev(`(() => { const { runner } = window.__nursingSim; const I = { userId: 'instructor', role: 'instructor' };
  ['Ana','Ben','Cal','Dee','Eli','Fay','Gus','Hal','Ivy','Jo'].forEach((n, i) => runner.join('student-' + (i + 1), n, runner.state.joinCode)); runner.clock('start', I); return Object.keys(runner.state.patients).length; })()`);
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
const perf = {};
for (let m = 1; m <= 240; m++) {
  await ev(`window.__advance(60000)`);
  const t = await ev(`(() => { const t0 = performance.now(); window.__nursingSim.runner.tick(); return performance.now() - t0; })()`);
  tickTimes.push(t);
  await ev(act);
  if (m % 30 === 0) { await sleep(300); await sample(`t${m}`); }
  else await sleep(40);
  if (m === 238) {
    perf.engineTick = await ev(`(async () => { const { runner } = window.__nursingSim; const session = await import('/js/engine/session.js'); const ctx = { ...runner.rulesCtx(), now: Date.now(), refs: runner.refs };
      const t0 = performance.now(); for (let i = 0; i < 5; i++) session.tick(runner.state, { now: Date.now() + i * 1000, refs: runner.refs, templatesById: ctx.templatesById, catalogs: ctx.catalogs }); return Math.round((performance.now() - t0) / 5); })()`);
    console.log('pure engine tick ms (no saving, no screens):', perf.engineTick);
  }
  if (m === 236) { await send('Profiler.enable'); await send('Profiler.start'); } // the last minutes, for tests/browser/.out/shots/soak-large/late-ticks.cpuprofile
  if (m === 240) { const pr = await send('Profiler.stop'); (await import('node:fs')).writeFileSync(`${out}/late-ticks.cpuprofile`, JSON.stringify(pr.result.profile)); }
  if (m === 235) {
    // Late in a long, big sim: the attention queue, the Overview (exception-first and Show all), drawer, More controls.
    perf.queue = await ev(`(async () => { const { runner, scenario } = window.__nursingSim; const cc = await import('/js/engine/command-center.js'); const at = await import('/js/engine/attention.js'); const r = await import('/js/engine/rules/index.js');
      const t0 = performance.now(); const ctx = runner.rulesCtx(); const groups = cc.commandCenter(runner.state, ctx, scenario); const q = at.attentionQueue(runner.state, ctx, groups, r.evaluateRules(runner.state, ctx)); return { ms: Math.round(performance.now() - t0), items: q.length, patients: at.attentionPatients(q).size }; })()`);
    console.log('attention queue:', JSON.stringify(perf.queue), '| shown:', await ev(`document.querySelectorAll('.attention-item').length`), '| cards', await ev(`document.querySelectorAll('.cc-card').length`), '| patients listed', await ev(`document.querySelectorAll('.cc-patient').length`), '|', await text('.cc-hidden-note'));
    const toggleShowAll = () => ev(`(() => { const c=[...document.querySelectorAll('.overview-view input')][0]; const t0 = performance.now(); c.click(); return Math.round(performance.now() - t0); })()`);
    perf.showAll = await toggleShowAll();
    const listedAll = await ev(`document.querySelectorAll('.cc-patient').length`);
    perf.exceptions = await toggleShowAll();
    console.log('overview render ms: Show all', perf.showAll, `(${listedAll} patients) | exception-first`, perf.exceptions);
    perf.compact = await ev(`(() => { const c=[...document.querySelectorAll('.overview-view input')][1]; const t0 = performance.now(); c.click(); const ms = Math.round(performance.now() - t0); c.click(); return ms; })()`);
    console.log('compact render ms:', perf.compact);
    perf.drawer = await ev(`(() => { const b=[...document.querySelectorAll('.cc-patient, .attention-item')].find(x=>/\\(S1\\)/.test(x.textContent)) || document.querySelector('.attention-item'); const t0 = performance.now(); b.click(); return Math.round(performance.now() - t0); })()`);
    console.log('drawer open ms:', perf.drawer, '|', await text('.drawer-title'));
    await click('.drawer button', '✕');
    perf.more = await ev(`new Promise((r) => { const d=document.querySelector('.more-controls'); const t0 = performance.now(); d.addEventListener('toggle', () => r(Math.round(performance.now() - t0)), { once: true }); d.open = true; })`);
    console.log('more controls mount ms:', perf.more);
    await ev(`document.querySelector('.more-controls').open = false`);
  }
  if (m === 120) { await ev(`window.__nursingSim.runner.assignAdmission && Object.entries(window.__nursingSim.runner.state.patients).filter(([, p]) => p.admission?.status === 'pending').forEach(([pid, p]) => window.__nursingSim.runner.assignAdmission(pid, p.groupId, { userId: 'instructor', role: 'charge' })) || 1`); }
}
const avg = (a) => Math.round(a.reduce((s, x) => s + x, 0) / a.length * 10) / 10;
console.log('per sim minute ms: first 30 avg', avg(tickTimes.slice(0, 30)), '| last 30 avg', avg(tickTimes.slice(-30)), '| max', Math.round(Math.max(...tickTimes)));
const timeClick = (sel, text) => ev(`(() => { const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return 'MISSING ' + ${JSON.stringify(text)}; const t0 = performance.now(); b.click(); return Math.round(performance.now() - t0); })()`);
await sleep(1500);
console.log('phase at the end:', await text('.phase-btn.active'), '| summary cards', await ev(`document.querySelectorAll('.sum-card').length`));
console.log('summary re-render ms:', await timeClick('.phase-btn', 'Debrief'));
console.log('talking points render ms:', await timeClick('.sum-card .btn', 'Talking points'), '| points', await ev(`document.querySelectorAll('.point').length`));
console.log('full breakdown render ms:', await timeClick('.debrief-nav .btn', 'Full breakdown'));
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: `${out}/dl` });
console.log('CSV export ms:', await timeClick('button', 'Export CSV'));
await sample('end');
// Budgets for a 60-patient sim (ms). Each step of this soak jumps a whole sim minute, so "per sim minute" is the
// engine plus every screen re-rendering once (at 8x that happens every 7.5 s). The pure engine tick runs four times a
// second; a slow one would freeze every screen.
const budget = { engineTick: 20, perMinuteAvg: 150, perMinuteMax: 400, queue: 150, showAll: 400, exceptions: 300, drawer: 300, more: 800 };
const lastAvg = avg(tickTimes.slice(-30));
console.log('per sim minute (engine + screens) late avg', lastAvg, '| pure engine tick', perf.engineTick);
if (perf.engineTick > budget.engineTick) fail(`the engine tick takes ${perf.engineTick} ms (budget ${budget.engineTick})`);
if (lastAvg > budget.perMinuteAvg) fail(`a sim minute averages ${lastAvg} ms late in the sim (budget ${budget.perMinuteAvg})`);
if (Math.max(...tickTimes) > budget.perMinuteMax) fail(`a sim minute took ${Math.round(Math.max(...tickTimes))} ms (budget ${budget.perMinuteMax})`);
for (const k of ['showAll', 'exceptions', 'drawer', 'more']) if (perf[k] > budget[k]) fail(`${k} took ${perf[k]} ms (budget ${budget[k]})`);
if (perf.queue?.ms > budget.queue) fail(`attention queue took ${perf.queue.ms} ms (budget ${budget.queue})`);
console.log('status', await ev(`window.__nursingSim.runner.state.clock.status`), '| errors', JSON.stringify(errors.slice(0, 5)), errors.length); sock.close();
