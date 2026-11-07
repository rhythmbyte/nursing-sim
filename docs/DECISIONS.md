# Design decisions

A running log, newest first. Add an entry for any non-obvious choice, in the same commit as the change. Each entry records the date, the decision, why it was made, and the alternatives considered.

---

## 2026-11-07: The log is append-only and shared between session copies
- **Decision:** `engine/log.js` freezes each entry (and its details) when it's written; `engine/clone.js` copies the session for a change by deep-copying everything except the log, whose array is copied but whose entries are shared. Per-patient log lookups go through `entriesFor(log, pid)`, indexed once per log array.
- **Why:** the soak at 60 patients spent ~90% of its time deep-copying a 3,000-entry log on every action and tick. Freezing makes the shared entries safe: any code that tried to edit one would throw (none does; the tests run with it).
- **Also:** session saves are batched (0.25 s for actions, 1 s for clock-only changes, flushed on page close). Crash safety still has the IndexedDB mirror; the window of loss after an action is at most a quarter of a second.
- **Alternatives:** an immutable-data library (a new dependency, no build step allowed); copying only the touched patient (many transitions touch several parts of the session; a larger, riskier change).

---

## 2026-11-07: Past debriefs store seeds, not patients
- **Decision:** when a sim ends, `js/archive.js` keeps its session state, the scenario as it was and its case seeds (`ui.cases`); opening a past debrief instantiates the patients again from those seeds and mounts the normal debrief over a read-only runner. The last 12 are kept.
- **Why:** the seeds reproduce the patients exactly at a fraction of the size of 60 instantiated patient files, which matters in browser storage.
- **Caveat:** if a case file is edited afterwards, an old debrief shows the edited case's texts (the students' actions and flags are unchanged). The full build stores the instantiated patients with the session (SPEC §13).
- **Alternatives:** storing every instantiated patient (several hundred KB per sim); keeping only the newest debrief (the old behaviour: it was replaced by the next sim).

---

