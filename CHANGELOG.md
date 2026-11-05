# Changelog

Newest first. One entry per phase or feature. Update it in the same commit as the change.

## Unreleased: Phase 2 (in progress): clock, scheduler, events
- Sim clock (`js/engine/clock.js`): start, pause, resume, end, and speed 0.5x–8x as a serializable snapshot.
- Scheduler (`js/engine/scheduler.js`): due events by sim minute, repeats (`repeatEveryMin` / `repeatCount`); `trigger: "manual"` events only fire from "Fire now".
- Event and rule registries (`js/engine/registry.js`) and eight event types in `js/engine/events/`: new-orders, call-light, vitals-change, findings-change, staff-message, lab-result, code, admission.
- Action log (`js/engine/log.js`) and alerts (`js/engine/alerts.js`).
- Still to come in this phase: the session/runner, the instructor live-control screen (clock controls, Fire now, call lights), and student call-light answering.

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
