# Changelog

Newest first. One entry per phase or feature. Update it in the same commit as the change.

## Program profiles (scale, Part A)
- **Programs** (`data/catalogs/programs.json`, proposed): RN and LPN / LVN, with room for EMT / Paramedic. A program sets what new sims default to (helper roles and staff pool, assessment tools, charge nurse) and which cases and saved sims are offered (by patient tags). It also sets which parts of setup show (charge nurse, delegation, assessments, task timers) and its wording.
- The instructor **picks a program once** (first visit to the Instructor tab; "Just looking? Start the demo sim" skips it). It's remembered, and **Program** at the top changes it.
- A program never removes anything a sim needs: tools, interventions and helper roles it doesn't use are only marked as not offered, so a case or sim from another program still runs. The student's intervention picker shows the program's interventions plus any the patient's orders call for. The Builder library shows the program's cases, with "Show cases from every program".
- Setting **presets** catalog added (`presets.json`), used by the wizard in Part B.
- Tests: 236 unit; new browser suite `programs`.

## Browser suites in the repo
- The browser suites now live in `tests/browser/` (they were outside the repo): `tour`, `instructor-flow`, `cases`, `guided-builder`, `patient-tags`, `task-timers`, `drafts`, `away-break`, `debrief`, `reflection`, `projector`, `run-again`, `rejoin`, `soak`, `crash`. They share one DevTools helper (`lib.mjs`). Paths, ports and the browser are settings, not hard-coded. Five older feature suites (guided builder, patient tags, task timers, drafts, away/break) were ported to the new screens too, with real pass/fail checks instead of printed values.
- Fixed (found by the stricter suites): the scroll position was saved 300 ms after scrolling, so a reload or crash right after scrolling lost it; it's now also saved when the page is left.
- The tour now waits out the manikin lockout after charting a pain score and checks it was charted (the old version read the list while the task was still running), and checks that NEWS2 isn't offered until its license is confirmed.
- `tests/browser/all.sh` runs them all (or the ones named), starting a static server if needed and a fresh browser for each suite, and ends with a PASS/FAIL summary (exit code 1 on any failure). A suite now fails on any page error or warning, a click that finds nothing, or an evaluation that throws, instead of relying on someone reading the output.
- Output goes to `tests/browser/.out/` (gitignored); `_config.yml` keeps `tests/browser` out of the deployed site.
- CLAUDE.md: run the unit tests and every browser suite before committing any big change.