## 2026-11-07: A program changes defaults and what's offered, never the content
- **Decision:** `engine/program.js` applies the chosen program when data loads: scenario defaults get the program's settings, and tools, interventions and helper roles it doesn't use are marked `offered: false` instead of removed. Cases and saved sims are offered by patient tags / the sim's `program`.
- **Why:** removing catalog entries would break any case or sim that uses them (a shared case, an older sim, a different program's demo). Marking keeps one engine for every program and puts the scoping where instructors see it.
- **Alternatives:** separate catalogs per program (duplicated content that drifts); hiding by CSS (not testable, leaks into dropdowns).

---

## 2026-11-07: Browser suites use raw DevTools from Node, no test framework
- **Decision:** the browser suites in `tests/browser/` drive headless Chromium over the Chrome DevTools Protocol with Node's built-in WebSocket (`lib.mjs`), run by a shell script (`all.sh`). A suite fails on any page error or warning, a missing click target, or a throwing evaluation, as well as its own checks.
- **Why:** no npm dependencies or build step (the project has none), and the suites can kill and relaunch the browser for the crash tests, which test runners make awkward. Failing on any page warning catches problems a check didn't look for.
- **Alternatives:** Playwright or Puppeteer (a large dependency and a package.json for a static prototype); keeping the suites outside the repo (they drifted when screens changed).

---

## 2026-11-07: Skip should-recognize points only when every reflecting student mentions them
- **Decision:** a should-recognize talking point is left out when all students in the group who submitted a reflection mention it (keyword match), and stays visible on request with who mentioned it. Configurable (`all` / `any` / `off`) in `debrief-points.json`.
- **Why:** the match is a reading aid with false positives; skipping only when everyone covered it keeps the discussion when one student missed it, and nothing is ever lost (one click brings it back).
- **Alternatives:** skip if anyone mentions it (shorter list, but hides the student who missed it); never skip (the original behaviour, a long list).

---

## 2026-11-07: Debrief talking points are generated from evidence, worded from data
- **Decision:** `engine/talking-points.js` turns the group's existing evidence (flag rules, timeliness rows, delegation waits, penalty log, the cases' should-recognize items) into points; the sentence for each kind and the theme it belongs to come from `data/catalogs/debrief-points.json`. Each point has a stable id (for ticks and hides, stored per join code) and an evidence link (student + breakdown section).
- **Why:** no new scoring logic, so the talking points can't disagree with the flags and tables; the instructor can rewrite the prompts without code (B1).
- **Alternatives:** hand-written prompts per case (doesn't cover what actually happened); free-text AI summaries (not reproducible, not available offline in the prototype).

---

## 2026-11-07: The Instructor tab is phases, not views; authoring is a separate tab
- **Decision:** the Instructor tab shows one phase picked from the clock (ready → Setup wizard / Ready, running or paused → Overview, ended → Debrief); the instructor can still open the debrief early. Patient editor, library and review queue moved to a **Builder** tab hidden while a sim runs. The Overview reuses the Live control panels with a patient / student / group filter inside a drawer, and keeps the whole Live control under a collapsed "More controls", so no feature was removed.
- **Why:** instructors running a class need one calm screen; authoring tools mid-sim were a way to get lost (and edits mid-sim don't reach the running sim anyway). Reusing the panels keeps one implementation per action.
- **Alternatives:** a new drawer UI written from scratch (duplicated logic and drift); keeping the sub-view tabs and hiding some (still too many places to look).

---

## 2026-11-07: Case templates are instantiated upstream of the engine
- **Decision:** `engine/cases.js` turns each case into a concrete patient (seeded PRNG, placeholders filled, ranges and classes resolved, relative changes made absolute) *before* the runner is created. Everything downstream (engine, rules, timeliness, screens, debrief) sees an ordinary patient. Seeds: the sim's seed (`ui.cases`, via `js/case-seeds.js`), a per-patient reroll, or the case's locked seed.
- **Why:** no engine module had to learn about variation, so allergy checks, PRN rules, hold parameters and timeliness all use the instantiated drug and values automatically. The variant check can reuse the real dry run.
- **Alternatives:** resolving placeholders at render time (every screen and rule would need the context, and a missed one would leak `{firstName}` or the wrong drug); storing the generated patients in the session (bigger saves, and edits to the case wouldn't reach a sim that hasn't started).
- **Round trip:** instantiating with the file's own name, age and sex and the written values reproduces the original file exactly, so tests and the demo keep their known patients.

---

## 2026-11-07: Every save is mirrored to IndexedDB
- **Decision:** `storage.save` writes localStorage (synchronous, what the app reads) and also IndexedDB (best effort), with a timestamp for each. At boot, `restoreBackup()` copies IndexedDB entries newer than localStorage's back.
- **Why:** the kill tests lost the last seconds of work because Chromium flushes localStorage to disk in ~5 s batches; IndexedDB commits at once. This keeps the one-file storage boundary (B2) and the synchronous API.
- **Full build:** the server is the source of truth (SPEC §13); this mirror stands in for "acknowledged by the server".

---

## 2026-11-07: Rejoin by name with a device token; approval when the token is missing
- **Decision:** `joinSim` treats a known name as a rejoin. The same device, or a device holding that student's rejoin token (issued at the first join, kept in storage per code and name), rejoins at once. Otherwise a request goes to Live control, and approving it switches the requesting tab to that student (`device.<tab>` mapping).
- **Why:** A student who loses a tablet mid-sim must not lose their patients, timers or debrief history, and must not appear twice. In the full build the login does this (SPEC §13); the token is the prototype stand-in.
- **Note:** names are the rejoin key here, so two students with the same name need distinct names when joining.

---

## 2026-11-07: Drafts are generic form snapshots, restored in document order
- **Decision:** `formDraft(container, key)` saves every field's value by a stable key (data-draft, aria-label, name, or position) and restores them in order, firing input/change. Then a dropdown that builds more fields (the guided event type, the When trigger) creates them before their own values are restored. Single fields use `textDraft`; the patient editor saves its working copy as JSON.
- **Why:** One mechanism covers a dozen forms without each one knowing about drafts. Restoring in order handles the dynamic forms.
- **Limits:** chip-style controls (patient tags) aren't inputs and aren't restored mid-edit. Drafts are per browser in the prototype.

---

## 2026-11-07: Memoize timeliness and flags per state; coalesce heavy re-renders
- **Decision:** session states are immutable, so `timelinessItems` and `evaluateRules` cache their result per (state object, sim minute) in a WeakMap. The Command center and Live control re-render through `coalesce` (at most every 250 ms).
- **Why (soak test, 4-hour sim, 3 groups):** before, one Command center render took 51 ms and every action re-rendered it; it called timeliness about six times per render. After: 7 ms, with renders capped. Memory stayed flat (heap 2.2 → 4.3 MB over 811 log entries). The remaining ~30 ms per action is the synchronous clone and save of the 286 KB session, which "save everything instantly" requires.
- **Full build:** the server owns the log; screens get incremental updates instead of re-deriving everything from the whole log (SPEC §13).

---

## 2026-11-07: Paused tasks are set aside, not frozen in place
- **Decision:** `pauseTask` moves the current task to `students[uid].pausedTask` with its time left and frees the student; `resumeTask` makes it current again. A task keeps `activeMin` and `runFrom`, so finished minutes and the debrief count active time only.
- **Why:** Pausing exists so the student can deal with something else. Freezing the busy lock would defeat that. One paused task at a time keeps it simple to follow (and to grade).

---

## 2026-11-07: Task timers default to manikin mode
- **Decision:** `taskTimerMode` defaults to `manikin` (short lockout), not `screen-only`.
- **Why:** In class the real task happens on the manikin, so the screen lockout only needs to stop rapid-fire charting. Full screen-only waits made the demo slow (an 8-minute head-to-toe at 1x). Sims without manikins choose screen-only in Sim setup.

---

## 2026-11-07: Delegation goes to helpers with their own time
- **Decision:** `state.staff` holds helpers per group, built from `settings.staffPool` and the group's `staff`. `placeDelegation` gives a task to a free helper of the requested role (time = task duration × speedFactor + travel, the same durations as task timers) or throws `NoHelperError` with the next free time. Queued tasks start in order when the delegation processor frees a helper. Charge and instructor controls change the pool, all logged.
- **Why:** A limited pool makes delegation a real prioritization choice and limits spamming naturally. One duration source serves both students and helpers.
- **Replaces:** `delegationDelayMin` (a flat delay with an unlimited pool).

---

## 2026-11-07: Timed tasks apply their chart action when they finish
- **Decision:** `runner.chart` asks `engine/tasks.js taskPlan` whether the call is a timed task. If it is, the student gets `students[uid].task` and `taskProcessor` runs the original chart action at `endsAt` (`ctx.atMin`), followed by `task-finished`. Interrupting logs `task-interrupted` and applies nothing; the instructor's End now applies it immediately.
- **Why:** One switch point means every chart action (orders, timeliness, reactions, penalties, assessments) automatically counts work at the finish, with no per-feature changes. The processor's `nextAt` keeps finishes in time order with everything else.
- **Alternatives:** Log at the start and back-date (rules would see work before it happened), or a busy flag only in the UI (can be bypassed, and timeliness would be wrong).

---

## 2026-11-07: Patient tags are a separate catalog with any-within, all-across matching
- **Decision:** `patient-tags.json` groups → tags; patients store `patientTags { group: [tags] }`. One pure matcher (`engine/patient-tags.js matchesTags`) serves the library filter, the Sim setup counts and `fillByTagCounts`. A group's own filter replaces the sim-wide choice only in the tag groups it sets.
- **Why:** "RN AND (Med-surg OR Surgical)" is how instructors describe a pool. One matcher means the counts shown always equal what the randomizer can pick. The name "patient tags" keeps it apart from the triage tag (B11 answer key).
- **Alternatives:** Free-text keywords (typos, no grouping), or a single list of tags (can't express AND across kinds).

---

## 2026-11-07: One guided event form with converters per place
- **Decision:** `guided-model.js` defines one event shape and converts it to what each place stores: change-model forms (keyframes, starts, orders, kept events), reaction effects, state fields, and runner calls for Live control. `guided-form.js` is the only event form. Per-vital durations were added to `setVitalsTarget` (`overMinBy`) instead of separate trends.
- **Why:** The same form everywhere means one place to fix and one way to think. Round-trip tests over every starter event prove nothing is lost. "From" uses the real dry run, so it shows what the patient will actually be.
- **Alternatives:** Four separate forms (they had already drifted). Several parallel trends per patient (bigger engine change, more ways to conflict).

---

## 2026-11-06: Assessment tools are catalog data; expected answers live in session state
- **Decision:** Tools, items, points, bands and licenses are one catalog. Scoring is pure (`assessment-score.js`). The patient's current answer key is session state (`assessmentsExpected`), changed by the same paths as vitals and findings: baseline, script states, scenario-change events and reaction effects. A charted assessment logs the student's answers together with a snapshot of what was expected, so the debrief and `assessment-mismatch` compare against the truth at that moment. Required reassessments are timeliness items, so the Command center, debrief and rules share one definition.
- **Why:** Adding a tool is data only. The comparison can't drift if the script changes later. B11 still holds: student screens get the answer key only through `revealItem` (one item, and only when the sim reveals findings) and auto-calculated NEWS2.
- **License caution:** tools that aren't clearly public are flagged and left out of default sims; their wording is paraphrased. Confirming licenses is listed for the full build (SPEC §13).
- **Alternatives:** Tools as interventions with chartFields (no scoring, bands or reveal), or a separate per-tool timing rule (would disagree with the Command center).

---

## 2026-11-06: Recovery penalties limit scripted targets, never worsening
- **Decision:** Penalties are effects earned by reactions, stored on the patient (`patients[id].penalties`). Every scripted vitals target passes through `penalizeTarget` (the same path for state entry and vitals effects). The unpenalized target and the starting point are kept (`scriptTarget`), so wear-off and instructor changes recompute from where the recovery began. A once-a-minute processor moves the patient as penalties fade.
- **Why:** One place does the math, so Live control, the dry run and the debrief agree. Keeping the starting point means a penalty fading from 40% to 0 ends at the full target instead of creeping. Limiting only recovery keeps "deterioration from neglect is reversible by the right treatment" true; only a scripted code or death is final.
- **Details:** Caps mean "recovers no further than" in whichever direction is recovery (instructor to confirm, SPEC §14). Penalties don't affect the instructor's own Adjust vitals.
- **Alternatives:** A per-state "penalized target" (duplicated numbers in data, couldn't stack or wear off).

---

## 2026-11-06: The script builder is a form over a pure model; the dry run reuses the real session
- **Decision:** `script-model.js` / `script-model-reactions.js` convert between forms and `template.script` (pure, tested: every starter reaction round-trips unchanged). The modals only build forms. "Test this patient" calls `engine/reactions/dry-run.js`, which runs the real session, chart actions and processors on a private copy.
- **Why:** What the dry run shows is exactly what the live sim will do. Form bugs show up in Node tests, not mid-class.
- **Details:** A `where` with several fields per alternative can't be shown in the form; it's kept as-is unless the instructor adds field tests. Templates carry findings as text (`findingsText`), because finding-change ids are per patient.

---

## 2026-11-06: Reaction scripts run as a processor and reuse event types for effects
- **Decision:** `engine/reactions.js` is a session processor. It reads triggers from the log (student actions, events fired, reactions fired) and from `vitalsHistory` (thresholds), and it adds its own deadlines ("N min without X"). Processors may report `nextAt`, so the session stops at that moment first and everything stays in time order, including during Skip and catch-up. Effects reuse the event-type registry (call light, staff message, new orders, lab result, code) and `setVitalsTarget`, instead of a second copy of each.
- **Why:** One path for every trigger, the same in live sims and the dry run. Nothing new for the screens or chart actions to call, and no copied effect logic.
- **Details:** Elapsed countdowns restart when scripting is resumed. A skipped countdown re-arms only when its anchor happens again (for example, the state is entered again). Instructor "Fire now" ignores conditions but still counts as a fire and still chains. `recordVitals` now appends a second change in the same minute instead of overwriting the first, because the script must see every change.
- **Alternatives:** Calling reactions from each chart action (misses thresholds and timeouts, and is easy to miss in new actions). A separate effect implementation (would drift from the event types).

---

## 2026-11-06: One timeliness helper feeds the command center, debrief and timing rules
- **Decision:** `engine/timeliness.js` turns work into items `{ kind, patientId, startAt, doneAt, minutes, tag }` using `rules.timeliness` thresholds (per tier; scheduled meds; call lights; alarms), the shared timed-order definition (`timeliness.tracking`) and the active log (struck entries don't count). tier-timeout, call-light-response and alarm-response map late → amber (or the tier's severity) and very late → red from these items. `engine/command-center.js` summarizes per group with a data-driven status rule; `debriefTimeliness` gives the per-student table. parameter-breach keeps its per-order window (it's part of each order's data).
- **Why:** Three screens and three rules used to compute lateness separately. Now they share one function and can't disagree.
- **Alternatives:** Command-center-only lateness logic (would drift from the flags).

---

## 2026-11-05: One writer window via a storage lock
- **Decision:** `js/window-lock.js` keeps `{ id, at }` in storage (via `storage.js`), refreshed every 2 s by the writer window. A window that sees a fresh lock it doesn't own becomes read-only: the tick, saves, heartbeat and pause-on-close are all gated on `isWriter()`, and a non-dismissable notice offers Take over. Read-only windows never claim a lock on their own; they offer Continue once it's free or stale (> 6 s). Take over skips the lock release during its own reload. The window id lives in sessionStorage so a reload keeps it.
- **Why:** Two windows writing one session overwrote each other (last write wins).
- **Alternatives:** BroadcastChannel leader election (more moving parts for the same result); merging writes (no real-time merge without a server). Full build: the server decides who controls a sim (SPEC §13).

---

## 2026-11-05: Reflection coverage is a keyword aid, not grading
- **Decision:** `reflectionCoverage` marks a should-recognize item "possible mention" when the reflection shares 2+ significant words with it (or one word of 8+ letters), ignoring a short stop-word list. The UI says it's a reading aid.
- **Why:** It helps the instructor scan quickly without pretending to judge clinical reasoning. Real grading of free text would need the full build's AI (with instructor review) or the instructor's own judgment.

---

## 2026-11-05: Standalone monitor follows the session in storage, read-only
- **Decision:** `?monitor=<pid>` mounts only `screens/monitor/standalone.js`, which loads the saved session (`storage.load`) and re-renders on `storage.onExternalChange` (the browser's storage event) plus a 2 s refresh. It never writes, so two tabs can't race over the session.
- **Why / limits:** Works for a second screen on the same device and browser only. A monitor on a different device needs the full build's realtime channel (SPEC §13).

---

## 2026-11-05: Monitor alarm episodes are tracked by the engine
- **Decision:** A tick processor (`engine/monitor-alarms.js`) compares each patient's `monitorView` alarms with the last recorded set and logs `monitor-alarm` on changes. An episode runs from first alarm to all-clear. **Silence alarm** (`acknowledgeAlarm`) logs the response time once per episode and silences the sound for `alarmSilenceMin`; the visual alarm stays. The `alarm-response` rule and the debrief read episodes from the log. It lives in its own module so `session.js` can list the processor without an import cycle at load time. Session shape v13.
- **Why:** Alarm response is gradable only if the engine, not the display, knows when alarms started. Thresholds and silence length are clinical, so they're data plus SPEC §14 questions.

---

## 2026-11-05: "Entered in error" strikes, never deletes
- **Decision:** `strikeEntry` (own entries only, reason required) records `state.struck[logId]` plus an `entered-in-error` log entry. One helper, `engine/struck.js activeLog/withoutStruck`, gives rules, PRN checks and debrief comparisons the log without struck entries. The timeline keeps them, marked. Flowsheet rows link to their log entry so they strike too. Order progress or findings revealed by a struck entry are not undone.
- **Why:** It matches real charting practice (corrections are visible and auditable), and the debrief can discuss the mistake.
- **Alternatives:** Deleting entries (loses the audit trail); undoing order progress (ambiguous when other work also counted). Session shape v11.

---

## 2026-11-05: Bedside monitor: engine view + reusable display module
- **Decision:** `engine/monitor.js monitorView()` decides what may be shown (connections, rhythm via catalog aliases, alarms from `vitals.json alarmLimits`). It never includes pain or GCS, and temp only with `monitor.tempProbe`. The display lives in `js/screens/monitor/`: `waveforms.js` (pure ECG and pleth math from `rhythms.json draw`) and `bedside-monitor.js` (canvases and tiles, with one shared requestAnimationFrame loop that skips frames when the page is hidden or the sim isn't running). Codes set the monitor rhythm from the code's rhythm name, and ROSC / no ROSC use settings (`roscRhythm`, `noRoscRhythm`). Connection comes from catalog `monitorConnects` (tele → ECG, continuous pulse ox → SpO₂, NIBP cycle) or the student's logged Connect to monitor.
- **Why:** Clinical and drawing choices stay in data, and the display can move unchanged to the full build (or a separate monitor device).
- **Alternatives:** Per-monitor animation loops (wasteful; can't pause together); SVG (slower for continuous sweeps).
- Session shape v10.

---

## 2026-11-05: Broken-reference checks, visible save failures, end of shift
- **References:** `engine/integrity.js` checks that every id points at something: order interventions, lab codes, activeOnEvent, PRN pre-checks, parameter watch/requires, event keyframes, finding changes and order sets, lab forOrder, code-branch interventions, and scenario patients and groups. The loader and the tests run it.
  - A broken browser edit is skipped and the file version stays (found in testing: excluding the patient cascaded into excluding the scenario, and the app wouldn't start).
  - A scenario runs without missing patients and is dropped only if none are left.
  - The Instructor tab shows every problem with the field and the missing id.
- **Save failures:** `storage.save` reports failures, including blocked storage, which used to "succeed" silently, to `onSaveFailure` listeners. `main.js` shows a sticky banner that explains "full" vs "blocked" and stays until dismissed.
- **End of shift:** `session.endMin` comes from the scenario's `endClock`. A tick that reaches it fires everything due up to the end, then ends the clock exactly at the end (`clock-end`, reason `end-of-shift`, with an alert to everyone). `nextEventMin` ignores events after the end. Sim clocks show the time remaining. Sim setup has an optional Shift end. Session shape v9.

---

## 2026-11-05: Scenario changes: the editor's unit for scripting
- **Decision:** The editor presents a patient's events as **scenario changes**: one per linked-event group (an ungrouped event is its own change). The builder form (time or instructor-triggered, how it starts, message, vitals, findings, orders with tiers, what to recognize) is converted by `change-model.js` into a call-light/staff-message event, a vitals-change plus keyframe, a findings-change plus finding change, a new-orders event plus order set, and `debrief.byChange[group]`. Saving reuses existing event ids and keyframe/finding ids, keeps extra payload, vitals and keyframe fields, and keeps unmanaged event types (admission, code, lab-result) and retimes them with the change.
- **Why:** It mirrors how the instructor writes cases, and nothing technical shows. A round-trip test proves that every starter change opened and saved in the builder leaves the patient unchanged. That test caught real data loss (GCS and notes fields in keyframes) before it shipped.
- **Alternatives:** Editing events one by one (the instructor would have to understand groups, keyframes and order sets).

## 2026-11-05: No JSON in the normal editor workflow
- **Decision:** Labs and orders are editable tables (add/remove). Outcome, code branch and review notes are fields. Events, keyframes and finding changes are scenario changes. The editor works on a copy with an "Unsaved changes" badge. "Advanced: edit JSON" is a collapsed section for fields without a form (PRN limits, parameter orders).
- **Full build:** AI conversion of a pasted case write-up into a draft patient (SPEC §13), everything tagged proposed.

---

## 2026-11-05: Live vitals control with a single vitals history
- **Decision:** The instructor can adjust any vital now or trend it over N minutes. Numbers and BP step linearly once per sim minute (the trend processor runs before the monitor). Text values (O₂ device, pain description) change at once. Every change goes into `vitalsHistory`, and the monitor and delegated reports read `vitalsAt()` at their reading time. Parameter rules use the history instead of re-deriving scripted keyframes from the log. Logged as `vitals-adjusted` (old → new, over, preset).
- **Scripted vs. live:** the next scripted vitals event applies and ends the instructor's trend (`settings.scriptedVitalsAfterInstructor: "apply"`); `"skip"` keeps the instructor in control (SPEC §14 Q22).
- **Presets are data:** relative presets with limits in `vitals-presets.json` (proposed); absolute patient presets in patient JSON `vitalsPresets`. None added to patient files (clinical content is the instructor's).
- **Why:** The debrief compares charted values with what the vitals actually were, so live changes must reach every reader. One history makes that true by construction.
- **Alternatives:** Re-derive vitals from the log on demand (the old parameter-rule approach; can't represent trends); per-tick recording (too many history rows).
- Session shape v8.

---

## 2026-11-05: Instructor tags are hidden by role; students assign their own priorities
- **Decision:** `settings.showTagsTo` (default `["instructor"]`) replaces `showTagsToStudents`. One helper, `canSeeInstructorTags(settings, role)`, gates every tag display: student home, chart, admissions board, unit overview (column and priority-mismatch flags). The instructor playing charge counts as the instructor. Students, and a student charge nurse for admissions, set their own priority on `settings.priorityScale` from `data/catalogs/priority-scales.json`. Every change is logged and kept as history. Instructor tag changes (code → `codeTag`, ROSC → `roscTag`) are kept in `tagHistory`, so the debrief and the `priority-mismatch` rule compare at each moment.
- **Why:** Prioritization is the skill being taught, so the answer key can't be on screen. The instructor hasn't chosen a triage system (SPEC §14 Q18), so scales are data, and each level says which instructor tags it matches (works for ESI or acuity too).
- **Alternatives:** Students pick the instructor's tag colors directly (ties the UI to one system); compare only the latest priority (misses "re-triaged too late after the code").
- **Also:** any rule can now be switched off with `enabled: false` in rules.json. UI convenience only: tags are still in the downloaded JSON (SPEC §13). Session shape v7.

## 2026-11-05: Welcome popup is prototype-only and data-driven
- **Decision:** "Welcome to RN sims!" / "Built by paramedics." from `data/catalogs/ui.json`, shown once per browser session (`storage.saveSession`, i.e. sessionStorage via storage.js). Esc or the button closes it. Marked for removal in SPEC §13.

## 2026-11-05: Stop the app before reloading data
- **Decision:** `reloadData()` tears down the running app (tick, heartbeat) before fetching. Found in testing: the old tick saved the previous sim's session after Create sim cleared it.

---

## 2026-11-05: Review pass fixes (after phase 7)
- **Boundary fixes:**
  - Notes quick actions come from the catalog (`quickAction`), not ids in `notes.js` (B1).
  - Code/ROSC alert text moved to `settings.messages` (no clinical text in JS).
  - The "new orders" count lives in one engine helper (`newOrderCount`) instead of three screens.
- **Bugs fixed:**
  - Saving an edit, approving or creating a sim remounted the app and re-ran the crash-recovery pause, which paused and rewound a running sim by up to 5 s. That pause now runs only at a real page load.
  - A saved session that references a missing patient is discarded with a warning instead of crashing.
  - Debrief CSV adds a local wall-time column next to UTC.
- **Kept as is:** `Math.random`/`Date.now` appear in the engine only as overridable defaults (B4 still holds; tests pass their own). Generic fallback text in event types ("Call light on", "New orders") is UI copy, not clinical content.

---

## 2026-11-05: Admissions go to the charge nurse's board when the role is on
- **Decision:** With `settings.chargeNurse` not `off`, an admission waits on the admissions board (not present to students) until the charge nurse assigns it to a group or holds it. Decisions are logged with the wait time (`admission-assigned`, `admission-held`, role `charge`). With `off`, it goes straight to its scenario group. Orders that arrived while the patient waited are re-based to the assignment time (`orderedAtMin` keeps the original), so tier timeouts don't count time no student could act on.
- **Why:** SPEC §9. Fairness of timing flags.
- **Alternatives:** Count from the original order time (would flag students for a patient they couldn't see). Whether board wait time itself should be graded is a question for the instructor (SPEC §14 Q17).
- Session shape v6.

---

## 2026-11-05: B3 extended to cover instructor saves (approved by the project owner)
- **Decision:** Boundary B3 now reads "`data-loader.js` is the only file that knows where data comes from **and where instructor edits go**". Patient, scenario and catalog edits save through `saveLocal`/`saveLocalCatalog` there (which use `storage.js`).
- **Why:** It still protects the single swap point: the full build replaces this one module with API reads and writes. This change was made before asking; the owner reviewed it afterwards and approved keeping it.
- **Alternatives:** A separate library-store module (two places to swap, and B3 would no longer be true as written).

## 2026-11-05: Catalogs in the review queue; Reset demo
- **Decision:** The review queue also lists each catalog's proposed items (Approve, Export JSON, Revert to file). Approvals save in this browser like patient edits. A header **Reset demo** button stops the tick and heartbeat, clears every app key in storage (`storage.clearAll`) and reloads.
- **Why:** Catalog values (rule thresholds, delegability, vitals settings, defaults) are instructor decisions too. Reset gives a clean slate before showing the demo.

---

## 2026-11-05: Instructor edits save in the browser; publishing is export + commit
- **Decision:** Patient edits, approvals and new sims are validated and saved through `data-loader.saveLocal()` (`storage.js`), and overlay the files at load. Each local item can be exported, reverted (to the file) or deleted (browser-only items).
- **Why:** A static GitHub Pages site can't write files. Keeping reads and writes in `data-loader.js` leaves B3 intact (the B3 wording was extended to say so, without changing what it guards).
- **Alternatives:** GitHub API writes from the browser (needs a token in the page; not safe on a public site); waiting for the backend (the full build does this properly).

## 2026-11-05: Roster replaces the interim slot mapping
- **Decision:** Students join with a 6-character code (no 0/O/1/I). Manual mode matches a named roster; random mode places them in a random group with open slots and never over-fills, and overflow alerts the instructor. The roster drives student screens, flag responsibility and the debrief.
- **Why:** SPEC §10. Supersedes "Interim student-to-group mapping".

## 2026-11-05: Ad-hoc orders live in session state and merge into effective templates
- **Decision:** `pushOrder` stores orders under `state.adhoc[pid]`. The runner passes `effectiveTemplates()` (file + ad-hoc) to every engine call, and student screens rebuild their views when it changes.
- **Why:** The patient file stays untouched (it's content), the order is part of this sim's record, and rules and the MAR treat it like any other order.

## 2026-11-05: Patient editor: forms for simple sections, JSON for nested ones
- **Decision:** Demographics, H&P, SBAR, baseline vitals, findings, debrief lists and an orders table (text/type/tier/set/delegable) are form fields. Labs, events, vitals changes, finding changes, outcome, code branch and review notes are JSON text areas. Everything is validated with the patient schema before saving.
- **Why:** Covers the edits the instructor makes most often without building a large nested form builder for the prototype. Worth a proper UI in the full build.

## 2026-11-05: Sim setup is one sectioned page, not a step-by-step wizard
- **Why:** Same inputs as SPEC §8.3 with less code. Every value can be seen and changed at once. Tag-count groups are filled by the randomizer on Create, and the saved scenario stores the actual patients picked.

---

## 2026-11-05: No setting or clinical defaults in code
- **Decision:** All scenario-setting defaults live in `data/catalogs/scenario-defaults.json` and are merged under each scenario's settings at load (`engine/settings.js`). Monitor vs. manual vitals fields and NIBP cycle choices live in `data/catalogs/vitals.json`, and the lab delay fallback in `labs.json`. New settings: `prnPreCheckWindowMin` (15) and `delegatedAssessmentRevealsFindings` (false; when true, findings appear when the staff member reports back). Missing data throws a clear error rather than using a hidden constant.
- **Why:** The CLAUDE.md clinical-defaults rule. The instructor (or the phase 6 setup wizard) can see and change every default in one place. SPEC §14 Q5, Q13–15.
- **Alternatives:** Keep fallback constants in code (invisible to the instructor); require every scenario to list every setting (verbose, and old scenarios break when a setting is added).
- Session shape v4 (settings keys changed).

---

## 2026-11-05: Flags are recomputed from the log, never stored
- **Decision:** Rules are pure `evaluate(state, ctx)` functions. Live control and the debrief call `evaluateRules` when they render (live control each sim minute), and nothing is written to state.
- **Why:** Flags can't drift from the log, there's no de-duplication or undo, and late or time-based flags ("still not done", "unanswered for 7 min") fall out naturally. The full build can run the same functions on the server.
- **Alternatives:** Evaluate on each log append and store the flags (SPEC's original wording). That needs de-duplication and re-evaluation when time passes, for the same result.

## 2026-11-05: Rule thresholds, severities and allergy classes are data (`rules.json`)
- **Decision:** `data/catalogs/rules.json` (proposed) holds every rule's thresholds and severity, the allergy drug classes, the code-response interventions and the vitals-compare tolerances. Scenarios override per rule with `settings.rules.<id>`.
- **Why:** These are clinical and grading choices the instructor owns (CLAUDE.md). See SPEC §14 questions 7–11.

## 2026-11-05: Which orders the timing and priority rules track
- **Decision:** One-time orders plus PRNs switched on by an event (e.g. "ECG now" on the chest-pain call light). Shift-start orders aren't timed by default. "Done" means the first own charting for the order (or its intervention without picking the order), a completed delegation, a med given, or Mark done (`firstWork` in `engine/orders.js`).
- **Why:** Standing PRNs, continuous and parameter orders are never "done", so including them would flag everything. Shift-start orders would all time out in the first minutes.
- **Alternatives:** Track every order (all noise); require "For order" on every charting (students forget, and the fallback covers it).

## 2026-11-05: Flag responsibility
- **Decision:** A flag tied to an action goes to whoever did it. A time-based flag (timeout, unanswered light, missed parameter) goes to every student in the patient's group. "Left unattended" goes to the group's students.
- **Why:** With the interim one-student-per-slot mapping this is exact. With shared groups, whether everyone owns a missed action is an instructor question (SPEC §14 Q11).

## 2026-11-05: Debrief data is built by a pure engine function
- **Decision:** `engine/debrief.js` builds everything the debrief shows. The screen and the CSV only render it.
- **Why:** Testable in Node, and the full build can produce the same report server-side (e.g. emailed or stored per student).

---

## 2026-11-05: Monitor BP readings satisfy the BP pre-check (supersedes the earlier decision)
- **Decision:** The project owner changed this. A monitor BP (cycle or "Take BP now") within the window counts as the "BP before nitro" check. It's data-driven: the catalog marks the BP check `satisfiedByMonitor: true`, and `prnOptions()` in `engine/prn.js` builds the check options in one place for every caller. "Take BP now" adds a monitor reading immediately, is logged as `nibp-now` (student), and doesn't change the auto cycle.
- **Why:** Charting a separate BP when the monitor just took one is busywork. Still an open instructor question (SPEC §14).
- **Alternatives:** The previous rule (only a charted BP counts). Revert by setting `satisfiedByMonitor` to false in the catalog.

## 2026-11-05: Scripted labs can be reserved for one order (`forOrder`)
- **Decision:** A pending lab with `forOrder` is drawn only by that order. Linda's scripted 4.1 repeat lactate belongs to the STAT sepsis order, so drawing the "2–4 h repeat" order gives an unscripted result for the instructor to fill in.
- **Why:** Otherwise whichever lactate order was drawn first took the scripted value, and the sepsis story depends on the STAT one.
- **Alternatives:** Ordering rules in code (clinical logic in JS, breaks B1).

## 2026-11-05: Clinical-practice choices are data or settings, and are questions for the instructor
- **Decision:** (CLAUDE.md rule) Pre-checks, timing windows, delegability, tiers and thresholds get a reasonable default as a data field or scenario setting, plus a SPEC §14 question. They're never hard-coded and never treated as final.
- **Why:** The instructor decides clinical scope and correctness.

---

## 2026-11-05: Monitor values always come from the device; manual vitals reveal is a setting
- **Decision:** BP/HR/SpO₂/O₂ are never typed. They come from the patient's current vitals via the monitor cycle or a charted vital-signs check. Temp/RR/pain are typed. With `settings.revealManualVitals` on (the default), a Measure button fills them with the scripted values. With it off, nothing is revealed (delegated staff report only monitor values too), and the student gets them from the manikin or instructor. The log keeps a scripted snapshot so the debrief can compare charted vs scripted values.
- **Why:** On-screen demos need values to come from somewhere, while live classes with a manikin need the student to measure.
- **Alternatives:** Always typed (unusable without a manikin); always revealed (no measurement skill in class).

## 2026-11-05: Monitor-cycle readings don't satisfy PRN pre-checks (SUPERSEDED)
- **Decision:** A required check like "BP before nitro" is met only by the student charting it (a BP, or full vitals, which `include` a BP) or a completed delegated check, within `requiresWithinMin` (default 15). A q15 cycle reading from 14 minutes ago doesn't count.
- **Why:** The teaching point is checking BP right before giving nitro. **Open question for the instructor** (SPEC §14).
- **Status:** superseded the same day by "Monitor BP readings satisfy the BP pre-check".
- **Alternatives:** Count any BP in the window, including monitor readings.

## 2026-11-05: Delegation effects happen when staff report back
- **Decision:** Delegating queues a task due after `settings.delegationDelayMin` (number or `{ LPN, CNA }`, default 10). At completion the staff member posts a staff message, and vitals/labs/order effects apply at that time. A request alone doesn't count for PRN pre-checks. The request is logged as `intervention` with `delegatedTo`, and completion as `delegation-completed` (role `staff`).
- **Why:** Delegation has a real cost (time) and visible results, and the debrief sees both when it was delegated and when it got done.
- **Alternatives:** Instant completion (delegation would be free); the instructor completing tasks by hand (too much work live).

## 2026-11-05: Labs start their delay when drawn; null results wait for the instructor
- **Decision:** Pending labs that an order can draw start undrawn, and the delay runs from the draw. A second draw of a code with no scripted result creates an "unscripted" lab. Labs with no value raise an instructor-only alert when due and are released from Live control with a value.
- **Why:** Matches SPEC ("pending until resultDelayMin passes") and the data (Robert's repeat troponin has no scripted value).
- **Alternatives:** Delay counted from sim start (labs would result before they were drawn); inventing a value (clinical content, not ours to choose).

## 2026-11-05: Timed work runs as processors interleaved with events
- **Decision:** Monitor cycle, lab results and delegated tasks are processors in `session.advance()`, run up to each event's instant before that event fires.
- **Why:** Correct values at shared instants (e.g. a reading at 08:15 after the 08:15 vitals change) and correct catch-up after Skip.
- **Alternatives:** Running processors after all events (catch-up readings would all show the newest vitals).

## 2026-11-05: Session shape v3
- **Decision:** Added `settings`, and per patient `flowsheet`, `monitor`, `delegations` and lab draw fields, so `SESSION_VERSION` is 3 and older saves are discarded.
- **Why / alternatives:** Same as v2.

---

## 2026-11-05: PRN limits warn and log instead of blocking
- **Decision:** Giving a PRN beyond its max, before its interval, or without its required pre-check (e.g. a BP within 15 min before nitro) opens a warning. The student can cancel or "Give anyway". The dose is logged with the warning codes.
- **Why:** A sim should let students make the mistake so the debrief can catch it. A hard block hides the decision. The `prn-limit` rule (phase 5) flags these doses using the same `engine/prn.js` helper.
- **Alternatives:** Hard block (SPEC §6 says "enforced"; this is the softer reading. **Confirm with the instructor**, SPEC §14); no warning at all (too easy to miss in a demo).
- **Update:** Confirmed by the project owner: keep warn-and-override, log it, and make every override a **red** flag in the debrief (prn-limit rule, phase 5).

## 2026-11-05: Findings are revealed by assessing, and copied into session state
- **Decision:** Catalog interventions with `revealsFindings: true` (focused and head-to-toe assessment) copy the baseline findings, plus any finding changes that have fired, into `patients[id].revealed` with a time. A delegated assessment reveals nothing. The Summary never hints that unrevealed changes exist.
- **Why:** Students must reassess to discover a change, which is what the scenario teaches. Copying into state means student screens never need the template's findings (B11). Which interventions reveal is data, not code (B1).
- **Alternatives:** Reveal on any chart open (removes the point of assessing); hard-coded intervention ids in JS (breaks B1).

## 2026-11-05: Charting against an order moves it along
- **Decision:** An intervention or MAR "given" saved "For order X" acknowledges X if it's new, and marks a one-time order done. PRN, scheduled and continuous orders stay open. Students can also Acknowledge or Mark done directly.
- **Why:** It records which order the work was for, which the priority-order and tier-timeout rules (phase 5) need. The form preselects the first matching open order.
- **Alternatives:** Guessing the order from the intervention id (ambiguous, since `med-give` matches every med order).

## 2026-11-05: Quick actions chart catalog interventions
- **Decision:** "Notified provider", "Called rapid response" and "Notified charge nurse" on the Notes tab log as the matching catalog interventions. "Escalated" is its own `escalated` log action.
- **Why:** Parameter-breach rules look for `notify-provider` no matter which button the student used.
- **Alternatives:** A separate quick-action log type (every rule would need to check two shapes).

## 2026-11-05: Persist before notify; isolate subscriber errors
- **Decision:** `runner.commit` saves to storage before `store.set`, and the store wraps each subscriber in try/catch.
- **Why:** Found in testing: a screen bug threw inside `store.set` and the action was never saved.
- **Alternatives:** Only fixing the screen bug (the next one would lose data the same way).

## 2026-11-05: Session shape v2 discards older saved sessions
- **Decision:** Adding `students` and `revealed` bumped `SESSION_VERSION` to 2. A saved v1 session is ignored and a fresh one starts.
- **Why:** The prototype has no real data worth migrating, and a half-shaped session would crash screens.
- **Alternatives:** Write migrations (worth doing in the full build, where sessions are real records).

---

## 2026-11-05: Linked events share a `group` field
- **Decision:** Events that make up one moment carry the same `group` string (scoped to the patient). "Fire now" fires every member, and the loader requires members to share timing.
- **Why:** Firing a call light early used to leave its vitals and findings waiting for the scheduled time, so the story contradicted itself. With a group, the members' fired counts always move together.
- **Alternatives:** One compound event with several effects (a bigger change to the data format and the editor); `linkedTo` pointers between events (more ways to get the links wrong).

## 2026-11-05: Pause on close is the default (`settings.pauseOnClose`)
- **Decision:** A running sim pauses when the page closes or reloads, and on boot after a crash (as of the last 5 s heartbeat). Scenarios can opt out with `pauseOnClose: false`. **Supersedes** "A saved session resumes with wall time still counting" for the default.
- **Why:** An accidental close shouldn't fire 20 minutes of events at once when the page reopens. The machine this runs on can freeze, so the heartbeat covers closes where `pagehide` never fires.
- **Alternatives:** Always keep counting (the old default, still available via the setting); asking on reopen (an extra step mid-class). In the full build the server owns the clock and this goes away (SPEC §13).

## 2026-11-05: "Skip to next event" jumps the clock and fires what's due
- **Decision:** The instructor can jump sim time forward to the next scheduled firing, which fires that event (and anything else due at that minute) and logs a `clock-skip` entry with from/to. It works when running or paused, and keeps the current status.
- **Why:** At 8x an 8-hour shift still takes an hour of real time. Skipping makes short class periods workable without changing the scenario.
- **Alternatives:** Faster speeds (16x or more makes the call-light response times meaningless); a free "jump to time" (easier to skip past something by mistake). Skipped time counts as sim time, so rules in phase 5 must treat it like any other elapsed time.

---

## 2026-11-05: A saved session resumes with wall time still counting
- **Decision:** The session (clock snapshot, fired events, log) is saved through `storage.js` on every change. On reload, a running clock picks up from its wall-time anchor, so time passed while the page was closed counts and due events fire in order on the first tick.
- **Why:** If the page freezes or reloads mid-sim, the sim keeps its place, matching the real-time feel the instructor runs on. A paused clock stays paused.
- **Alternatives:** Auto-pause on unload (safer for an accidental close, but then a refresh silently pauses a live class); not persisting at all (a freeze loses the sim). Revisit with the instructor.
- **Status:** superseded as the default by "Pause on close is the default". This behavior remains when `pauseOnClose: false`.

## 2026-11-05: Orders active at shift start begin as "acknowledged"
- **Decision:** Orders with `activeFromMin: 0` start as `acknowledged` (received in shift report). Orders that activate later (by time or event) start as `new` and highlight until acknowledged.
- **Why:** Otherwise every order flashes "new" at 07:00, which drowns out the ones that really are new.
- **Alternatives:** Everything starts `new` (noisy). The admitted patient's orders come from their admission order set, so they're `new`.

## 2026-11-05: Interim student-to-group mapping (SUPERSEDED by the roster)
- **Decision:** Until phase 6, student tab N is placed into the Nth slot across groups (`studentSlots()` in `engine/assignment.js`).
- **Why:** Phase 2 needs students to see their patients' call lights before join codes and the randomizer exist.
- **Alternatives:** Every student sees every patient (would hide grouping bugs until phase 6).

## 2026-11-05: Tick timer lives in main.js; the runner is the only stateful engine piece
- **Decision:** `session.js` is pure (state in → state out). `runner.js` holds the current state and talks to the store. `main.js` owns the `setInterval`.
- **Why:** The engine stays testable in Node with a fake `now`. In the full build the server runs the same session functions, and clients receive state instead of ticking themselves.
- **Alternatives:** A timer inside the engine (untestable without fake timers, and it couldn't move to a server cleanly).

## 2026-11-05: Scenario picker reloads the app for the chosen scenario
- **Decision:** The header picker saves the choice and tears down and remounts the app (store, runner, tabs). Switching while a sim is running asks for confirmation and clears the session.
- **Why:** Tabs, student slots and the event list all derive from the scenario. Rebuilding is simpler and safer than patching each screen.
- **Alternatives:** Keep one session per scenario (more state to explain in a demo).

## 2026-11-05: Env-file guard hook fails closed
- **Decision:** `.claude/hooks/block-env.sh` blocks the command (exit 2) if `jq` isn't installed or the hook input can't be parsed. The message says jq is required.
- **Why:** A guard that silently allows everything when its parser is missing gives a false sense of safety. Failing closed makes a broken setup obvious right away.
- **Alternatives:** Fail open (the original version: no jq meant nothing was checked); a grep fallback on the raw input (fragile with JSON escaping). The cost is that `jq` is now a dev requirement (ARCHITECTURE §5).

## 2026-11-05: Sim clock is a serializable snapshot with injected wall time
- **Decision:** The clock is a plain object `{ status, speed, baseMs, anchorWall }` with pure functions. Callers pass `now`. Changing speed re-anchors, so time already elapsed keeps the old speed.
- **Why:** It's testable without timers, it saves to storage and resumes after a reload or freeze, and in the full build the server can own the same snapshot and clients compute sim time from it.
- **Alternatives:** A class with internal `setInterval` (hard to test and persist); counting ticks (drifts and breaks when the browser throttles background tabs).

## 2026-11-05: Event types mutate a per-firing draft copy
- **Decision:** `apply(draft, event, ctx)` mutates a draft the session copies before each firing, instead of returning a new state.
- **Why:** Event files stay short and readable. The copy keeps the previous state untouched.
- **Alternatives:** Fully immutable returns (verbose nested spreads in every event file); mutating live state (no undo, and subscribers see half-applied changes).

## 2026-11-05: Orders with `activeOnEvent` activate when any event fires
- **Decision:** Order activation by `activeOnEvent` is handled once by the session for every event type, not inside individual event types. `new-orders` additionally activates its whole `orderSet`.
- **Why:** The data uses `activeOnEvent` with call-light events too (e.g. Robert's ECG order activates on his call light), so it can't be specific to `new-orders`.
- **Alternatives:** Only `new-orders` activates orders (would miss existing data).

## 2026-11-05: Hiding answer-key fields from students is UI-only
- **Decision:** In phase 3, student views read patients through a filter that drops instructor-only fields. In code and in SPEC §13 this is labeled a UI convenience, **not** security.
- **Why:** On a static site the full JSON is downloaded anyway. Real protection is server-side filtering in the full build.
- **Alternatives:** Separate student/instructor JSON files (duplicates content and is still public on Pages).

## 2026-11-05: PreToolUse hook blocks Bash commands mentioning env files
- **Decision:** Alongside the `permissions.deny` rules, a hook (`.claude/hooks/block-env.sh`) rejects any Bash command containing `.env`, with exit code 2.
- **Why:** Deny rules only match specific command shapes. The hook catches everything else (`sed`, `awk`, scripts).
- **Alternatives:** Deny rules alone (easy to bypass by accident). The hook also blocks harmless mentions such as commit messages that contain the string. That's accepted, so don't mention it in command text.

## 2026-11-05: Public repo so GitHub Pages is free
- **Decision:** `rhythmbyte/nursing-sim` is public, and Pages deploys from `main`, root folder.
- **Why:** Free Pages hosting requires a public repo on a free plan. All patient content is fictional.
- **Alternatives:** Private repo on a paid plan; another static host (Netlify, Cloudflare Pages).

## 2026-11-05: Autosave Stop hook commits and pushes every turn
- **Decision:** `.claude/hooks/autosave.sh` runs at the end of each Claude Code turn and commits and pushes anything uncommitted (`autosave: <timestamp>`).
- **Why:** The dev machine can freeze, and this way work is never lost. It's a safety net. Real commits with real messages are still expected.
- **Alternatives:** Manual commits only (lost work on a freeze); a timed cron job (commits mid-edit). Because it runs `git add -A`, `.gitignore` must cover every secret file pattern (`.env`, `.env.*`).

## 2026-11-05: JSON Schema validation with a small built-in validator
- **Decision:** Every data file is validated against `data/schemas/*.schema.json` on load and in the tests, using `js/validate.js`, a small validator for a subset of JSON Schema. Extra properties are allowed.
- **Why:** Hand-written data has typos. Catching them at load time (with a visible banner) beats a screen crashing mid-sim. Extra properties are allowed because the data carries notes and review fields freely.
- **Alternatives:** Ajv (a dependency and needs a build or CDN; overkill for this subset); no validation.

## 2026-11-05: Store with pub/sub (`state.js`)
- **Decision:** One central store: `get`, `set(patch)`, `subscribe`, plus named events `on`/`emit`.
- **Why:** There's one source of truth that screens subscribe to. In the full build a realtime channel feeds the same API, so screens don't change.
- **Alternatives:** A framework store (needs a build step); each screen holding its own state (copies drift apart).

## 2026-11-05: `storage.js` is the only persistence layer
- **Decision:** Nothing but `js/storage.js` touches `localStorage`. Its API is `load`/`save`/`remove` with a `nursing-sim:` key prefix, and failures are caught so the app runs without storage.
- **Why:** The full build swaps this one file for a backend client.
- **Alternatives:** Direct `localStorage` calls in screens (would mean a rewrite later); IndexedDB (unnecessary for this data size).

## 2026-11-05: `data/manifest.json` lists every data file
- **Decision:** The loader reads a manifest instead of listing folders. A test fails if the manifest and the files on disk differ.
- **Why:** GitHub Pages (any static host) can't list directories.
- **Alternatives:** Hard-coding file lists in JS (content in code, breaks B1); a build script that generates the manifest (adds a build step). In the full build the API replaces the manifest.

## 2026-11-05: Clinical content as JSON data
- **Decision:** Patients, scenarios and catalogs are JSON files under `data/`. AI-drafted content carries `"review": "proposed"` until the instructor approves it.
- **Why:** The instructor's cases become data that the patient editor (phase 6) reads and writes in the same format. It maps directly to database records later.
- **Alternatives:** JS modules exporting objects (content mixed with code); YAML (needs a parser).

## 2026-11-05: No build step; plain ES modules
- **Decision:** Plain HTML, CSS and ES modules, with no bundler, framework or npm dependencies at runtime.
- **Why:** GitHub Pages serves the repo as-is, there's nothing to install or break, and anyone can read the source.
- **Alternatives:** Vite/React (faster UI building, but needs a build and deploy pipeline). Worth revisiting for the full build.
