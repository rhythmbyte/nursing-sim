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

**Processors (timed work besides events):** `session.advance()` runs the monitor cycle, lab results and delegated tasks as processors (`{ due(state, upto), apply(draft, upto, ctx) }`, listed in `PROCESSORS` in `session.js`). It interleaves them with events in time order, so a monitor reading at 08:15 sees the vitals change that fires at 08:15, and a skip or catch-up fills in every reading in between. To add timed work, write a processor in its own engine file and add it to `PROCESSORS`.

**Reactive scripts:** a patient's optional `script` (SPEC §4.6) is run by `reactionsProcessor` (`engine/reactions.js`). It reads new log entries and vitals-history entries for the patient, plus its own countdown deadlines, and applies effects through the event registry and `setVitalsTarget`. Processors can expose `nextAt(state, upto, ctx)` so `runProcessors` stops there first (time order holds through Skip and catch-up). The session also ticks while paused, so reactions answer charting done during a pause.

**Vitals history:** `patients[id].vitalsHistory` records every change (scripted keyframe, instructor adjustment, each sim minute of a trend). The monitor cycle and delegated reports read `vitalsAt(ps, t)` at their own reading time, parameter rules scan the history, and charting snapshots `ps.vitals` for the debrief. So a live change reaches everything, including catch-up after Skip.

**Data checks on load:** schema, then cross-field checks, then broken references (`engine/integrity.js`). A broken browser edit is skipped (the file version stays in use). A broken file patient is left out. A scenario runs without missing patients and is dropped only if none are left. All of this is shown at the top of the Instructor tab.

**Settings:** every scenario setting has a default in `data/catalogs/scenario-defaults.json`, merged under the scenario's own settings by `withDefaults()` in `main.js`. Engine and screens read the merged settings. **No setting or clinical default lives in code.** If one is missing, the code throws a clear error instead of guessing.

**Catalog-driven behavior (B1):** which interventions reveal findings (`revealsFindings`), capture vitals (`vitalsCapture`), draw labs (`drawsLabs`), include another check (`includes`, e.g. full vitals include a BP), can be satisfied by a monitor reading (`satisfiedByMonitor`), or appears as a Notes quick action (`quickAction`) is set in `data/catalogs/interventions.json`, not in code. Code-start and ROSC alert text is `settings.messages`. Patient labs can be reserved for one order (`forOrder`). Clinical defaults that aren't data yet go in scenario `settings`, and each one is a question in SPEC §14.

**Event groups:** events that are one moment in the story share a `group` string within one patient, for example Robert's call light, vitals change and new findings at 08:15. "Fire now" on any member fires the whole group, so all of their fired counts move together and the scheduled time can't half-fire the group later. The loader rejects a file whose group members don't share `atMin`, `trigger` and repeat settings.

**Pause on close:** if the scenario's `settings.pauseOnClose` is on (the default), `main.js` pauses a running clock on `pagehide`. It also saves a heartbeat every 5 s, and on boot it pauses a still-running sim as of the last heartbeat. That covers a crash or freeze where `pagehide` never fired.

**Error isolation:** the runner persists the new session *before* notifying the store, and the store catches errors per subscriber. A bug in one screen can't lose a charted action or stop other screens from updating.

**Instructor edits:** the patient editor, review-queue approvals and Sim setup validate with the same schemas and save through `data-loader.saveLocal()`. `loadAll()` overlays them on the files, and `main.js reloadData()` re-reads and remounts. They live in this browser only. To publish, export the JSON and commit it to `data/`.

**Roster:** students join with `state.joinCode`. `state.roster[userId] = { name, groupId }` decides which patients a student sees, who a flag belongs to, and who appears in the debrief.

**Screen lifecycle:** a tab's `mount(root)` may return a cleanup function, which unsubscribes from the store. The shell calls it before mounting the next tab. Any screen that subscribes **must** return a cleanup.

---

## 2. Folder map