## Talking points skip what the reflections already cover
- A "should recognize" item that every student in the group who wrote a reflection already mentions is left out of the talking points (and the summary's count). **Show N already in reflections** brings them back, labeled "✓ in Ana's reflection (keyword match)", with Evidence opening the reflection. Items only some students mention stay, labeled with who did.
- The rule is data: `debrief-points.json` `shouldRecognize.skipIfMentioned` = `all` (default, proposed) / `any` / `off`. The match is the existing keyword overlap, a reading aid, not a grade.
- Tests: 231 passing; browser check (a reflection about Linda's septic shock leaves out 3 points).

## Run again
- **Debrief → Run again** (after End): the same scenario (cases, groups, settings) as a new sim, with a new join code and fresh patient variants (per its variation toggles; all off = the same patients as written), straight to the Ready screen. It asks first, because this sim's debrief is replaced (print or export it before).
- Tests: 230 passing; browser check (same cases, new code, new names and drugs).

## Projector view
- **Ready → Projector view** opens `index.html?projector=1` for the classroom screen: the sim name, where to join, the join code huge, and who has joined by group, updating live (Full screen button). It shows no patient or case information, since students see it. Display-only, like the bedside monitor page: it never writes or takes the window lock.
- A brand-new sim is now saved at once, so display-only pages see it before the first student joins.
- Browser suites ported to the new screens and all passing: crash and kill tests (16/16, now including "Builder editor restored after a kill before class" and "instructor back on the Overview after a kill"), rejoin (approval from the alerts strip and student drawer), and the 4-hour soak (heap 5–8 MB, tick 7 ms average late in the sim, drawer 13 ms, full breakdown 14 ms).
- Tests: 229 passing.

## Three-tier debrief (restructure, Part C)
- **Tier 1, Summary** (the default; one screen; **Print summary** prints one page): a card per group with tasks on time (green), late (amber), very late, misprioritized and missed / never done (red), red and amber flags, call light and alarm response averages, the overall status (same rule as the Command center) and its patients as "(C1) Robert Miller". Every number opens the full breakdown at its section.
- **Tier 2, Talking points** (per group): plain-language prompts generated from the group's flags, very late and missed work, delegation waits, recovery penalties and each case's "should recognize" items, grouped by theme (prioritization, recognition, delegation, communication, timeliness). Example: "(S1) Linda Garcia: Did "Insert indwelling urinary catheter…" (tier 3) before higher-priority "Lactated Ringer's 30 mL/kg IV bolus now" (tier 1)… Ask what drove that order." Tick as discussed, hide, or **Evidence →** (opens the breakdown at the right section, highlighted). Ticks and hides are remembered per sim. The wording and themes are data (`data/catalogs/debrief-points.json`, proposed).
- **Tier 3, Full breakdown** (per group, drill down to each student): everything the debrief had (flags, timeliness, tasks, delegation, patient states, assessments, reflection, priorities, response times, order sequence, charted vs scripted vitals, handoff, should recognize, timeline, CSV export).
- Tests: 228 passing; browser check of summary → talking points (tick, hide, reload) → evidence → breakdown.

## Instructor: setup wizard → Overview → debrief; Builder tab (restructure, Part B)
- **Instructor tab follows the sim:** Setup → Overview → Debrief (a phase bar shows where you are; the debrief so far is one click away; after End, "New sim" starts the next setup).
- **Setup wizard**, one step per screen with Back / Next and a progress bar: start from a saved scenario (or run it as is) or new; groups and students; patients (pick cases, or randomize by patient tags and triage counts with match counts); variation toggles; sim options (handoff, charge nurse, task timers, staff per group, assessments, shift times, speed; everything else under More options); review → **Create sim**. Then **Ready**: the join code big, who has joined, this sim's patients with Reroll / Lock, **Start sim**. Defaults make a quick setup Next, Next, Create, Start. Every Sim setup option is still there.
- **Overview** (the only screen while the sim runs): clock bar (time, time left, Pause / Resume, Break 5/10/15 or Extend, Speed, Skip, End sim), an alerts strip (call lights, alarms, codes, rejoin requests), and the Command center cards. Click a patient → a side drawer with the case and variant, vitals and Adjust vitals, push order, call light, Add event, code / ROSC, script state with armed reactions and the penalty, labs to release and the patient's events. Click a student → status, End task now and rejoin approval. Click a group → its patients and events. The full Live control is under **More controls** (collapsed). End → straight to the debrief.
- **Builder tab** (Patient editor, Patient library, Review queue): preparing cases before class; hidden while a sim runs. The separate Debrief tab is now the Instructor tab's Debrief phase.
- Fixed: the "?" help explanations were always open (a component style overrode `hidden`); a global `[hidden]` rule fixes them and every other hidden element.
- Hardened: the IndexedDB crash-safety mirror closes when something deletes or upgrades it (Reset demo) and boot waits at most 4 s for it, so a stuck database can't hold the app on "Loading…".
- Tests: 225 passing; browser check of wizard → Ready → Start → Overview + drawers + More controls → End → Debrief.

## Variation toggles and case codes (restructure, Part A)
- **Three toggles per sim** (scenario settings, defaults on, proposed): **Randomize names**, **Randomize vitals & labs within ranges**, **Randomize meds within class**. Off = that part of each case exactly as written (the file's name, age and sex; the written values; the written drug). Set in the setup wizard.
- **Case codes:** each case has a short instructor code (`case.code`: C1, PO1, D1, S1, N1, HF1), suggested from the title and editable in the Patient editor. Every instructor screen shows "(C1) Robert Miller"; student and charge-nurse screens never show it.
- Tests: 225 passing.

## Case templates with randomized variation (Part B)
- **Patients are now reusable cases** ("Cardiac 1", "Sepsis 1"). Each sim makes its own patient from a seed: a name from `data/catalogs/names.json`, an age in the case's range, the sex (fixed or either), baseline vitals and labs within their ranges, and one drug per medication class (`data/catalogs/med-classes.json`). The patient is identical through the sim, reloads, rejoins and the debrief. The same case in two groups gets a different name and variant.
- **Texts use placeholders:** `{firstName}` `{fullName}` `{age}{sex}` `{room}` `{he/she}` `{his/her}`, any `{male/female}` pair (`{wife/husband}`), baseline `{bp}` `{hr}` `{spo2}`…, `{lab.wbc}`, and `{med.doac}` / `{med.doac.Name|dose|freq}`. A class drug is used everywhere: home meds, the order's medication and text, MAR, PRN and hold rules, allergy checks, timeliness. Never a drug the patient is allergic to; the case can exclude drugs.
- **Scripted changes can be relative to the baseline** (`valuesRel`, e.g. SBP −30). The guided builder has "changes by (from baseline)" on vitals rows (not in Live control).
- **Variant integrity check** (`engine/case-check.js`): the editor warns live when a range could put a variant past a threshold the case reacts to, outside the patient's target, or across a lab's reference range, and **Check variants** dry-runs 24 variants and compares every reaction, state, event and threshold with the case as written. The tests run it on all six starter cases. It found two of my own starter ranges (Margaret's WBC, Linda's sodium) crossing the reference range; both were narrowed.
- **Teaching points stay fixed** (Linda's lactate 2.8 and creatinine 1.4, Robert's first troponin, Dorothy's platelets and INR, James's K, Cr and Mg).
- **Live control → Cases (instructor only):** "Cardiac 1 — Robert Miller, 68M, atorvastatin, lisinopril"; **Reroll** a patient before Start (keeps the join code and who joined); **Lock variant** to reuse it in new sims. The Command center and the debrief show the same labels. Students never see case titles.
- **Patient editor → Case template:** title, sex, age range, fixed / range per vital, lab range or teaching point, "fixed / any from class" per home med and medication order, excluded drugs, warnings, sample variants, Check variants. The Patient library groups cases by category (first topic tag).
- **Starter patients converted** to cases with proposed ranges, placeholders and med classes; with the file's own name, age and sex they reproduce the original files exactly (tested). **Start demo sim** uses the cases as written, so the demo guide's names still apply; other new sims get fresh variants.
- Tests: 224 passing.

## Away status, time away, shared computers, break presets (Part A)
- **Away / reconnecting:** while a student's screen is open it checks in every 10 s (presence, not logged). Live control → Students and the Command center show "⚠ Away / reconnecting (2 min)" when it has been silent longer than `awayAfterSec` (45 s) during the sim. When it checks in again, `reconnected` is logged with the time away. Live control's Students table now refreshes every sim minute.
- **Debrief:** a "↻ away N min (k×)" total per student (reconnects, rejoins and approvals).
- **End of sim on this computer** (student home, the reflection / sim-ended panel, and Live control for the instructor): after a confirmation, clears that user's drafts, rejoin token and saved place on this computer (`storage.removeMatching`). A student's tab then acts as a new device, so signing back in as them needs the token or your approval. Their charting in the sim is kept.
- **Break 5 / 10 / 15** buttons, **Break…** for another length, and **Extend break +5** while on a break (logged).
- Fixed: the Command center read the wall clock inside the engine; `now` is now passed in (B4).
- Tests: 211 passing.

## Crash safety and rejoin tests (Part E)
- **Fixed (found by the kill tests): a killed browser could lose the last ~5 seconds** (Chromium writes localStorage to disk in batches), including a just-started task or delegation. `storage.js` now also writes every save to IndexedDB, which reaches disk at once, and `restoreBackup()` puts newer copies back before the app loads. Reset demo waits for both to clear.
- **Fixed:** after a crash the instructor came back to the Command center instead of their view, because "picked a view" lived in sessionStorage. It's now remembered per sim. The rejoin "waiting for your instructor" message now shows.
- **Headless crash / rejoin tests**, 13 + 6 checks, all passing. Each compares the saved state (roster, students' handoffs and task timers, delegations, priorities) before and after:
  - reload;
  - tab closed and reopened;
  - browser killed mid-typing, mid-task-timer and mid-delegation (relaunched with the same profile: form restored, sim paused at the last heartbeat, then the timer and the delegation resume and finish);
  - browser killed mid-editor-edit (unsaved name restored, same view);
  - Back button;
  - rejoin by re-entering the code (token on the device: same student, no duplicate);
  - rejoin with the token missing (Live control → Approve, the tab becomes that student).
- Questions added for the instructor and school IT: typical sim length and breaks, lab-computer idle logouts.
- Tests: 209 passing.

## Rejoin at the same spot (Part D)
- A student who reloads, crashes, closes the tab or goes Back and returns lands exactly where they were: same identity and group, open chart and section, drafts, running task timer, pending or queued delegations, alerts and priorities. Handoff "show once" stays closed (notes kept); a submitted reflection doesn't come back.
- **Re-entering the join code with the same name rejoins** that student (same userId and group) instead of "already joined" or a duplicate. This device: at once. Another device with the saved **rejoin token**: at once. Token missing: Live control shows "Ana is rejoining from another device" with **Approve / Deny**, and the waiting device switches to Ana when approved.
- **Every reconnect is logged with the time away** (`reconnected` after a reload, crash or closed tab; `student-rejoined`; `rejoin-requested / approved / denied`). Live control → Students has a **Connection** column ("↻ reconnected after 2 min (08:12)"), the Command center shows it for 10 sim minutes, and the debrief timeline lists them.
- Instructor and charge nurse come back to the same view; the one-writer-window lock still decides who has control.
- Tests: 209 passing.

## Save everything instantly (Part C)
- **Audit:** every charted action, priority, join, reflection, break and staff change is saved (`runner.commit` persists before the screen updates). What wasn't saved was typing in progress, so:
- **Drafts autosave as you type** (`shared/drafts.js`, 250 ms debounce, flushed when the page hides, via storage.js): chart notes, handoff notes while the report is open, reflection answers, the intervention and assessment forms in progress (which one, and the fields), MAR reasons, the scenario-change / reaction / state builders, Live control → Add event, Sim setup (groups and every field) and the patient editor's working copy. Coming back shows "✎ Draft restored · Discard". Submitting or Cancel clears it.
- **Back button stays in the app** (`shared/nav.js`): Back moves between tabs, instructor views, the patient chart and its sections. Back from the first screen asks "Leave the sim? Your work is saved".
- **Back where you were** after a reload or crash: tab, instructor view, open patient (even with the handoff report open), chart section, scroll position per screen.
- **Fixed:** a reload while the handoff report was open came back to the patient list.
- SPEC §13: in the full build every action is written to the server and acknowledged, and unacknowledged actions retry from the device with their original timestamps.
- Tests: 207 passing; browser check: reload restores the handoff notes, the oxygen form with 3 L, the half-typed note, the editor's unsaved name, the section and the scroll; Back walks Notes → Interventions → patient list; leaving asks first.

## Soak test: a 4-hour sim (Part B)
- Ran a full 07:00–11:00 sim in headless Chromium: 3 groups (one with an admission), 3 students charting every few minutes, assessments, notes, CNA delegation with queuing, call lights, every reactive script, recovery penalties, task timers (manikin) and the staff pool. Results at the end: **811 log entries, 286 KB saved session, JS heap 2.2 → 4.3 MB** (no leak; it grows with the log only).
- **Fixed:** the Command center and Live control recomputed timeliness and every flag rule several times per render, and re-rendered on every update. Now `timelinessItems` and `evaluateRules` are memoized per (immutable state, minute), and both screens coalesce bursts of updates into at most ~4 renders a second. Command center render at 4 h: **51 → 7 ms**; tick at 4 h 51 → 34 ms average; debrief render 85 ms; CSV export 44 ms.
- Automated checks can open the app with `?debug=1`, which exposes the runner to the page (never linked from the app).
- Tests: 207 passing.

## Long sims: Wake Lock and breaks (Part B)
- **Screen Wake Lock** while the sim is running: student tabs (home, chart, monitor) and the standalone bedside monitor page keep the screen on, release it when the sim is paused, on a break or ended, and take it back when the tab returns. Unsupported browsers carry on without it.
- **Break** (Live control): pick a length and the sim pauses; every screen, including the bedside monitor, shows "☕ Break — back at 10:45 (12 min)". Resume (or End) ends it; both are logged.
- SPEC §13: new **Long sessions (1–4 hr sims)** section for the full build (silent token refresh, no idle logout, away status or PIN lock, Wake Lock, offline-safe charting with original timestamps, server-owned clock and state, breaks, clean logout on shared computers, log retention).
- Tests: 207 passing.

## Next due in the busy banner
- While a student is busy (or has a paused task), the banner lists the required reassessments coming due on their group's patients, soonest first: "Next due: Glasgow Coma Scale / NIH Stroke Scale / Pupils · Rm 205 in 10 min". Overdue ones are marked ‼ and ones due within 15 min ◷ (symbol + color). It looks an hour ahead using the same timeliness items (`upcomingReassessments`), so it always agrees with the Command center and the debrief.
- Tests: 206 passing.

## Pause a task
- **Pause task** in the busy banner: step away from a task (e.g. an emergency) and come back to it. The student is free while it's paused; **Resume** carries on with the time it had left; **Drop task** gives it up (logged as interrupted, not charted). One paused task at a time; you can't resume while busy with another task.
- Durations count active time only: the debrief's Task time excludes pauses (and marks paused tasks), and nothing counts as "went late while busy" during a pause. Live control → Students shows a student's paused task.
- Tests: 205 passing.

## Command center: staffing per group
- Each group card shows its delegation helpers: "Staff: CNAs 2/2 busy · LPNs 0/1 busy · 1 waiting for a helper". It's highlighted when every helper of a role is busy or on break, or a task is waiting. From `staffing()` in `engine/command-center.js`, built on `staffView`.
- Tests: 203 passing.

## Task timers default to manikin mode
- `taskTimerMode` now defaults to **manikin** (scenario-defaults and the starter scenario): a short lockout (¼ of the task time, at least 5 s), since the task really happens on the manikin. Screen only (full time) and off are still in Sim setup, which lists manikin first. Demo guide updated.

## Delegation staff pool (Part B)
- **Each group has helpers** (Sim setup → per group "CNA helpers" / "LPN helpers"; default `staffPool` { CNA: 2, LPN: 1 }, proposed). **This replaces the flat `delegationDelayMin`.**
- **Delegating assigns a free helper** of that role, who is busy for the task's own time × the role's `speedFactor` plus `travelSec` (`staff.json`: CNA ×1.2, LPN ×1, 60 s walk, proposed), then reports back as before.
- **Nobody free:** the student sees "No CNA free (next free at 07:07)" and chooses **Do it myself** or **Queue for a CNA** (`settings.delegationQueue`, Sim setup). Queued tasks start when a helper frees up and are timed (new timeliness kind "Waiting for a CNA", `rules.timeliness.delegationQueue` 10 / 20 min).
- **Student staff panel** (home and chart): each helper free / busy (task, room, time left) / on break, plus tasks waiting.
- **Charge nurse and instructor** (Charge tab → Staff; Live control → Staff): move a free helper to another group, Break / Back from break, and + / − helpers per role per group. All logged.
- **New rule `delegation-overload`** (`rules.json`: more than 4 delegations in 15 min → amber, proposed); inappropriate-delegation still applies.
- **Debrief → Delegation:** each delegated task (to whom, wait for a helper, queued, done) and helper utilization per group. Busy and idle times use when the sim actually stopped.
- Tests: 202 passing (pool, refusal with next free time, queue start, moves / breaks / counts, overload, debrief).

## Task timers (Part A)
- **Every task has a duration** (sim seconds, proposed): interventions and assessment tools carry `durationSec` (e.g. head-to-toe 8 min, full vitals 2 min, 12-lead ECG 5 min, IV start 5 min, Foley 10 min, GCS 1 min, NIHSS 7 min); MAR actions in the new `task-timing.json` (give 3 min, hold 30 s). Patients (`taskDurations`, patient editor → Task times) and sims (Sim setup → Task times for this sim) can override, with a seconds / minutes dropdown.
- **Busy while doing it:** charting a task starts a timer; the student sees a "Busy" banner with progress, time left and **Interrupt task** (logged as interrupted, nothing charted), and can't start another task on any patient until it finishes. Durations are sim time, so they scale with speed. Call lights, alarm silencing, rapid response / code and notify charge are always allowed (`allowedWhileBusy`, data).
- **Done counts at the finish:** the chart action is applied when the task ends, so order work, timeliness tags and reactions see it then.
- **`settings.taskTimerMode`** (Sim setup): screen-only (full time, the default), manikin (short lockout: × `taskTimerManikinFactor` 0.25, at least `taskTimerMinLockoutSec` 5 s), off.
- **Instructor:** Live control → Students shows what each student is busy with and time left, with **End now** (counts as done, logged); the Command center shows "⏳ Head-to-toe (3 min left)" per student.
- **Debrief → Task time:** each task (minutes, finished / interrupted / ended early), busy vs not-on-a-task time, and what went late on their patients while they were busy.
- Tests run with timers off unless a test turns them on (injected config). Tests: 198 passing.

## Smaller items (Part C)
- **Per-patient normal ranges** (`normalRanges` in a patient file; patient editor → "Normal ranges for this patient", blank = the usual range): used for recovery penalties, the event builder's "To" hint and improve/worsen, and noted in the debrief. Linda: SpO₂ 88–92% (COPD, proposed), so pushing her to 96% now counts as moving away from normal.
- **Command center:** each scripted patient shows its current state (◆, ⏸ when scripting is paused) and its recovery penalty (▼ penalty 40%).
- **Short labels for reactions** ("Short label" in the reaction form, up to 28 characters) show on diagram arrows instead of the cut-off trigger text. Linda's starter reactions have them.
- **`docs/INSTRUCTOR-QUESTIONS.md`:** every SPEC §14 question in plain language, grouped (patients and content, scoring and flags, timing, assessments and licenses, patient tags, settings), each with the current default and a blank for the answer. It also lists the AI-drafted content to review and the assessment tools to check with the school. Prints cleanly.
- Tests: 192 passing.

## Patient tags and filtered randomizer (Part B)
- **Patient tags** (`data/catalogs/patient-tags.json`, proposed; always called "patient tags", never confused with the triage tag): groups License level (LPN, RN), Unit / location (Med-surg, Surgical, Cardiology, ED, ICU, OB, Peds, Psych, Neuro, Rehab), Topic (respiratory, cardiac, sepsis, neuro, post-op, pain, falls, heart failure, admission, discharge) and Age group (peds, adult, geriatric). A patient can have several tags in any group (`patientTags`).
- **Patient editor:** tag chips per group (click to add or remove); **Add tag** and **Add group** right there, saved in this browser's copy of the catalog without losing unsaved edits.
- **Library:** "Find patients": filter by tag chips and search by name, room, diagnosis or tag, with a live count ("2 of 6 match LPN").
- **Sim setup randomizer:** pick allowed patient tags for the sim, and optionally per group. Within a group any tag matches; across groups all must ("RN AND (Med-surg OR Surgical)"). Combined with the triage color counts. Matching patients per color are shown before randomizing ("red 0/1 ⚠") with a clear warning when there aren't enough.
- The six starter patients are tagged (proposed). Unknown tags are load errors.
- Tests: 191 passing.

## Guided event builder (Part A)
- **One "Add event" form everywhere events are made:** scenario changes, reaction effects (Then), patient states and **Live control → Add event** (new per-patient button; **Start code** now opens it on Code). Pick the type (vitals change, rhythm change, call light, staff message, new orders, lab result, assessment change, state change, code / cardiac arrest, admission; reactions also offer findings, fire an event and recovery penalty), then only the fields that type needs, all dropdowns where a catalog exists.
- **Vitals rows:** vital (SpO₂, HR, BP systolic/diastolic, RR, temp, pain, GCS, glucose, O₂ device + L/min), direction (worsens / improves / set to; suggested from the normal range), **From auto-filled** with what the patient will be at that point (the dry run up to the change's time without the change; a reaction's state; the baseline for states; the live value in Live control), **To** with the patient's normal range as a hint, **Over** as a number + seconds / minutes / hours or instantly (stored in sim minutes), and a plain-English line ("SpO₂ worsens from 91% to 82% over 5 minutes.").
- **Engine:** vitals can trend with a different duration per vital (`overMinBy`) in keyframes, states, reaction effects and Adjust vitals; scenario-change keyframes can trend instead of jumping; new `script-state` event type (a scenario change can change the patient's state); code events carry a planned outcome and ROSC rhythm (the ROSC button uses it); Live control fires inline events (`fireLiveEvent`, logged with source "live").
- **Dropdown audit:** baseline rhythm and O₂ device + flow, code-branch interventions (was comma-separated ids) and rhythm, order sets (pick from the patient's sets), staff message senders (`staff.json messageFrom`), O₂ devices (`vitals.json o2Devices`). "Advanced: edit JSON" stays hidden.
- **Bug fixed:** saving a patient in the editor dropped baseline vitals the form didn't show (rhythm, HR note). Pain text after the number ("7/10 radiating to L arm") is kept by the builder.
- Tests: 187 passing (every starter reaction effect and scenario change round-trips through the guided form unchanged).

## Nursing assessment tools (Part B)
- **Catalog** `data/catalogs/assessment-tools.json` (proposed): 17 tools. NIHSS, BE-FAST, GCS (also the neuro check), pupils, Morse, Braden, numeric pain, Wong-Baker, FLACC, CPOT, POSS, RASS, CAM, CIWA-Ar, COWS, NEWS2 (calculated from vitals, view-only) and head-to-toe by system. Each has items with points, interpretation bands, a reassessment interval, delegation, and a **license** status. Anything not clearly public shows **License check needed** (Sim setup, Patient library, the editor). Licensed tools use paraphrased wording, and default scenarios offer only public tools. Per-entry catalog checks run on load.
- **Student charting:** a new **Assessments** chart tab, also reachable from linked Interventions (neuro check, pain, head-to-toe, fall precautions). Pick a tool and answer item by item; the score and interpretation update as you go and save with sim time. **Check patient** shows the scripted finding per item when `revealAssessmentFindings` is on; otherwise the student assesses the manikin. Delegation only where the catalog allows; the staff member reports the scripted answers. GCS and pain also go on the flowsheet. The tab lists reassessments due.
- **Orders can require tools:** `assessment: { tools, everyMin | once | afterDoseMin }` (Dorothy's neuro checks q2h/q1h, fall precautions, James's admission assessment, POSS 30 min after Margaret's oxycodone). These are new timeliness items (`rules.timeliness.assessments`) feeding the **Command center** (reassessments overdue), the debrief and the rules.
- **One authoring flow:** expected answers in the patient editor (baseline), in each script state, in each scenario change (an `assessment-change` event in the group) and as a reaction effect. Assessment scores are reaction triggers (score ≥ / > / ≤ / <, or rises by N). The state diagram shows states that change assessments. The dry run can have the student do a tool and shows the score and what it triggers. Sim setup chooses tools, reveal and grading. A patient with no assessment data still works: assess the manikin.
- **Debrief → Assessments:** each charted tool vs what the patient was (score, band, items that differed, ‼ Missed high risk), plus late or missed reassessments. **New flag rules** (`rules.json`, proposed): `assessment-mismatch`, `assessment-overdue`, `required-assessment-missing`. They're off when grading is off.
- **Starter data (proposed):** Dorothy: Morse (high), GCS, NIHSS, pupils and CAM that change at her 08:45 neuro decline. Margaret: POSS (2 after oxycodone; a CNA message if POSS ≥ 3 is charted), Braden, pain. Linda: NEWS2 and CAM (positive at her 08:00 change and while hypoxic). Robert: numeric pain (3 → 7 at 08:15). James: Braden, Morse and head-to-toe on admission.
- Tests: 180 passing.

## Recovery penalties (Part A)
- **Late treatment helps less, but neglect stays reversible.** A reaction can now give a **recovery penalty** (`then: { type: 'penalty' }`, `engine/penalties.js`): reduce recovery by a **percent of the way back** (20%: 70 → 99 becomes ~93) and/or **cap** a vital (SpO₂ recovers no further than 94). Optional per-vital scope, **wear-off** over N min once treated (the patient keeps improving minute by minute), and **slower recovery** (trend × factor). Penalties stack up to `recoveryPenaltyMaxPercent` (60, data) and can be turned off per sim (`recoveryPenalties`). Worsening is never limited. "Recovery" means moving toward `vitals.json recovery.normal`.
- New triggers: **a vital stays past a threshold for N min** (`duration`, e.g. SpO₂ < 80 for 5 min) and **the penalty reaches X%** (`penalty`, e.g. 40% → rapid response). Time in a bad state and delay before a required action use the existing countdowns.
- **Live control:** each patient's penalty total, each penalty with why and whether it wears off, **Add** (10–40%), **−10%**, **Clear** and **Clear all**. All logged; the patient's vitals follow (a running trend is re-aimed).
- **Builder:** "Recovery penalty" effect with a plain preview ("If spo2 <= 82 for 5+ min: recovery reduced 20% … Example: spo2 target 96 from 82 → ~93 instead of 96"); the new triggers in the When list.
- **Dry run:** a "Without penalties" column when penalties changed the outcome.
- **Debrief:** per patient, when each penalty was earned, why ("spo2 <= 82 for 5 min"), and each time it limited recovery ("spo2 84 instead of 90 … recovery takes 7.5 min"). CSV via the timeline rows.
- **Starter data (proposed):** Linda: SpO₂ ≤ 82 for 5+ min → −20% (SpO₂, RR; wears off over 30 min); SpO₂ ≤ 78 for 3+ min → −20% more, SpO₂ capped at 92, 1.5× slower; reaching 40% → the charge nurse calls rapid response. Template **Neglect penalty** (SpO₂ < 80 for 5+ min −20%; SBP < 90 for 10+ min −20% and slower).
- Tests: 169 passing (percent and cap math, stacking and max, wear-off, instructor override, full recovery without a penalty, switch-off, dry run, debrief).

## Reactive scripting: debrief and demo guide (stages 4–5)
- **Debrief → Patient states:** for each of the student's scripted patients, the state timeline (time, from → to, why: student action, nothing done in time, vitals threshold, scheduled event, another reaction, instructor) with the state's teaching note. Changes caused by nothing being done in time are red and marked "⚠ Nothing done". A per-patient chip counts them. It's in Print summary, and the CSV gets one `patient-state` row per change.
- README demo guide: Linda's script (watch her desaturate, try 2 L vs 6 L vs NRB, or do nothing), Live control's Patient scripts panel, the builder and Test this patient.
- Tests: 162 passing.

## Reactive scripting: builder, diagram, dry run, templates (stage 3)
- **Patient editor → Reactive script** (no JSON): pick the starting state; a **States** list (name, target vitals now or over N min, rhythm, findings, teaching note) and a **Reactions** list written as **When / If / Then** with dropdowns from the catalogs and the patient (interventions and their chart fields with all-of / any-of field tests, orders, med orders and MAR results with dose ranges, vitals thresholds, countdowns from a state, event, reaction or the start *without* chosen actions, chains; conditions on state, actions done or not done, vitals ranges, a time window; effects: state, vitals, findings, call light / staff message / new orders / lab result / code, fire an event). Readable errors in the form; renaming a state updates every reaction; deleting a state or reaction that's still used is refused with the reason.
- **State diagram** (SVG): states as boxes in columns from the start, state-changing reactions as arrows labelled with their trigger, "Any state" for reactions without a state condition. Click or press Enter on a box or arrow to edit it. Reactions without a state change are listed under it.
- **Test this patient**: a dry run of the working copy (unsaved edits included) in a throwaway session: wait, chart (with fields), give a med, mark an order done, fire an event, force a state. It shows state, vitals (and the trend it is heading for), what fired and why, and the alerts. Rows where nothing was done in time are amber. The live sim is never touched.
- **Duplicate** states and reactions; **reaction templates** in `data/catalogs/reaction-templates.json` ("O₂ response", "Fluid bolus response", proposed). Add one to any patient (taken ids get a suffix), save ticked reactions as a new template in this browser, and export the file. Templates are checked on load and may only point at their own states and catalog interventions.
- Help text for every builder field. Tests: 161 passing (form round-trip of every starter state and reaction, rename/delete guards, templates across patients, diagram layout).

## Reactive scripting: Live control overrides (stage 2)
- **Live control → Patient scripts** (`screens/instructor/live-script.js`, data from `engine/reactions/view.js`): each scripted patient's current state and since when; running countdowns ("⏱ 4 min 12 s left · If no Apply / titrate oxygen by 08:05 → go to Hypoxic") with **Skip**; what the patient is listening for; **Force state**, **Fire now**, **Disable / Enable** per reaction (with fires used / allowed), **Pause / Resume scripting**. It follows the Command center's group or patient filter.
- State changes also show in Recent activity (instructor only, "(nothing done in time)" or "(forced)" when that's the cause). Every override is logged and shows in the debrief timeline.
- Live control keeps open "details" sections and select choices when it re-renders.
- Manual vitals keep working; `scriptedVitalsAfterInstructor` decides whether the script takes back over.
- Tests: 153 passing.

## Reactive patient scripting: engine (stage 1)
- **Patient states and reactions** (`engine/reactions.js` + `engine/reactions/`): a patient file can carry a `script` of states (target vitals now or as a trend, rhythm, findings, label, teaching note) and reactions (*when* trigger, *if* conditions, *then* effects). Triggers: intervention charted with field tests (lpm, device…), order work, med given (by order, name or dose), vitals crossing a threshold (down or up), N min since a state, event or reaction *without* an action, and chains (another reaction or event fired). Effects: change state, vitals (now or trend), findings, any event type inline (call light, staff message, new orders, lab result, code) or fire one of the patient's event groups.
- Runs as a session processor in time order with events, trends and the monitor (processors can now ask the session to stop at an earlier moment: `nextAt`). Reactions also answer charting while the clock is paused.
- Loop protection: once by default, `repeat` up to `maxFires` (default `reactionMaxFires: 10`), never twice at one instant, and a per-instant cap (`reactionMaxPerInstant: 20`) with an instructor alert. Integrity checks name every broken reference.
- Scripted vitals follow `scriptedVitalsAfterInstructor` like keyframes (one shared helper). Instructor overrides (engine): force state, fire a reaction now, disable or re-enable, skip a countdown, pause and resume scripting per patient. All of these are logged.
- **Starter content for Linda (proposed):** the 08:00 worsening starts a desaturation; O₂ at 1–4 L → about 86% (still below target); 5–9 L → 90% (in her 88–92% COPD target); ≥ 10 L or NRB → 96% (over-oxygenated, flagged as a teaching point); no O₂ within 5 min → SpO₂ 82% and RR 32 (CNA calls it in); no O₂ or rapid response within 10 more min → crashing, and the family hits the call light.
- Shared helpers pulled out: `countsAsWork` (orders), `setVitalsTarget` and `scriptedVitalsBlocked` (vitals-control). Same-minute vitals changes are now appended rather than overwritten, so every change is seen. Session format bumped to 14.
- Tests: 152 passing (10 new). Three older tests now scope to Robert, since Linda's script now adds her own call light and CNA message.

## Command center: flash on worse status
- A group card flashes for 4 seconds when its status gets worse (On track → Falling behind → Needs attention), so a change stands out on a TV. With reduced motion turned on, it shows a steady red outline for those 4 seconds instead. The ranking comes from one engine helper, `statusWorsened`, which also orders the cards. It's a UI cue only, so nothing is logged.
- Tests: 142 passing.

## Command center and timeliness tags
- **Timeliness** (`engine/timeliness.js`, one source): every timed order, scheduled med due time, call light and monitor alarm gets **On time / Late / Very late**, or while still open **Open / Open – late / Open – very late** (and **Never done** in the debrief after the sim ends). Thresholds per tier and per kind are data in `rules.json rules.timeliness` (proposed); scenarios can override them. tier-timeout, call-light-response and alarm-response now read these tags, so the command center, debrief and flags can't disagree.
- **Command center** (new instructor sub-view, the default while a sim is in progress): one card per group, worst first. Each card shows the students and which chart they're in; a status of On track / Falling behind / Needs attention (rule is data); counts of open orders, late, very late, meds overdue, call lights (longest wait), monitor alarms and red/amber flags; and per patient the instructor tag, a vitals trend arrow (thresholds in `vitals.json trend`) and the worst open item ("◉ Open – very late: 12-lead ECG, 30 min"). Click a group or patient → Live control filtered to it ("Show all" clears it).
- **Debrief Timeliness** section: each order and scheduled med with ordered/due time, done time, minutes and tag, worst first. Summary: on time / late / very late / never done, plus the median time to complete tier 1 orders. Included in Print summary and as CSV rows.
- Tags and statuses are color-blind safe (symbol + word + color, defined in data). Help text in `help.json`.
- **Fixed during the browser check:** daily meds active at shift start counted as due at 07:00, so every group showed "Needs attention" within an hour; they're now first due at `scheduledMeds.shiftStartDueMin` (120 = 09:00, SPEC §14). Meds not yet due no longer show as open.
- Tests: 141 passing.

## Full check (unsaved-changes guard, one writer window, catalog checks)
- Full browser run through every tab with no console errors and no unlabelled controls; multi-window check with real tabs (second window read-only, Take over, monitor page unaffected).
- README: one-window note. Tests: 134 passing.

## Per-entry checks for rhythms and help catalogs
- `rhythms.json`: each rhythm needs a label and a known drawing shape (sinus, fib, vf, flat); numbers in range; true/false flags; aliases are names, and no name may point to two rhythms. `help.json`: keys look like `screen.field`, texts non-empty. Run by the loader (bad catalog → problem banner) and the tests.
- Tests: 134 passing.

## One window writes the sim
- If the sim is open in a second window of the same browser, that window is **read-only** (no ticking, saving or pause-on-close) and shows "This sim is open in another window" with **Take over here**. Taking over makes the other window read-only within ~2 s. If the writing window closes or stops responding, the notice offers **Continue here**. The standalone monitor page never takes the lock.
- Checked with real tabs in the browser; the first version lost the lock during the take-over reload (fixed).
- Tests: 133 passing.

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
