# Architecture

How the Nursing Sim prototype is put together. `SPEC.md` says **what** the app does. This file says **how the code is organized** and which rules keep it modular. Design choices and their reasons are in `docs/DECISIONS.md`.

Status markers: **(built)** exists now, **(in progress)** partly written, **(planned, phase N)** described in SPEC but not written yet. Keep these markers accurate.

---

## 1. The big picture

A static site: `index.html` + plain ES modules + JSON data. No build step, no backend, no dependencies. GitHub Pages serves the repo root as-is.

```
data/**/*.json ──► data-loader.js ──► store (state.js) ──► engine/ ──► store ──► screens/
  (content)        (fetch+validate)    (single source       (sim rules,     (pub/sub)   (DOM only)
                                        of truth)            no DOM)
                                              │
                                              └──► storage.js (the only persistence)
```

1. **Data files** hold all clinical content: patients, scenarios, catalogs.
2. **`data-loader.js`** reads `data/manifest.json`, fetches every listed file, and validates each one against `data/schemas/`. Invalid files are skipped and reported as `problems`.
3. **The store (`state.js`)** holds the loaded data and the live session. Screens subscribe to it.
4. **The engine (`js/engine/`)** applies sim rules: the clock, scheduled events, the log, and (later) flag rules. It takes state in and returns or mutates a copy. It never touches the DOM.
5. **Screens (`js/screens/`)** read from the store and call engine functions in response to clicks. They never contain sim rules.
6. **`storage.js`** saves and loads state. In the full build it becomes a backend client with the same API.

**The live loop:** `main.js` calls `runner.tick()` every 250 ms. The runner asks `session.tick()` for any events due at the current sim minute. If state changed, it calls `store.set({ session })` and persists the session. It always emits `store.emit('tick', simMin)`. Screens subscribe to `set` to re-render, and they use `tick` for cheap updates such as the clock and elapsed times. User actions (Start, Fire now, Answer) call runner methods, which follow the same path.

**Event groups:** events that are one moment in the story share a `group` string within one patient, for example Robert's call light, vitals change and new findings at 08:15. "Fire now" on any member fires the whole group, so all of their fired counts move together and the scheduled time can't half-fire the group later. The loader rejects a file whose group members don't share `atMin`, `trigger` and repeat settings.

**Pause on close:** if the scenario's `settings.pauseOnClose` is on (the default), `main.js` pauses a running clock on `pagehide`. It also saves a heartbeat every 5 s, and on boot it pauses a still-running sim as of the last heartbeat. That covers a crash or freeze where `pagehide` never fired.

**Screen lifecycle:** a tab's `mount(root)` may return a cleanup function, which unsubscribes from the store. The shell calls it before mounting the next tab. Any screen that subscribes **must** return a cleanup.

---

## 2. Folder map

