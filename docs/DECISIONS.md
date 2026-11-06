# Design decisions

A running log, newest first. Add an entry for any non-obvious choice, in the same commit as the change. Each entry records the date, the decision, why it was made, and the alternatives considered.

---

## 2026-11-05: Monitor values always come from the device; manual vitals reveal is a setting
- **Decision:** BP/HR/SpO₂/O₂ are never typed. They come from the patient's current vitals via the monitor cycle or a charted vital-signs check. Temp/RR/pain are typed. With `settings.revealManualVitals` on (the default), a Measure button fills them with the scripted values. With it off, nothing is revealed (delegated staff report only monitor values too), and the student gets them from the manikin or instructor. The log keeps a scripted snapshot so the debrief can compare charted vs scripted values.
- **Why:** On-screen demos need values to come from somewhere, while live classes with a manikin need the student to measure.
- **Alternatives:** Always typed (unusable without a manikin); always revealed (no measurement skill in class).

## 2026-11-05: Monitor-cycle readings don't satisfy PRN pre-checks
- **Decision:** A required check like "BP before nitro" is met only by the student charting it (a BP, or full vitals, which `include` a BP) or a completed delegated check, within `requiresWithinMin` (default 15). A q15 cycle reading from 14 minutes ago doesn't count.
- **Why:** The teaching point is checking BP right before giving nitro. **Open question for the instructor** (SPEC §14).
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
