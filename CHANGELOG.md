# Changelog

Newest first. One entry per phase or feature. Update it in the same commit as the change.

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