| Path | What lives there | Status |
|---|---|---|
| `index.html` | Page shell; loads `css/base.css` and `js/main.js` | built |
| `css/base.css` | Design tokens (colors, triage colors, spacing), dark mode, shared component styles | built |
| `css/chart.css` | Epic-lite chart, handoff modal, forms, toasts | built |
| `js/main.js` | Boots the app: load data → pick scenario → create store + runner → build tabs → mount shell. Owns the tick timer (`setInterval`, 250 ms), the pause-on-close hooks (`pagehide` + a 5 s heartbeat), and the prototype user identities | built |
| `js/storage.js` | **Only** persistence layer (`load`, `save`, `remove`, `clearAll`, per-session `loadSession`/`saveSession`; keys prefixed `nursing-sim:`). Every save is mirrored to IndexedDB for crash safety; `restoreBackup()` at boot. `onSaveFailure(fn)` reports full or blocked storage (main.js shows a banner) | built |
| `js/state.js` | `createStore()`: `get`, `set(patch)`, `subscribe`, `on`/`emit` named events | built |
| `js/window-lock.js` | One writer window: `lockState` (pure), `createWindowLock` (check / takeOver / release / isWriter), used by `main.js` to gate ticking and saving | built |
| `js/case-seeds.js` | This sim's case seeds (`ui.cases` through `storage.js`): `instantiateSim`, `newSimSeeds` (a new sim / the demo as written), `reroll`, `clearReroll`, `caseKey` (a reroll before Start rebuilds patient states, keeping the join code and roster) | built |
| `js/data-loader.js` | `loadAll()`: manifest → fetch → schema-validate → cross-field checks → overlay this browser's edits → `{ patients, scenarios, catalogs, schemas, local, fileIds, problems }`. Also `validateItem`, `saveLocal`, `removeLocal` (instructor edits via `storage.js`) | built |
| `js/validate.js` | Small JSON Schema validator (subset; see header comment for supported keywords) | built |
| `js/review.js` | Helpers for `"review": "proposed"/"partial"` content (`countNeedsReview`, `needsReview`) | built |
| `js/engine/reflection.js` | `submitReflection` (after sim end, once, questions from `reflection.json`) | built |
| `js/engine/monitor-alarms.js` | `alarmProcessor` (alarm episodes), `acknowledgeAlarm` (silence + response time), `alarmEpisodes` (rule and debrief) | built |
| `js/engine/struck.js` | `activeLog` / `withoutStruck` ("entered in error" entries removed for rules and comparisons), `isStruck` | built |
| `js/engine/timeliness.js` | `timelinessItems` (orders, scheduled meds, call lights, alarms → tags), `timelinessConfig`, `tagFor`, `medDueTimes`, `debriefTimeliness`. Read by the command center, debrief and the tier-timeout / call-light-response / alarm-response rules | built |
| `js/engine/reactions.js` | Reactive script processor (`reactionsProcessor`), `initScript`, `tryFire` (loop protection, conditions, effects), `armedTimers`, `anchorOf`, `maxFires` | built |
| `js/engine/reactions/` | `match.js` (field tests, action matchers, thresholds, conditions), `effects.js` (`EFFECTS`, `enterState`), `control.js` (force state, fire now, enable/disable, skip countdown, pause/resume), `describe.js` (When/If/Then text), `view.js` (`scriptView` for Live control), `integrity.js` (`scriptProblems`), `dry-run.js` ("Test this patient") | built |
| `js/engine/penalties.js` | Recovery penalties: `limitOne` / `limitTarget` (percent, caps, slower), `penaltyFor` (stacking, max), `strength` (wear-off), `earnPenalty`, `changePenalty`, `penalizeTarget`, `reapplyTarget`, `penaltyProcessor` (per-minute wear-off) | built |
| `js/engine/assessment-score.js` | Assessment scoring (sum, single, rule, auto NEWS2, none), `bandFor`, `differingItems`, `availableTools`, `assessmentCatalogProblems` | built |
| `js/engine/assessments.js` | Expected answers (`applyExpected`, `expectedResult`, `isAlert`), `revealItem`, `chartAssessment` (+ delegation), `recordAssessment` | built |
| `js/engine/assessment-review.js` | `assessmentRows`: charted vs expected (shared by the debrief and `assessment-mismatch`) | built |
| `js/engine/assessment-integrity.js` | `assessmentProblems`: tools, items and values in baselines, states, events, reactions and orders | built |
| `js/screens/chart/assessments.js` | Assessments chart tab (tool picker, item form with Check patient, live score, NEWS2, Due list) | built |
| `js/screens/instructor/assessment-answers.js` | Expected-answers editor (baseline, state, scenario change, reaction effect) | built |
| `js/screens/debrief/assessment-section.js` | Debrief → Assessments | built |
| `js/engine/patient-tags.js` | Patient tags (not triage): `matchesTags`, `filterText`, `countByTriage`, `mergeFilters`, `patientTagProblems`; used by `fillByTagCounts` | built |
| `js/screens/instructor/patient-tags-ui.js` | `tagChips` (editor, library filter, Sim setup; Add tag / Add group saved locally) | built |
| `js/engine/tasks.js` | Task timers: `taskKey`, `durationSec`, `lockoutSec`, `taskPlan`, `beginTask`, `taskProcessor` (applies the action at the finish), `interruptTask`, `endTaskNow`, `busyView` | built |
| `js/engine/task-review.js` | `taskReview` (debrief: task times, busy vs idle, what went late while busy) | built |
| `js/screens/student/busy-banner.js` | Busy banner with progress and Interrupt task | built |
| `js/screens/instructor/duration-overrides.js` | Task duration overrides with a seconds / minutes dropdown | built |
| `js/engine/cases.js` | Case templates: `instantiate` (seeded name/age/sex, vital and lab ranges, teaching points, `valuesRel`, one drug per `medClass`, placeholders), `instantiateScenario` (instance ids `id`, `id~2`; rooms; seeds), `fileIdentity`, `allowedDrugs`, `fillText`, `caseLabel` | built |
| `js/engine/case-check.js` | Variant integrity: `rangeWarnings` (static, for the editor), `variantProblems` (samples variants and compares dry runs with the case as written), `thresholds`, `vitalOf` | built |
| `js/engine/staff.js` | Delegation staff pool: `initStaff`, `placeDelegation` (free helper or `NoHelperError` / queue), `startQueued`, `releaseHelper`, `helperSec`, `moveHelper`, `setOnBreak`, `setStaffCount`, `staffView` | built |
| `js/engine/staff-review.js` | `delegationReview` (debrief: to whom, waits, queued, utilization) | built |
| `js/engine/rules/delegation-overload.js` | Flag: too many delegations in a window (rules.json) | built |
| `js/screens/student/staff-panel.js` | Student: the group's helpers and queued tasks | built |
| `js/screens/charge/staff-board.js` | Charge / instructor: move, break, change counts | built |
| `js/engine/command-center.js` | `commandCenter` (per-group summary, worst first), `groupStatus` (data rule), `vitalsTrend` | built |
| `js/engine/monitor.js` | `monitorView` (what the bedside monitor may show), `connections`, `resolveRhythm` (aliases), `connectMonitor` (chart action), `rhythmProblems` | built |
| `js/screens/monitor/standalone.js` | `?monitor=<pid>` page: `standaloneView` (pure) + display-only mount that follows storage changes | built |
| `js/screens/monitor/` | Reusable bedside monitor display: `waveforms.js` (pure ECG/pleth math), `bedside-monitor.js` (canvas sweep, tiles, alarms, mute; one shared animation loop) | built |
| `js/engine/integrity.js` | `rhythmCatalogProblems`, `helpCatalogProblems` (per-entry catalog checks); `patientReferenceProblems` / `scenarioReferenceProblems`: ids that point at nothing (interventions, labs, events, keyframes, finding changes, order sets, forOrder, scenario patients). Run by the loader and the tests | built |
| `js/engine/settings.js` | `effectiveSettings` / `withDefaults`: scenario settings over `scenario-defaults.json`. Applied once in `main.js`; the engine reads only `state.settings` | built |
| `js/engine/findings.js` | `revealFindings` (shared by chart actions and delegation) | built |
| `js/engine/time.js` | `parseClock`, `formatShiftTime`, `shiftLengthMin`, `formatRemaining`, `round2` | built |
| `js/engine/clock.js` | Sim clock as a serializable snapshot + pure functions (`start`, `pause`, `resume`, `end`, `setSpeed`, `simMinutes`). `now` is always passed in | built |
| `js/engine/scheduler.js` | Which events are due (`collectEvents`, `dueEvents`, `nextAt`, `firstScheduled`); handles repeats; event groups (`groupMembers`, `eventGroupProblems`) | built |
| `js/engine/registry.js` | Event-type and flag-rule registries | built |
| `js/engine/events/` | One file per event type + `index.js` that registers them all (all SPEC §5 types except `ems-arrival`) | built |
| `js/engine/alerts.js` | `addAlert()` for alerts raised by events | built |
| `js/engine/log.js` | Append-only action log; every entry has `userId` + `role` | built |
| `js/engine/chart.js` | Student chart actions (open patient, handoff open/close/notes, acknowledge/complete order, chart intervention, MAR give/hold/not given, note, escalate). Reveals findings on assessment | built |
| `js/engine/prn.js` | `prnWarnings()` / `dosesGiven()`: the one PRN check (max, interval, required pre-check). Used by the MAR and by the prn-limit rule | built |
| `js/engine/student-view.js` | `studentView(template)`: allow-list filter for student screens. **UI convenience only, not security** | built |
| `js/engine/session.js` | Live session state + pure transitions (`createSession`, `tick`, `fireNow` (whole group), `skipToNext`, `pauseForClose`, `answerCallLight`, `controlClock`) | built |
| `js/engine/runner.js` | Stateful controller: owns the session, calls `session.*`, pushes to the store (`set({ session })`, `emit('tick')`), persists via an injected `persist` | built |
| `js/engine/rules/` | One file per flag rule (10: SPEC §7 + priority-mismatch + alarm-response) + `helpers.js` (config merge, tracked orders, responsibility) + `index.js` (`evaluateRules`) | built |
| `js/engine/talking-points.js` | Group debrief: `groupSummary` (on time / late / very late / misprioritized / missed, flags, call light and alarm averages, status) and `talkingPoints` (prompts from flags, timeliness, delegation waits, penalties and should-recognize items; wording from `data/catalogs/debrief-points.json`) | built |
| `js/engine/debrief.js` | `buildDebrief(state, userId, ctx)`: flags, response times, order sequences, charted vs scripted, handoffs, should-recognize, timeline | built |
| `js/engine/instructor.js` | `markLeftUnattended`, `pushOrder`, `startCode`, `setCodeOutcome`, `setCallLight` | built |
| `js/engine/vitals.js` | Monitor cycle (processor), device vs manual vitals, `measureManual` (respects `revealManualVitals`), scripted snapshots for the debrief | built |
| `js/engine/labs.js` | `initLabs`, `drawLabs`, result-delay processor, `releaseLab` (instructor) | built |
| `js/engine/delegation.js` | Delegated tasks: queued with a delay, completed by a processor (staff message, flowsheet row, lab draw, order progress) | built |
| `js/engine/orders.js` | `progressOrder`, `findOrder`, `firstWork`, `newOrderCount` (one helper for every "new orders" badge) | built |
| `js/engine/assignment.js` | Join codes, `placeStudent` (manual roster / random open slot, never over-fills), `fillByTagCounts` (randomizer, no reuse), roster lookups | built |
| `js/engine/vitals-control.js` | `adjustVitals` (apply now / trend), `trendProcessor` (steps once per sim minute), `vitalsAt` (vitals at any minute from `vitalsHistory`), `presetTarget`, `recordVitals` | built |
| `js/engine/priority.js` | `canSeeInstructorTags` (who may see instructor tags), `assignPriority`, `priorityTimeline` (student level vs instructor tag history), `scaleProblems` | built |
| `js/engine/admissions.js` | `assignAdmission` (re-bases orders that arrived while waiting), `holdAdmission`, `waitingAdmissions` | built |
| `js/engine/roster.js` | `joinSim` (code check, placement, overflow alert) | built |
| `js/engine/templates.js` | `effectiveTemplates`: file templates + instructor ad-hoc orders | built |
| `js/screens/shell.js` | Tab bar + panel + header slot (scenario picker). Remembers the active tab; runs each tab's cleanup before mounting the next | built |
| `js/screens/shared/` | `dom.js` (safe element builder `h()`), `badge.js`, `triage-chip.js`, `timer.js` (live sim clock), `modal.js` (`openModal`, `confirmWarnings`, `promptText`), `toast.js`, `download.js`, `sound.js` (beeps), `priority-picker.js` (student's own priority select), `labels.js`, `text.js`, `help.js` | built |
| `js/screens/instructor/` | patient editor: `patient-editor.js` (working copy, sections), `editor-model.js` (form ⇄ template), `editor-tables.js` (orders, labs), `change-model.js` (scenario changes ⇄ events/keyframes/findings/order sets, pure + tested), `change-builder.js` (the form), `patient-timeline.js` (click/drag markers); `index.js` (phases: Setup → Overview → Debrief), `setup-wizard.js` + `setup-groups.js` (the six-step wizard), `setup-ready.js` (join code, Start sim), `overview.js` (clock bar, alerts strip, Command center cards, More controls) + `overview-drawer.js` (patient / student / group drawer from filtered Live control panels), `builder.js` (Builder tab: editor, library, review queue), `live-cases.js` (cases, Reroll, Lock), `case-fields.js` (editor case section), `live-control.js` + `live-events.js`, `live-labs.js`, `live-flags.js`, `live-roster.js` (join code, students), `live-patients.js` (push order, call light, code/ROSC), `live-vitals.js` (Adjust vitals panel + presets); `review-queue.js`; `patient-editor.js` + `editor-model.js` (form ⇄ JSON) (clock controls, call lights, activity, event timeline with Fire now), `library.js` + `library-detail.js` (read-only library) | built |
| `js/screens/student/call-light-sound.js` | `litLights` (pure) + per-tab watcher (beep on new light, gentle repeat, remembered on/off) | built |
| `js/screens/student/report-sheet.js` | `sheetData` (pure) + `printReportSheet` (print-only container) | built |
| `js/screens/student/` | `join.js` (Join sim form until on the roster), `home.js` (patient list ↔ chart, last seen, badges, call lights), `handoff-modal.js` (mode "once"), `patient-view.js` (banner + section tabs) | built |
| `js/screens/instructor/script-editor.js` | Patient editor → Reactive script section (starting state, diagram, states and reactions lists, templates, Test this patient) | built |
| `js/screens/instructor/script-model.js`, `script-model-reactions.js` | Pure builder model: state and reaction form ⇄ data, rename, duplicate, delete guards, `applyTemplate`, `templateFrom` | built |
| `js/screens/instructor/script-state-form.js`, `script-reaction-form.js`, `script-when.js`, `script-parts.js` | State form; When / If / Then reaction form; shared option lists and check lists | built |
| `js/screens/instructor/script-diagram.js` | `diagramLayout` (pure) + SVG state diagram (click or Enter to edit) | built |
| `js/screens/instructor/script-test.js` | "Test this patient" dry-run modal | built |
| `js/screens/instructor/guided-model.js` | Guided event model (pure): vitals rows ⇄ values with per-vital durations, direction, plain-English preview, converters for scenario changes, reactions, states and Live control | built |
| `js/screens/instructor/guided-form.js` | The one "Add event" form (`eventForm`, `eventList`) used by the change builder, reaction Then, state form and Live control | built |
| `js/screens/instructor/live-script.js` | Live control → Patient scripts panel (state, countdowns, listening, overrides); `rebuildKeepingUi` keeps open details and select values across re-renders | built |
| `js/screens/instructor/command-center.js` | Command center sub-view (default while a sim is in progress); group/patient click → Live control filter | built |
| `js/screens/shared/tone-chip.js` | Symbol + word + color chips for timeliness tags and group status (data) | built |
| `js/screens/instructor/shortcuts.js` | `shortcutAction` (pure) + `installShortcuts` (Live control only, cleaned up on leave) | built |
| `js/screens/shared/leave-guard.js` | `setLeaveGuard` / `canLeave` / `onBeforeUnload`: "unsaved changes" protection checked by the shell tabs and instructor sub-views | built |
| `js/screens/shared/wake-lock.js` | `createWakeLock(isRunning)`: Screen Wake Lock while the sim runs (re-taken when the tab returns; silent where unsupported) | built |
| `js/screens/shared/break-banner.js` | Break banner on every screen and the standalone monitor (`breakText`) | built |
| `js/screens/shared/coalesce.js` | `coalesce(fn, ms)`: one trailing render per burst of store updates (Command center, Live control) | built |
| `js/screens/shared/drafts.js` | Drafts: `formDraft` (any form, restored in order), `textDraft`, `saveDraft`/`loadDraft`/`clearDraft`, `draftNote` | built |
| `js/screens/shared/nav.js` | In-app history: `navPush`, `onNav`, `installNav` (Back between screens; asks before leaving) | built |
| `js/screens/shared/shared-computer.js` | "End of sim on this computer": `studentKeys`, `instructorKeys`, `sharedComputerButton`, `markFreshDevice` | built |
| `js/screens/shared/labels.js`, `text.js` | `patientLabel` ("Rm 204 Linda Garcia"); `lines` (textarea → non-empty lines) | built |
| `js/screens/shared/help.js` | `helpTip(key)` / `helpField(screen, label, …)`: "?" help from `data/catalogs/help.json` | built |
| `js/screens/chart/search.js` | `searchInterventions` (label/id/synonyms), `recentInterventions` | built |
| `js/screens/chart/` | `index.js` (section order) + one file per section: summary, monitor, orders, flowsheet, mar, labs, interventions, notes, handoff (mode "always"); `vitals-form.js` (shared vitals inputs with Measure); `strike.js` ("Entered in error" button + struck display); `search.js`; `util.js` display helpers | built |
| `js/screens/debrief/` | three tiers: `index.js` (which tier, discussed / hidden points per sim), `summary.js` (Tier 1 group cards, print one page), `points.js` (Tier 2 talking points by theme), `breakdown.js` (Tier 3 per student of a group: every section with `sec-*` anchors for evidence links, CSV export, print), `sections.js`, `describe.js` (log entry → text), `csv.js` (`toCsv` pure, `downloadCsv`) | built |
| `js/screens/charge/` | `index.js` (tab; acts as `charge` or the instructor in role `charge`), `admissions-board.js` (report, Assign / Hold), `unit-overview.js` (live tags, students, call lights, codes, flags) | built |
| `data/manifest.json` | Lists every data file (GitHub Pages can't list folders) | built |
| `data/schemas/` | JSON schemas for patients, scenarios, and each catalog | built |
| `data/patients/` | One JSON file per patient template | built |
| `data/scenarios/` | Saved sim setups | built |
| `data/catalogs/` | `interventions.json`, `labs.json` (incl. `fallbackDelayMin`), `staff.json`, `rules.json` (flag thresholds/severities, allergy classes, code-response ids, vitals tolerances), `vitals.json` (monitor vs. manual fields, NIBP cycles), `scenario-defaults.json` (default for every scenario setting), `priority-scales.json` (student priority scales), `vitals-presets.json` (Live control quick vitals changes), `ui.json` (prototype-only UI text: welcome popup), `reaction-templates.json` (reusable script pieces for the builder), `assessment-tools.json` (scored nursing tools with licenses), `patient-tags.json` (patient tag groups for finding and randomizing), `task-timing.json` (MAR task times, default, what's allowed while busy), `rhythms.json` (monitor rhythms and how they're drawn) | built |
| `tests/` | Node tests (`node --test tests/`); dev-only, not loaded by the site | built |
| `.claude/` | Claude Code settings, the autosave Stop hook, and the PreToolUse hook that blocks commands mentioning env files | built |
| `docs/` | This file, `DECISIONS.md`, `INSTRUCTOR-QUESTIONS.md` (printable plain-language version of SPEC §14 + review and license lists; keep it in step with §14) | built |

---

## 3. Module boundaries (ask before changing any of these)

These rules are what make the move to the real website a swap instead of a rewrite. **CLAUDE.md requires explaining and asking before changing any of them.**

| # | Boundary | Why |
|---|---|---|
| B1 | **Clinical content is data.** Patients, scenarios, orders, events and catalogs live in `data/**/*.json`, never in JS. | The instructor edits content without touching code, and the full build moves it into a database unchanged. |
| B2 | **`storage.js` is the only file that touches `localStorage`** (or any persistence). | The full build replaces this one file with a backend client. |
| B3 | **`data-loader.js` is the only file that knows where data comes from** (the manifest, `fetch`, file paths) **and where instructor edits go** (`saveLocal` via `storage.js`). | The full build swaps static files and browser saves for API calls in one place. |
| B4 | **The engine (`js/engine/`) never touches the DOM**, and it gets wall time passed in (`now`) instead of reading the clock itself. | Engine code can be tested in Node and can later run on a server, which becomes the clock authority. |
| B5 | **Screens (`js/screens/`) contain no sim rules.** They render state and call engine functions. | Rules have exactly one home, so they can't drift apart between screens. |
| B6 | **Event types and flag rules are plugins.** One file each, registered through `registry.js`. | Adding a type or rule never edits existing logic. |
| B7 | **Shared state goes through the store** (`state.js`). Screens subscribe; they don't hold their own copy of sim state. | In the full build the store is fed by a realtime channel with the same `on`/`emit` API. |
| B8 | **Every log entry has `userId` and `role`.** | Logins in the full build fill in real IDs without changing the log format. |
| B9 | **Data is validated against `data/schemas/`** on load (and by the tests). | Bad data fails loudly instead of breaking a screen mid-sim. The full build reuses the same schemas on the server. |
| B10 | **Text from data is never inserted as HTML.** Build elements with `h()` from `screens/shared/dom.js`. | Data can't inject markup. This matters more once instructors edit content and other users see it. |
| B11 | **Student-facing screens (students, a student charge nurse) only read `studentView()` templates and never render the instructor's tag unless `canSeeInstructorTags(settings, role)`**. Student screens read plus live session state, never the full patient template. Findings reach students only by the engine copying them into session state when they assess. | Keeps answer-key content off student screens by accident. **UI convenience only, not security:** the JSON is still downloaded. The full build moves this filter to the server. |

Things that are UI conveniences only, **not** security: B11's student filter. The full JSON is still downloaded. See SPEC §13.

---

## 4. How to…

### Add a patient
In the app: **Instructor → Patient editor → New patient** (or **Duplicate patient**), fill in the sections, add **scenario changes**, then Save and **Export JSON** and commit it (steps 3–4 below). By hand:
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

### Add a flag rule
1. Create `js/engine/rules/<id>.js` that default-exports `{ id, label, evaluate(state, ctx) }` returning flags built with `flag()` from `helpers.js`: `{ ruleId, severity, patientId, userIds, message, atMin, logIds }`.
   - It must be **pure**: read the log and session state, never store anything. Flags are recomputed on demand.
   - Put every threshold and severity in `data/catalogs/rules.json` under `rules.<id>` and read it with `ruleConfig(state, ctx, id)` (scenarios can override). Add the defaults to SPEC §14 as instructor questions.
   - Who's responsible: the acting entry's `userId`, or `responsible(state, ctx, patientId)` for time-based flags.
2. Add one import and one array entry in `js/engine/rules/index.js`.
3. Add tests in `tests/rules.test.mjs`: a case that flags and one that doesn't.

### Add a chart section
1. Create `js/screens/chart/<id>.js` that default-exports `{ id, label, mount(root, ctx) }`.
   - `mount` builds static parts (forms) once and returns `{ update(state), destroy?() }`. `update` re-renders **only** dynamic parts, so a sim event never wipes out what the student is typing.
   - `ctx` = `{ store, runner, pid, view (student view), user, catalogs, scenario, act(name, args), patientState() }`. Change state only through `act(...)`, which calls `engine/chart.js`. No sim rules in the section.
   - Use `h()` and spread arrays into `append(...)`. `Element.append` does not flatten arrays.
2. Add one import and one list entry in `js/screens/chart/index.js` (that list is the tab order).
3. If the section needs a new action, add a pure function to `engine/chart.js` (logged with `userId`/`role`) and a test in `tests/chart.test.mjs`.

### Add a priority scale (e.g. ESI 1–5)
Data only: add an entry under `scales` in `data/catalogs/priority-scales.json` with `type: "levels"` and its `levels` (`id`, `label`, `description`, `tone`, and `matchesTags`, the instructor tags each level counts as matching). Select it with `settings.priorityScale`. A rank-order scale (`type: "rank"`) needs an engine addition in `engine/priority.js` (the comparison) before it can be used. Today it's refused with a clear error.

### Add a screen or tab
Tabs are built in `js/main.js` as `{ id, label, mount(root) }` objects and passed to `mountShell`. Put the screen in the right `js/screens/<role>/` folder.

---

## 5. Running and testing

- **Dev requirements:**
  - **Node 18+** for the tests.
  - **Python 3** (or any static server) to run the site locally.
  - **`jq`** for Claude Code's env-file guard hook (`.claude/hooks/block-env.sh`). The hook fails closed, so without `jq` every Bash command Claude Code tries is blocked with a "jq is required" message. Install it with your package manager (`pacman -S jq`, `brew install jq`, `apt install jq`).
- **Run:** `python3 -m http.server 8000` from the repo root, then open http://localhost:8000. Opening `index.html` from disk won't work, because `fetch` needs http.
- **Tests:** `node --test tests/` (Node 18+). `tests/loader.test.mjs` exercises the real data loader with a disk-backed fetch and in-memory storage. Shared test data (real starter content, all catalogs, merged settings) comes from `tests/fixtures.mjs`. They cover:
  - every data file against its schema, plus the manifest matching the files on disk;
  - the pure modules (time, review helpers, store);
  - engine modules as they're added.
- **Live site:** https://rhythmbyte.github.io/nursing-sim/ (GitHub Pages, deploys from `main`, root folder, on every push).
