# Changelog

Newest first. One entry per phase or feature. Update it in the same commit as the change.

## Unsaved editor changes are protected
- The patient editor now asks before you leave with unsaved changes: switching instructor sub-views, switching top-level tabs, or closing/reloading the page (browser prompt). Typing in any editor field counts as a change (before, only builder/timeline/JSON changes did). Saving clears it.
- Tests: 129 passing; checked in the browser (clean editor leaves silently; unsaved + Cancel stays; OK leaves).

## Full check after cleanup
- Full browser run through every tab (instructor views, two students, student charge nurse, monitor + silence + full screen, print preview, reflection, debrief) with no console errors.
- Accessibility probe: every visible control in every view now has an accessible name (the last one, the editor's Advanced JSON box, is labelled).
- Tests: 128 passing.

## Tests for untested behavior (+ fixes they found)
- New `tests/loader.test.mjs` runs the real data loader in Node (fetch reads `data/`, in-memory localStorage): starter data loads clean, browser edits overlay files, a broken edit falls back to the file version, a scenario with no patients left is dropped, `clearAll` removes only this app's keys.
- New test: every action the engine logs has a readable debrief description (scans the engine source).
- **Fixed (found by the tests):** `clearAll` used `Object.keys(localStorage)`; now the standard `length`/`key()` API. The debrief timeline showed raw names for 8 actions (admission assigned/held, order pushed, code started/outcome, monitor connected, priority assigned, end of shift); they now read as sentences. `monitor-alarm` descriptions no longer crash on missing details.
- Tests: 128 passing.

## Polish: loading state, accessible editor inputs
- "Loading…" while data reloads after an editor save, approval or new sim (was a blank screen).
- Screen-reader labels on every input in the patient editor's orders and labs tables and the scenario-change builder's order rows.

## Docs match the code
- SPEC §2 folder layout updated to what exists (and points to ARCHITECTURE.md as the detailed map); `ems-arrival` marked not built yet. ARCHITECTURE no longer says "phase N" for things that are built.

## Cleanup: naming and docs
- The patient-editor timeline's CSS classes are now `ptl-*` (they shared the `tl-` prefix with the debrief timeline rows).
- ARCHITECTURE folder map names every file again (priority picker, Adjust vitals panel, entered-in-error controls, monitor chart section, shared label/text helpers) and the rule count (10).

## Cleanup: dead code, stale notes, shared helpers
- Removed an unused import, an unused export (`isStruck`) and a dead CSS rule (`.is-prior`). Rewrote stale comments that still talked about "phase N" or said features were coming that already exist; CSS section headings now name features, not phases.
- One helper each for repeated bits: `round2()` (engine/time.js) replaces seven inline two-decimal roundings; `patientLabel()` (screens/shared/labels.js) replaces hand-built "Rm 204 Linda Garcia" labels in seven screens; `lines()` (screens/shared/text.js) is shared by the patient editor and the scenario-change model.
- No behavior changes. Tests: 122 passing.

## Full check after suggestions 3, 2, 1, 6, 4
- Full browser run through every tab: two students, a student charge nurse, instructor views, the monitor with **Silence alarm**, the standalone monitor page in a second tab, print all report sheets, debrief **Print summary**, reflection vs. should recognize, and the builder's rhythm picker. No console errors.
- README demo guide covers the new features. Tests: 122 passing.

## Reflection vs. should recognize (suggestion 4)
- The debrief's Reflection section shows the student's answers beside each patient's **should recognize** items (patient-level plus per-scenario-change). Items whose key words appear in the answers get a **possible mention** badge (hover shows the matched words). It's labelled as a reading aid, not a grade.
- Tests: 122 passing.

## Printing at scale (suggestion 6)
- **Print all report sheets** on Live control (Students panel): every joined student's patient pages in one print job, each labelled with the student.
- Debrief: **Print summary** (one student: counts, flags, reflection, priorities, response times; the timeline, order sequence, charted-vs-scripted, handoff and should-recognize are left out) next to **Print full**.
- Tests: 121 passing.

## Standalone monitor page (suggestion 1)
- **Open in new tab** on the chart's Monitor tab opens `index.html?monitor=<patient>`: just the bedside monitor (with Full screen) for a tablet or TV, no app around it. It follows the sim running in **the same browser** live (reads the saved session via `storage.onExternalChange`) and is display-only (never writes; silencing happens in the chart).
- Checked in two browser tabs: an instructor vitals change showed up on the monitor page with alarms.
- Tests: 120 passing.

## Alarm acknowledgement (suggestion 2)
- When the bedside monitor alarms, students see **Silence alarm**. It logs the response time and silences the sound for `vitals.json alarmSilenceMin` (2 min); the flashing stays.
- The engine tracks alarm episodes (start, changes, cleared), logged as `monitor-alarm`.
- New rule **alarm-response**: amber after 2 min, red after 5 min without acknowledgement (`rules.json`). Alarms that clear on their own before the amber threshold aren't flagged.
- Debrief response times gain a **Monitor alarms** table.
- Tests: 119 passing.

## Monitor-only events (suggestion 3)
- The scenario-change builder's vitals have a **Rhythm (monitor)** picker from `rhythms.json`. A **Silent** change with just a rhythm (and/or vitals) generates only a vitals-change: nothing alerts students except the bedside monitor, so you can see who notices.
- Tests: 118 passing.

## Full check after B/C batch
- Full browser run through every tab: instructor views, two students, a student charge nurse, the monitor (with Full screen), report-sheet print preview, end of shift with reflection, and the debrief.
- **Fixed:** the Recent row now refreshes after charting. Full screen being refused (e.g. inside a frame) now shows a message instead of an unhandled error.
- README demo guide covers the new features. Tests: 117 passing.

## C18. Student reflection after the sim
- When the sim ends, each student's home shows a short reflection form. The questions are data in `data/catalogs/reflection.json` (proposed). Answers are logged and shown in a **Reflection** section of the debrief. Submitted once; at least one answer is required.
- Tests: 117 passing.

## C17. Color-blind-safe tags
- Every tag shows a shape as well as color and name: ▲ red, ◆ yellow, ● green, ✕ black. This covers the instructor's triage chips everywhere (library, Live control, charge, debrief) and the students' priority options. The symbols are data in `priority-scales.json` (`instructorTags` and each scale level's `symbol`). The scale check requires a symbol on every level.
- Tests: 115 passing.

## C16. Instructor keyboard shortcuts
- On Live control: **Space** pause/resume, **N** skip to next event, **?** list shortcuts (hint shown in the header). Ignored while typing in a field, while a dialog is open, or with Ctrl/Alt/Meta.
- Tests: 114 passing; checked in the browser (a key typed in a field doesn't skip).

## C15. Help text on settings and editor fields
- A small **?** next to every Sim setup setting, patient editor field and scenario-change field opens a plain-language explanation. All text lives in `data/catalogs/help.json` (keys `<screen>.<label slug>`). A test fails if a field label has no help entry.
- Tests: 113 passing.

## C14. Start demo sim
- **Start demo sim** on Live control: one click switches to the starter scenario, clears the session, joins a test student ("Demo Student" on Student 1) and starts the clock. The scenario and student are data (`ui.json demo`). It asks first if a sim is running.
- Tests: 111 passing.

## B13. Tablet layout
- Touch screens get ≥ 44 px targets (buttons, selects, inputs, pills, tabs) and larger checkboxes. Student and charge screens stack in portrait and stay two-column in landscape. Wide tables scroll inside their panel, not the page. There are no hover-only controls.
- Browser check at 810×1080 and 1080×810 with touch emulation: no horizontal overflow on the student home, any chart tab, or charge; no small touch targets.

## B12. Call-light sound
- A beep when a call light comes on for one of the student's patients, then a gentle repeat (every 30 s of real time, while the sim runs) until it's answered. A toggle on the student home and chart (one setting, remembered per student) turns it on or off. Timing and tones are data (`ui.json callLightSound`).
- Tests: 110 passing.

## Pulseless rhythms show RR --
- `rhythms.json`: VF, pulseless VT (new `pvt`), PEA and asystole carry `"pulseless": true` (replaces `pulse: false`). On the monitor a pulseless rhythm shows HR per rhythm, and SpO₂, pleth and **RR as --**. SPEC §14 question on 0 vs. agonal breathing stays open.
- Tests: 109 passing.

## B11. Printable report sheet
- **Print report sheet** on the student home: one page per assigned patient with name, room, age, diagnosis, allergies, code status, the student's handoff notes, active orders, a notes box and an hourly time grid (VS / Meds / Assess / Labs / Notes) to the end of shift. Print-only CSS; built from the student view only (no answer key).
- Tests: 109 passing.

## B10. Entered in error
- Students can mark their own chart entries (interventions, flowsheet rows, MAR actions, notes, escalations) as **Entered in error**, with a required reason. Nothing is deleted: the original stays visible, struck through, with the reason, and both actions are logged.
- Rules, PRN checks and debrief comparisons ignore struck entries; the debrief timeline still shows them, marked.
- Tests: 108 passing.

## B9. Intervention search and Recent
- Type-to-find across all categories in the Interventions tab: label, id and catalog `synonyms` (e.g. "foley" or "indwelling" → Insert Foley catheter; "EKG" → 12-lead ECG; "fingerstick" → glucose). The synonyms are data in `interventions.json` (proposed).
- A **Recent** row shows the student's last-used interventions.
- Tests: 107 passing.

## A. Bedside patient monitor
- **Monitor** tab in the student chart, with **Full screen** for a tablet or TV next to the manikin.
- Real-monitor look: dark background, large numbers. HR/ECG green, SpO₂ cyan, NIBP white (red when alarming), RR yellow. Shows NIBP time of the last cycle, O₂ device, and temp only with a temp probe (`monitor.tempProbe`).
- Animated **ECG** and **pleth** waveforms on canvas. Rhythm is data: new `data/catalogs/rhythms.json` (sinus, sinus tach/brady, AFib, PEA, asystole, VF, VT) says how each is drawn. New `rhythm` field in vitals; starter rhythms added (Dorothy AFib, Linda sinus tach, …) with `vitals.review: proposed`.
- **Live:** scripted changes, instructor adjustments (Adjust vitals has a **rhythm** picker), trends and codes (arrest rhythm; no pulse = no SpO₂/pleth). ROSC / no ROSC set `settings.roscRhythm` / `noRoscRhythm`.
- **Connections:** shows only what the patient is connected for: catalog `monitorConnects` on tele (ECG), continuous pulse ox (SpO₂) and the NIBP cycle, or the student's logged **Connect to monitor** (all).
- **Alarms:** flashing tiles past data limits (`vitals.json alarmLimits`) or on alarm rhythms; optional sound with mute. NIBP still follows the cycle and Take BP now; no pain, GCS, or temp without a probe.
- One animation loop for all monitors, paused when hidden or when the sim isn't running. Reusable module `js/screens/monitor/`.
- Tests: 106 passing.

## Review fixes #5, #2, #7
- **#5 Broken-reference check** (`engine/integrity.js`), run by the loader and the tests. It covers orders → interventions and labs, events → keyframes, findings and order sets, labs → catalog and forOrder, parameter and PRN references, code branch, and scenario patients. Clear messages appear at the top of the Instructor tab. A broken browser edit falls back to the file version instead of breaking the app.
- **#2 Save failures are visible:** a sticky "Not saved" banner when browser storage is full or blocked.
- **#7 End of shift:** the sim ends automatically at the scenario's `endClock`, and every sim clock shows the time remaining. Sim setup has a Shift end field.
- Tests: 100 passing. Browser regression: no console errors.

## Instructor-friendly patient scripting
- **Scenario-change builder** in the patient editor: time (shift clock) or instructor-triggered, how it starts (call light / staff message / silent), what the patient says, new vitals, new findings, new orders with tiers, and what students should recognize. Saving generates the linked events; Edit reopens the same form.
- **Per-patient timeline:** shift clock across the top with one marker per change. Click to edit; drag to retime (snaps to 5 min).
- **No JSON boxes:**
  - orders and labs are editable tables with Add and Remove;
  - outcome, code branch and review notes are form fields;
  - "Advanced: edit JSON" is collapsed.
- **Duplicates:** **Duplicate patient** and **Duplicate change** (+15 min).
- **Debrief:** each change's "should recognize" notes now appear in the debrief.
- SPEC §13: AI conversion of a pasted case write-up (full build, needs a backend).
- **Fix found by the round-trip test:** keyframe extras (GCS, notes, review tags) would have been lost on save.
- No new starter content was added, so nothing new to mark proposed.
- Tests: 96 passing.

## Live vitals control
- **Live control → Adjust vitals** per patient:
  - current values (BP, HR, RR, temp, SpO₂, O₂ device, pain, GCS, glucose);
  - edit any of them, then **Apply now** or **Trend over N min**;
  - a vitals column shows current values and "trending".
- **Quick presets from data:** `data/catalogs/vitals-presets.json` (Deteriorate, Improve; proposed) plus optional patient `vitalsPresets`.
- **Changes reach everything:**
  - the monitor cycle, Take BP now, Measure and delegated reports;
  - parameter rules (e.g. a live SBP drop triggers "notify for SBP < 90");
  - the debrief's charted-vs-actual comparison.
- **Logged** as an instructor action (old → new) and shown on the debrief timeline as "Instructor adjusted vitals".
- **Scripted vs. live:** the next scripted vitals event takes over by default; `settings.scriptedVitalsAfterInstructor: "skip"` keeps instructor control. SPEC §14 Q22–23.
- **Fix:** BP entered with spaces around it was refused.
- Tests: 93 passing.

## Student priorities, hidden instructor tags, welcome popup
- **Instructor tags hidden:** hidden from every student-facing role by default (`settings.showTagsTo: ["instructor"]`, replacing `showTagsToStudents`). Checked in the browser: no tag chips, classes or tooltips on student or student-charge screens.
- **Student priorities:** students set their own priority per patient from the home list or chart banner; the charge nurse does the same for admissions. Logged with sim time.
- **Scales are data:** `data/catalogs/priority-scales.json` (one scale for now: red/yellow/green/black), picked by `settings.priorityScale`. ESI, acuity and similar scales can be added as data.
- **Debrief:** each student's priorities over time next to the instructor's tag, with mismatches highlighted.
- **New rule `priority-mismatch`** (amber, 10 min grace, can be switched off). Any rule can now be disabled with `enabled: false`.
- **Tag history:** code → `settings.codeTag`, ROSC → `roscTag`.
- **Sim setup:** who sees tags, and the priority scale.
- **Welcome popup** (prototype only): text from `data/catalogs/ui.json`, once per browser session, Esc closes.
- **Fix:** stop the app before reloading data (stale session re-save).
- SPEC §14 Q18–21.
- Tests: 86 passing.

## Review pass
- **Modularity audit:** 3 violations fixed:
  - quick-action ids hard-coded in `notes.js` (now `quickAction` in the catalog);
  - code/ROSC text in the engine (now `settings.messages`);
  - the "new orders" count duplicated in 3 screens (now `newOrderCount`).
- **Bugs fixed:**
  - an edit, approval or new sim during a running sim paused and rewound it;
  - a stale saved session with a missing patient crashed on load;
  - the CSV gains a local time column.
- Removed the unused placeholder screen.
- Full browser run: every tab as the instructor, two students, a student charge nurse, pause/resume, skip, reload mid-sim, scenario switch. No console errors.
- README: Demo guide.
- Tests: 82 passing.

## Phase 7: charge nurse and admissions
- **Charge tab:**
  - **Admissions board:** incoming patient with report (SBAR, diagnosis, code status), **Assign now** to a group (shows each group's load) or **Hold** with a reason.
  - **Unit overview:** live tags, group and students, call lights, codes, new orders and open flags per patient; waiting admissions on top.
- With `chargeNurse` on, admissions wait on the board until assigned. Orders that arrived meanwhile count from assignment.
- **Catalogs in the review queue** (Approve, Export, Revert) and a **Reset demo** button in the header.
- Tests: 81 passing.

## Phase 6: instructor tools
- **Join codes and roster:** each student tab shows **Join sim** (code + name). Manual (named roster) or random placement; full groups are never over-filled, and overflow alerts the instructor. The roster drives student screens, flags and the debrief.
- **Live control:**
  - the join code;
  - a **Students** panel (group, chart open, last action);
  - a **Patients** panel: **Push order** as the provider (shows as new on the student's Orders and MAR), **Call light on/off**, **Start code**, then **ROSC / No ROSC** (`settings.roscTag`).
- **Sim setup:** name, start, speed, settings, groups (pick patients and admissions, or random by tag counts with no reuse and warnings when the library runs short), manual or random assignment. Create saves the sim, switches to it, and makes a new join code.
- **Review queue:** every proposed/partial item per patient, with Approve, Edit patient and Export JSON.
- **Patient editor:** sectioned form plus orders table plus JSON for nested parts. Schema-validated save, New, Import, Export, Revert to file.
- Instructor edits save in this browser; publish by exporting JSON and committing it.
- Tests: 80 passing.

## Remaining clinical defaults moved to data
- **New catalog `scenario-defaults.json`** holds the default for every scenario setting; scenarios list only what they change. New settings:
  - `prnPreCheckWindowMin` (15): PRN pre-check window when the order doesn't set one.
  - `delegatedAssessmentRevealsFindings` (false): when true, findings appear when the staff member reports back.
- **New catalog `vitals.json`:** which fields come from the monitor vs. by hand, and the NIBP cycle choices.
- **Lab delay fallback** is now `labs.json` `fallbackDelayMin` (30).
- No setting or clinical default remains in code; missing data throws a clear error. SPEC §14 Q13–15 added.
- Tests share `tests/fixtures.mjs`. 69 passing.

## Phase 5: flag rules and debrief
- **All 8 flag rules** from SPEC §7, one file each:
  - priority-order and tier-timeout;
  - call-light-response and parameter-breach (vitals, lab or event conditions);
  - inappropriate-delegation and allergy-conflict (name or drug class);
  - prn-limit (MAR overrides are red) and left-unattended (instructor marks it).
- **Rule defaults are data:** `data/catalogs/rules.json` (proposed), with per-scenario overrides under `settings.rules`. The defaults are SPEC §14 questions 7–11.
- **Live control:** a **Flags (live)** panel and a **Left unattended → Mark** control.
- **Debrief tab**, per student:
  - red/amber counts and the flag list;
  - response times for call lights, parameter orders and codes;
  - order sequence per set, done vs. correct, with out-of-order items highlighted;
  - charted vs scripted vitals;
  - handoff notes and durations;
  - "should recognize" (instructor only);
  - the full timeline with flags inline.
  - **Export CSV** and a **Print** view.
- **Fixes found in browser testing:**
  - flag text wrapped badly;
  - parameter rows still inside their window showed "none" instead of "pending";
  - the order sequence listed sets nobody had touched.
- Tests: 64 passing.

## Nitro pre-check, Take BP now, Charted-only toggle, lactate routing
- **Nitro pre-check:** a monitor BP (cycle or the new **Take BP now**) within the window now counts, so no separate charted BP is needed. Set by catalog flag `satisfiedByMonitor`.
- **Take BP now** button on the Flowsheet: starts the NIBP immediately, logged as a student action, and doesn't change the cycle.
- **Charted only** toggle hides monitor rows on the Flowsheet. It's remembered per student.
- **Linda:** the scripted 4.1 lactate is reserved for the STAT sepsis order (`forOrder`), and the 2–4 h repeat gets an unscripted result.
- CLAUDE.md: clinical-practice choices become data or settings plus a SPEC §14 question.
- Tests: 50 passing.

## Phase 4: vitals, labs, delegation
- **Monitor cycle** (Off / q5 / q10 / q15) on the Flowsheet: BP, HR, SpO₂ and O₂ fill in automatically from the patient's current vitals.
- **Charting vitals:** monitor values are read from the device. Temp, RR and pain are typed, with a **Measure** button when `settings.revealManualVitals` is on (new setting, default `true`). Other manual entries: GCS, glucose, I&O, weight, neuro. The debrief gets the scripted values at each charting.
- **Labs:**
  - "Draw / send labs" for an order starts the result delay.
  - Labs show Not drawn → Drawn · pending → Resulted.
  - Instructor **Pending labs** panel with Release now; labs with no scripted value ask the instructor for one.
- **Delegation outcomes:** an LPN or CNA reports back after `settings.delegationDelayMin` (new setting, default 10) as a staff message. Vitals land on the flowsheet, labs get drawn and orders move along at that time. Intervention history shows "due ~07:10" or "reported 07:10".
- **Call-light banner on every chart page:** shows unanswered lights on the student's other patients, with buttons to go to them.
- PRN pre-check: full vitals count as a BP; a delegated BP counts once reported; monitor readings don't count.
- SPEC §14: questions for the instructor. The prn-limit rule (phase 5) flags overrides red.
- **Fixes found in browser testing:**
  - flowsheet rows were out of time order after a delegated report or Skip;
  - delegated reports revealed temp/RR/pain when the setting was off.
- Tests: 48 passing.

## Phase 3: student chart
- **Student home:** click a patient to open the chart. Patient rows show new-order and pending-lab badges and "Last seen" times, and call lights can be answered from the home list or the chart.
- **Handoff popup** (`handoffMode: "once"`): an SBAR report with a notes box. It can't be dismissed with Esc, and once closed it's gone for good while the notes stay on the Summary. Opened and closed times and duration are logged. `"always"` mode gets a Handoff tab instead.
- **Chart tabs:**
  - **Summary:** problems, latest vitals, alerts, revealed findings, my handoff notes, HPI.
  - **Orders:** New / Active / Done, with Acknowledge and Mark done.
  - **Flowsheet:** charted vitals over time.
  - **MAR:** Give, Hold with a reason, Not given with a reason. PRN warnings cover max doses, interval, and a required pre-check.
  - **Labs:** pending values are never shown.
  - **Interventions:** category → intervention → form, "For order", and "Performed by" Me / LPN / CNA.
  - **Notes:** free text plus quick actions.
- **Assessment findings** are revealed only when the student charts a focused or head-to-toe assessment. New findings need a reassessment.
- **Student-view filter** (UI convenience only, not security).
- **Fixes found in browser testing:**
  - screens now read session state correctly;
  - an action is saved before screens update, so a screen bug can't lose it;
  - a failing screen no longer breaks the others.
- Tests: 38 passing.

## Linked events, pause on close, skip to next event
- **Linked events:** events share a `group` field, and "Fire now" (shown as **Fire group**) fires all of them, so the scheduled time stays in sync. The starter patients' 1–3 linked events per moment are grouped. The loader and tests require members to share timing.
- **Pause on close:** a running sim pauses when the page closes or reloads, and after a crash (as of the last heartbeat). New scenario setting `settings.pauseOnClose`, default `true`.
- **Skip to next event:** an instructor button showing the target time ("Skip to next event (08:15)"). It jumps the clock and fires what's due, and is logged as `clock-skip`.
- Tests: 30 passing.

## Phase 2: clock, scheduler, events
- **Sim clock:** start, pause, resume, end, and speed 0.5x–8x, shown everywhere as shift time (e.g. 08:15). It's a serializable snapshot, and the session resumes after a reload.
- **Scheduler:** fires events at their `atMin`, with repeats (`repeatEveryMin` / `repeatCount`). Events with `trigger: "manual"` only fire from "Fire now".
- **Eight event types**, one file each, registered through `engine/events/index.js`: new-orders, call-light, vitals-change, findings-change, staff-message, lab-result, code, admission. Orders with `activeOnEvent` activate when their event fires, whatever its type.
- **Session and runner:** pure session transitions plus a controller that pushes to the store and persists through `storage.js`. Everything is logged with `userId` and `role`.
- **Instructor → Live control:**
  - clock controls, speed, and Reset;
  - a unit strip with live tags (incoming admissions shown dashed);
  - call lights with time lit;
  - a recent-activity feed;
  - an event timeline with "Fire now" for every event, including manual triggers.
- **Student tab (interim home):** assigned patients, call lights with **Answer** (logs response time), new-order badges, and alerts.
- **Library cards** show the first scripted event ("First event 08:15 · call light"). Approved suggestion #2.
- **Scenario picker** in the header. Approved suggestion #3.
- Tests: 25 passing (engine tests run against the real starter data).

## Docs and tooling
- Added `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and this changelog. CLAUDE.md now requires keeping them current.
- PreToolUse hook blocks Bash commands that mention env files. `.gitignore` covers `.env.*`.
- The hook now fails closed: if `jq` is missing or the input can't be parsed, it blocks. `jq` is a dev requirement.
- CLAUDE.md: "Suggestions and feedback" rules. SPEC §13: full-build migration notes.
- GitHub Pages is on: https://rhythmbyte.github.io/nursing-sim/

## Phase 1: shell and data
- Tab shell: Instructor | Student 1..n | Charge (if enabled) | Debrief. The active tab is remembered.
- `storage.js` (only persistence), `state.js` (store + pub/sub), `data-loader.js` (manifest → fetch → validate).
- JSON schemas for patients, scenarios and catalogs, plus a small validator. Invalid files are skipped and shown in a banner.
- Read-only patient library with triage chips, "Needs review" counts and badges, and full template detail (event and order times shown as `atMin 75 = 08:15`).
- Node tests for all data files and the pure modules.

## Setup
- Repo created (`rhythmbyte/nursing-sim`, public) with the spec, starter data (six patients, one scenario, catalogs), the autosave hook, and env-file deny rules.
