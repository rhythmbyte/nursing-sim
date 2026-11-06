# Changelog

Newest first. One entry per phase or feature. Update it in the same commit as the change.

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
