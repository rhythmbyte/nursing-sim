# Changelog

Newest first. One entry per phase or feature. Update it in the same commit as the change.

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
