# Design decisions

A running log, newest first. Add an entry for any non-obvious choice, in the same commit as the change. Each entry records the date, the decision, why it was made, and the alternatives considered.

---

## 2026-11-05: A saved session resumes with wall time still counting
- **Decision:** The session (clock snapshot, fired events, log) is saved through `storage.js` on every change. On reload, a running clock picks up from its wall-time anchor, so time passed while the page was closed counts and due events fire in order on the first tick.
- **Why:** If the page freezes or reloads mid-sim, the sim keeps its place, matching the real-time feel the instructor runs on. A paused clock stays paused.
- **Alternatives:** Auto-pause on unload (safer for an accidental close, but then a refresh silently pauses a live class); not persisting at all (a freeze loses the sim). Revisit with the instructor.

## 2026-11-05: Orders active at shift start begin as "acknowledged"
- **Decision:** Orders with `activeFromMin: 0` start as `acknowledged` (received in shift report). Orders that activate later (by time or event) start as `new` and highlight until acknowledged.
- **Why:** Otherwise every order flashes "new" at 07:00, which drowns out the ones that really are new.
- **Alternatives:** Everything starts `new` (noisy). The admitted patient's orders come from their admission order set, so they're `new`.

## 2026-11-05: Interim student-to-group mapping
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