| Path | What lives there | Status |
|---|---|---|
| `index.html` | Page shell; loads `css/base.css` and `js/main.js` | built |
| `css/base.css` | Design tokens (colors, triage colors, spacing), dark mode, shared component styles | built |
| `css/chart.css` | Epic-style chart look | planned, phase 3 |
| `js/main.js` | Boots the app: load data → pick scenario → create store + runner → build tabs → mount shell. Owns the tick timer (`setInterval`, 250 ms), the pause-on-close hooks (`pagehide` + a 5 s heartbeat), and the prototype user identities | built |
| `js/storage.js` | **Only** persistence layer (`load`, `save`, `remove`; keys prefixed `nursing-sim:`) | built |
| `js/state.js` | `createStore()`: `get`, `set(patch)`, `subscribe`, `on`/`emit` named events | built |
| `js/data-loader.js` | `loadAll()`: manifest → fetch → schema-validate → cross-field checks (`EXTRA_CHECKS`, e.g. event groups) → `{ patients, scenarios, catalogs, problems }` | built |
| `js/validate.js` | Small JSON Schema validator (subset; see header comment for supported keywords) | built |
| `js/review.js` | Helpers for `"review": "proposed"/"partial"` content (`countNeedsReview`, `needsReview`) | built |
| `js/engine/time.js` | `parseClock`, `formatShiftTime(startClock, simMin)` | built |
| `js/engine/clock.js` | Sim clock as a serializable snapshot + pure functions (`start`, `pause`, `resume`, `end`, `setSpeed`, `simMinutes`). `now` is always passed in | built |
| `js/engine/scheduler.js` | Which events are due (`collectEvents`, `dueEvents`, `nextAt`, `firstScheduled`); handles repeats; event groups (`groupMembers`, `eventGroupProblems`) | built |
| `js/engine/registry.js` | Event-type and flag-rule registries | built |
| `js/engine/events/` | One file per event type + `index.js` that registers them all (all SPEC §5 types except `ems-arrival`) | built |
| `js/engine/alerts.js` | `addAlert()` for alerts raised by events | built |
| `js/engine/log.js` | Append-only action log; every entry has `userId` + `role` | built |
| `js/engine/session.js` | Live session state + pure transitions (`createSession`, `tick`, `fireNow` (whole group), `skipToNext`, `pauseForClose`, `answerCallLight`, `controlClock`) | built |
| `js/engine/runner.js` | Stateful controller: owns the session, calls `session.*`, pushes to the store (`set({ session })`, `emit('tick')`), persists via an injected `persist` | built |
| `js/engine/rules/` | One file per flag rule | planned, phase 5 |
| `js/engine/vitals.js`, `labs.js` | Monitor cycles, lab delays | planned, phase 4 |
| `js/engine/assignment.js` | `studentSlots()`: interim rule where student tab N fills the Nth slot. Randomizer and join codes come in phase 6 | in progress |
| `js/screens/shell.js` | Tab bar + panel + header slot (scenario picker). Remembers the active tab; runs each tab's cleanup before mounting the next | built |
| `js/screens/shared/` | `dom.js` (safe element builder `h()`), `badge.js`, `triage-chip.js`, `timer.js` (live sim clock), `placeholder.js` | built |
| `js/screens/instructor/` | `index.js` (sub-views), `live-control.js` + `live-events.js` (clock controls, call lights, activity, event timeline with Fire now), `library.js` + `library-detail.js` (read-only library) | built |
| `js/screens/student/home.js` | Student home: assigned patients, call lights with Answer, alerts | in progress (phase 3 adds chart + handoff) |
| `js/screens/chart/`, `charge/` | Chart sections, charge nurse screens | planned, phases 3 and 7 |
| `data/manifest.json` | Lists every data file (GitHub Pages can't list folders) | built |
| `data/schemas/` | JSON schemas for patients, scenarios, and each catalog | built |
| `data/patients/` | One JSON file per patient template | built |
| `data/scenarios/` | Saved sim setups | built |
| `data/catalogs/` | `interventions.json`, `labs.json`, `staff.json` | built |
| `tests/` | Node tests (`node --test tests/`); dev-only, not loaded by the site | built |
| `.claude/` | Claude Code settings, the autosave Stop hook, and the PreToolUse hook that blocks commands mentioning env files | built |
| `docs/` | This file, `DECISIONS.md` | built |

---

## 3. Module boundaries (ask before changing any of these)

These rules are what make the move to the real website a swap instead of a rewrite. **CLAUDE.md requires explaining and asking before changing any of them.**

| # | Boundary | Why |
|---|---|---|
| B1 | **Clinical content is data.** Patients, scenarios, orders, events and catalogs live in `data/**/*.json`, never in JS. | The instructor edits content without touching code, and the full build moves it into a database unchanged. |
| B2 | **`storage.js` is the only file that touches `localStorage`** (or any persistence). | The full build replaces this one file with a backend client. |
| B3 | **`data-loader.js` is the only file that knows where data comes from** (the manifest, `fetch`, file paths). | The full build swaps static files for API calls in one place. |
| B4 | **The engine (`js/engine/`) never touches the DOM**, and it gets wall time passed in (`now`) instead of reading the clock itself. | Engine code can be tested in Node and can later run on a server, which becomes the clock authority. |
| B5 | **Screens (`js/screens/`) contain no sim rules.** They render state and call engine functions. | Rules have exactly one home, so they can't drift apart between screens. |
| B6 | **Event types and flag rules are plugins.** One file each, registered through `registry.js`. | Adding a type or rule never edits existing logic. |
| B7 | **Shared state goes through the store** (`state.js`). Screens subscribe; they don't hold their own copy of sim state. | In the full build the store is fed by a realtime channel with the same `on`/`emit` API. |
| B8 | **Every log entry has `userId` and `role`.** | Logins in the full build fill in real IDs without changing the log format. |
| B9 | **Data is validated against `data/schemas/`** on load (and by the tests). | Bad data fails loudly instead of breaking a screen mid-sim. The full build reuses the same schemas on the server. |
| B10 | **Text from data is never inserted as HTML.** Build elements with `h()` from `screens/shared/dom.js`. | Data can't inject markup. This matters more once instructors edit content and other users see it. |

Things that are UI conveniences only, **not** security: hiding instructor-only fields from student tabs (phase 3). The full JSON is still downloaded. See SPEC §13.

---

## 4. How to…

### Add a patient
1. Copy an existing file in `data/patients/` and rename it `pN-first-last.json`. The `id` inside must match the pattern in `patient.schema.json` (`p…`).
2. Fill it in following SPEC §4.1. Tag anything drafted by AI with `"review": "proposed"`, and never remove those tags.
3. Add the path to `data/manifest.json` → `patients`.
4. Run `node --test tests/`. The data test fails if the file is invalid or missing from the manifest.
5. Events that happen together (a call light plus its vitals and findings) share a `"group"` and must have the same `atMin`. The loader and tests enforce this.
6. To use the patient in a sim, add its id to a scenario group's `patients` (or `admissions`).

### Add an event type
1. Create `js/engine/events/<type>.js` that default-exports `{ type, apply(draft, event, ctx), describe(event) }`.
   - `apply` **mutates `draft`**, a fresh copy of the session state made for this firing. `ctx = { simMin, patientId, template }`.
   - Use `addAlert()` from `engine/alerts.js` to notify users. Don't touch the DOM.
2. Add one import and one array entry in `js/engine/events/index.js`.
3. Add the type name to the `event.type` enum in `data/schemas/patient.schema.json`.
   - If the new event belongs with others at the same moment, give them all the same `group` (see "Event groups" in §1).
4. Add a test in `tests/` that fires it against a small fixture.
5. Update SPEC §5 if it's a new kind of event.

### Add a flag rule (phase 5; the registry exists now)
1. Create `js/engine/rules/<id>.js` that exports `{ id, label, evaluate(state, logEntry?) }` returning `[{ severity: 'red'|'amber', patientId, message, logIds }]`.
2. Register it from `js/engine/rules/index.js` (create that file with the first rule, same pattern as events).
3. Add tests with a log that should and shouldn't flag.

### Add a chart section (phase 3; update this when it's built)
Planned contract: one file per section in `js/screens/chart/`, exporting `{ id, label, mount(root, ctx) }` and listed once in `js/screens/chart/index.js` so the tab order lives in one place. Sections read from the store and call engine functions; no sim rules in them.

### Add a screen or tab
Tabs are built in `js/main.js` as `{ id, label, mount(root) }` objects and passed to `mountShell`. Put the screen in the right `js/screens/<role>/` folder.

---

## 5. Running and testing

- **Dev requirements:**
  - **Node 18+** for the tests.
  - **Python 3** (or any static server) to run the site locally.
  - **`jq`** for Claude Code's env-file guard hook (`.claude/hooks/block-env.sh`). The hook fails closed, so without `jq` every Bash command Claude Code tries is blocked with a "jq is required" message. Install it with your package manager (`pacman -S jq`, `brew install jq`, `apt install jq`).
- **Run:** `python3 -m http.server 8000` from the repo root, then open http://localhost:8000. Opening `index.html` from disk won't work, because `fetch` needs http.
- **Tests:** `node --test tests/` (Node 18+). They cover:
  - every data file against its schema, plus the manifest matching the files on disk;
  - the pure modules (time, review helpers, store);
  - engine modules as they're added.
- **Live site:** https://rhythmbyte.github.io/nursing-sim/ (GitHub Pages, deploys from `main`, root folder, on every push).
