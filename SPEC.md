# Nursing Sim — Prototype Spec

A web app for running multi-student, multi-patient nursing simulations. Students manage an assignment of patients while events unfold (orders, call lights, deterioration, codes, admissions). Everything is time-stamped so the instructor can debrief prioritization, delegation, and response time.

**Prototype goal:** one static page on GitHub Pages that demos every role's screen via tabs. No backend. State lives in the browser.

**Full-build goal (later):** real logins, multi-device realtime, persistent student records. The prototype must be structured so this is a swap of `js/storage.js` + an auth module, not a rewrite.

---

## 1. Roles

| Role | Prototype | Full build |
|---|---|---|
| Instructor | Tab | Instructor account |
| Student (RN) | One tab per student | Student account, joins via sim code |
| Charge nurse | Optional tab, enabled per sim | A student account assigned the role, or played by the instructor |

Permissions are decided by role, never hard-coded per screen. Every log entry carries a `userId` and `role` from day one.

---

## 2. Folder structure

Top-level layout below. The complete, current file-by-file map (every module, its status and the module boundaries) is `docs/ARCHITECTURE.md`; it wins if the two disagree.

```
index.html                 tab shell (Instructor | Student 1..n | Charge | Debrief)
css/
  base.css                 tokens (colors, triage colors, spacing), dark mode
  chart.css                Epic-style chart look
js/
  main.js                  boots app, loads data, mounts tabs
  storage.js               ONLY persistence layer (localStorage now, backend later)
  state.js                 central store + pub/sub (subscribe/emit)
  data-loader.js           fetches data/**/*.json, validates against schemas
  engine/
    clock.js               sim clock: start, pause, resume, speed (0.5x–8x), shift-time display
    scheduler.js           fires scheduled events at sim-time; also accepts "fire now"
    registry.js            event-type + rule registries
    events/                one file per event type (see §5)
    rules/                 one file per flag rule (see §7)
    vitals.js              current vitals per patient (keyframes + overrides)
    labs.js                lab orders → pending → resulted after delay
    assignment.js          group building, randomizer, join codes
    log.js                 append-only action log (every chart entry/intervention)
  screens/
    instructor/            live control, sim setup, review queue, patient editor (+ scenario changes, timeline), library
    student/               join, home (patient list), handoff modal, patient view, report sheet, call-light sound
    charge/                admissions board, unit overview
    chart/                 summary, monitor, orders, flowsheet, mar, labs, interventions, notes (+ handoff tab)
    debrief/               per-student debrief, CSV, print
    monitor/               bedside monitor display (also the standalone ?monitor= page)
    shared/                dom builder, timer, toast, badge, triage chip, modal, help, sound, labels
data/
  catalogs/                interventions, labs, staff, rules, vitals, vitals-presets, rhythms, priority-scales,
                           scenario-defaults, help, reflection, ui (prototype-only text)
  patients/                one JSON file per patient
  scenarios/               saved sim setups
  schemas/                 JSON schemas for validation (Claude Code writes these)
```

---

## 3. Sim clock

- Instructor controls: **Start, Pause, Resume, End, Speed** (0.5x, 1x, 2x, 4x, 8x).
- Sim time is tracked in elapsed minutes from start. Displayed as **shift clock time** (scenario `startClock`, e.g. `07:00` → "08:15").
- All scheduled events use `atMin` (minutes after start). The patient editor shows both: "atMin 75 = 08:15".
- Every log entry records sim time AND real wall time.
- Pausing freezes all timers (events, vitals cycles, lab delays, call lights).
- **End of shift:** if the scenario has an `endClock`, the sim ends there automatically (events due up to then still fire; Skip won't jump past it). Every sim clock shows the time remaining ("6h 45m left"). No `endClock` = open-ended.

---

## 4. Data model

### 4.1 Patient template (`data/patients/*.json`)

```jsonc
{
  "id": "p-robert-miller",
  "review": "approved" | "proposed" | "partial",   // whole-file review status
  "reviewNotes": ["…"],                          // things the instructor must confirm
  "source": "Instructor case: The Busy Med-Surg Shift",
  "demographics": { "name", "age", "sex", "room" },
  "tag": "red" | "yellow" | "green" | "black",      // default triage tag
  "priorityLabel": "High priority – immediate assessment",
  "admittingDx", "codeStatus", "allergies": [ { "agent", "reaction" } ],
  "hpi": "…",                                      // H&P narrative
  "pmh": [], "homeMeds": [ { "name", "dose", "freq" } ],
  "handoff": {                                     // shown once in the handoff popup (if enabled)
    "situation", "background", "assessment", "recommendation"
  },
  "vitals": {
    "baseline": { "bp": "148/88", "hr": 96, "rr": 20, "tempF": 98.6, "spo2": 94, "o2": "RA", "pain": "3/10" },
    "keyframes": [ { "atMin": 75, "values": { … }, "eventId": "…" } ]   // vitals change at time or when an event fires
  },
  "findings": {
    "baseline": [ "Alert and oriented x4", … ],   // revealed when the student charts an assessment
    "changes": [ { "eventId", "findings": [] } ]
  },
  "labs": [
    { "code": "trop-hs", "name": "High-sensitivity troponin", "value": "12", "unit": "ng/L",
      "status": "resulted" | "pending", "resultDelayMin": 20, "refRange": "≤19" }
  ],
  "orders": [ /* see 4.2 */ ],
  "events": [ /* see §5 */ ],
  "outcome": { "mode": "survive" | "die" | "instructor", "notes": "…" },
  "codeBranch": { … } | null,                      // optional path that turns the patient black
  "vitalsPresets": [ { "id", "label", "values": { … }, "overMin", "review" } ],  // optional patient-specific quick buttons (Live control)
  "debrief": {
    "shouldRecognize": [ "…" ],                    // INSTRUCTOR ONLY — never shown to students
    "instructorNotes": [ "…" ]
  }
}
```

### 4.2 Orders

```jsonc
{
  "id": "o-rm-ecg",
  "text": "Obtain 12-lead ECG immediately for recurrent chest pain",
  "type": "once" | "scheduled" | "prn" | "continuous" | "parameter",
  "tier": 1 | 2 | 3,                // 1 immediate, 2 urgent, 3 routine
  "review": "proposed",             // tiers are proposed until instructor approves
  "orderSet": "os-rm-chestpain",    // tier ordering is checked WITHIN an order set
  "activeFromMin": 0,               // or "activeOnEvent": "e-rm-pain"
  "interventionIds": ["ecg-12lead"],// which catalog interventions satisfy it
  "frequencyMin": 240,              // for scheduled
  "prn": { "max": 3, "intervalMin": 5, "requiresBefore": ["vs-bp"] },   // for prn
  "parameter": { "watch": "vitals.sbp", "op": "<", "value": 90, "requires": "notify-provider", "withinMin": 10 },
  "delegable": false                // may an LPN/CNA do it?
}
```

- **Order set:** a group of orders that arrive together (e.g. the 0815 chest pain orders). The priority-order rule compares tiers inside a set.
- **Parameter orders** ("notify provider for SBP < 90") are auto-checked: if the condition becomes true and the required action isn't charted within `withinMin`, flag it.

### 4.3 Catalogs

- `interventions.json` — categories → interventions. Each has `id`, `label`, `category`, `chartFields` (what the student fills in, e.g. site/gauge for an IV), `delegableTo` (["LPN","CNA"]).
- `labs.json` — lab codes, names, units, reference ranges, default result delay.
- `staff.json` — non-student staff available for delegation (LPN, CNA, charge, provider) and what each may do.

### 4.4 Sim setup (`data/scenarios/*.json` + created live)

Every setting has a default in `data/catalogs/scenario-defaults.json`; a scenario only lists what it changes (merged at load). The code has no built-in setting defaults.

```jsonc
{
  "id", "name", "startClock": "07:00", "speed": 1,
  "settings": {
    "handoffMode": "once" | "always" | "never",
    "chargeNurse": "student" | "instructor" | "off",
    "showTagsTo": ["instructor"],         // roles that may see the instructor's triage tags (instructor | student | charge)
    "priorityScale": "triage-colors",     // scale students prioritize with (data/catalogs/priority-scales.json)
    "vitalsCycleDefaultMin": 5,
    "pauseOnClose": true,                 // pause a running sim when the page closes/reloads (default true)
    "revealManualVitals": true,           // "Measure" reveals scripted temp/RR/pain (default true). false = from manikin/instructor
    "delegationDelayMin": { "LPN": 10, "CNA": 10 },  // or one number; when delegated staff report back
    "prnPreCheckWindowMin": 15,           // PRN pre-check window when the order doesn't set prn.requiresWithinMin
    "scriptedVitalsAfterInstructor": "apply", // after a live vitals change: "apply" next scripted keyframe, or "skip" it
    "delegatedAssessmentRevealsFindings": false  // does a delegated assessment reveal findings (when staff report back)?
  },
  "groups": [
    {
      "id": "g1", "name": "Group 1", "studentCount": 1,
      "patients": [ "p-robert-miller" ]                     // explicit picks…
      // …or: "tagCounts": { "red": 1, "yellow": 2, "green": 1, "black": 0 }  → randomizer fills
    }
  ],
  "assignment": "manual" | "random",
  "manualStudents": { "g1": ["student-id"] },
  "events": [ ]                                             // sim-level events (admissions, EMS)
}
```

### 4.5 Live session state

`{ joinCode, status, clock, groups, students: { id → { name, groupId, role } }, patientState: { id → { vitals, ordersStatus, callLight, tag, alive } }, log: [ … ] }`

### 4.8 Patient tags (`data/catalogs/patient-tags.json` + `patientTags` in a patient file)

Groups of labels (license level, unit, topic, age group, plus any the instructor adds) for finding and randomizing patients. `patientTags: { groupId: [tagIds] }`; several per group allowed. Filters: within a group any selected tag matches, across groups all must. Sim setup applies a sim-wide filter and optional per-group filters before filling triage color counts. Never shown as or confused with the triage tag.

### 4.7 Assessment tools (`data/catalogs/assessment-tools.json` + `assessments` in a patient file)

- **Catalog:** each tool has `id`, `name`, `category` (neuro, falls, skin, pain, sedation, withdrawal, systems, early-warning), `items` (choice options with points, a 0–N scale, a number, or free text), `scoring` (sum, single, rule with `positiveIf`, auto from vitals, none), inclusive interpretation `bands` (with a tone), `reassessMin`, `delegableTo`, optional `vitalsField` (GCS and pain also go on the flowsheet) and `license` { `status`: public / permission-needed / unknown, `note` }. Starter tools: NIHSS, BE-FAST, GCS, pupils, Morse, Braden, numeric pain, Wong-Baker, FLACC, CPOT, POSS, RASS, CAM, CIWA-Ar, COWS, NEWS2 (auto, view-only) and head-to-toe. Licensed tools use paraphrased wording.
- **Expected answers** (the answer key, `{ toolId: { itemId: value } }`): `assessments.baseline`, then `script.states[].assessments`, `assessment-change` events in scenario changes, and reaction effects `{ type: 'assessment', answers }`. Blank items aren't scripted, so the student assesses the manikin.
- **Reactions:** trigger `{ kind: 'assessment', toolId, op, value }` or `{ …, rise }` (rise versus the student's previous score on that tool).
- **Orders:** `assessment: { tools, everyMin? | once? | afterDoseMin? }`. These become timeliness items (`rules.timeliness.assessments`) that feed the Command center, the debrief and the rules. Tools the sim doesn't offer aren't timed.
- **Settings:** `assessmentTools` (`public` default, `all`, or ids), `revealAssessmentFindings`, `gradeAssessments`.

### 4.6 Reactive script (`script` in a patient file, optional)

Lets a patient mostly run itself: the patient reacts to what the student does (or doesn't do), and the instructor can override any of it live (§8).

```jsonc
"script": {
  "initialState": "baseline",
  "states": [ { "id": "hypoxic", "label": "Hypoxic (SpO₂ 82%)",                  // label is what the instructor sees
                "vitals": { "values": { "spo2": 82, "rr": 32 }, "overMin": 0 },    // 0 = now, N = trend over N min
                "rhythm": "sinus-tach", "findings": "state-p4-hypoxic",            // findings.changes[].eventId
                "note": "teaching point shown in the debrief" } ],
  "reactions": [ {
    "id": "r-…", "label": "No O₂ within 5 min: hypoxic",
    "when": { "kind": "elapsed", "since": "state", "state": "desaturating", "afterMin": 5,
              "without": [ { "kind": "intervention", "interventionId": "o2-apply" } ] },
    "if":   { "inState": [], "notInState": [], "vitals": { "spo2": { "max": 90 } }, "done": [], "notDone": [], "betweenMin": [0, 240] },
    "then": [ { "type": "state", "to": "hypoxic" } ],
    "repeat": false, "maxFires": 5 } ]
}
```

- **Triggers (`when.kind`):** `intervention` (charted, with `where` field tests such as `{ "lpm": { "min": 1, "max": 4 }, "device": { "excludes": ["NRB"] } }`; a list of these means any one of them), `order` (any work that counts for the order), `med` (MAR entry by order or med name, `result`, `dose` range), `vitals` (`field` `op` `value`, fires when the value crosses into it, so `<=` fires on the way down and `>=` on the way up), `elapsed` (`afterMin` since a `state` was entered, an `event` fired, a `reaction` fired, or the `start`, optionally `without` given actions), `fired` (another `eventId` or `reactionId`: chains).
- **Conditions (`if`):** current state in / not in, vitals ranges, actions done / not done, a sim-minute window.
- **Effects (`then`):** `state`, `vitals` (now or trend; rhythm is a vitals value), `findings`, `event` (any registered event type inline: call light, staff message, new orders, lab result, code), `fire` (one of the patient's events with its linked group).
- **Recovery penalties:** effect `penalty` { `percent`, `caps` { vital: value }, `vitals`, `wearOffMin`, `slowFactor`, `label` }; triggers `duration` (`field` `op` `value` held for `forMin`) and `penalty` (`atLeastPercent`). Penalties limit only recovery (toward `vitals.json recovery.normal`), stack up to `settings.recoveryPenaltyMaxPercent`, and are off when `settings.recoveryPenalties` is false. Neglect stays reversible by the right treatment; only a scripted code or death is final.
- **Guided events:** every event is made with one form (§8): scenario changes, reaction effects, states and Live control. Vitals targets may trend per vital (`overMin` for all, `overMinBy` per vital) in keyframes, states and effects. Event type `script-state` { `to` } changes a scripted patient's state from a scenario change. Code events may carry `outcome` (survive / die / instructor) and `roscRhythm`.
- **Repeats and loops:** a reaction fires once unless `repeat` (then up to `maxFires`, default `settings.reactionMaxFires`). It never fires twice at the same instant, and more than `settings.reactionMaxPerInstant` reactions at one moment stops with an instructor alert.
- **Vitals vs the instructor:** scripted vitals follow `settings.scriptedVitalsAfterInstructor` exactly like keyframes: `apply` (the script takes back over) or `skip` (the instructor keeps control; the state still changes, and the skip is logged).
- Every transition is logged (`reaction-fired`, `script-state` with its cause: student action, timeout, threshold, event, another reaction, or instructor).
- Broken references (states, reactions, events, interventions and their fields, orders, finding changes, rhythms, order sets, pending labs) are load errors (`engine/reactions/integrity.js`).

---

## 5. Event types (one file each in `js/engine/events/`)

Every event: `{ id, type, atMin | trigger, group?, repeatEveryMin?, repeatCount?, payload }`. Every event can also be fired live from the instructor "Fire now" panel.

**Linked events:** events that are one moment (a call light + its vitals change + its new findings) share a `group` string within the patient. "Fire now" fires the whole group, and members must share `atMin`/`trigger`/repeat settings (checked on load).

| Type | What it does |
|---|---|
| `new-orders` | Adds an order set to the patient; student gets an alert |
| `call-light` | Lights the patient's call light on the student home + patient view; logs time until the student acknowledges. Supports repeat ("every 4 min") |
| `vitals-change` | Applies a vitals keyframe |
| `findings-change` | Reveals new assessment findings (shown when the student next assesses) |
| `staff-message` | A message from the CNA/LPN/family ("Harold told the CNA he's ready to go home") |
| `lab-result` | Releases a pending lab value |
| `code` | Patient arrests: tag → black, code timer starts, instructor gets outcome controls |
| `admission` | A new patient arrives on the unit (charge nurse assigns, or goes to a set group) |
| `ems-arrival` | (not built yet; build phase 9) EMS crew arrives with a patient; charge decides accept now / hold the wall |

Adding a type = new file exporting `{ type, apply(state, event), describe(event) }` + register it.

---

## 6. Student experience

### Home
- List of assigned patients: room, name, age, dx, call-light indicator, new-orders badge, pending-lab badge, last-seen time. The instructor's tag is hidden unless `showTagsTo` includes `student`.
- **Student priorities:** students set their own priority for each patient (home list or chart banner) on the scenario's scale; they can change it any time and every change is logged with sim time. The debrief compares it with the instructor's tag over time.
- Sim clock always visible.

### Handoff popup
- `handoffMode: once` → opens the first time a patient is clicked. Student takes notes in a notes box. On close it's gone for good (notes stay). Time-stamped: opened, closed, duration.
- `always` → handoff available as a tab in the chart. `never` → no handoff.

### Patient chart (Epic-lite)
Tabs, left to right:
1. **Summary** — banner (name, age, room, allergies, code status), active problems, latest vitals, alerts.
2. **Orders** — active orders, with a status per order (new / acknowledged / done). New orders highlight until acknowledged.
3. **Flowsheet** — vitals table over time.
3a. **Assessments** — scored tools (§4.7): pick a tool, answer each item (Check patient reveals the scripted finding when the sim allows), live score and interpretation, NEWS2 from vitals, delegate where allowed, reassessments due.
   - **Bedside monitor** (chart tab + Full screen): HR/ECG, SpO₂/pleth, NIBP (last cycle time), RR, O₂ device, temp only with a probe. Shows only what the patient is connected for (tele / continuous pulse ox orders, NIBP cycle, or the student's Connect to monitor). Rhythm from vitals (`rhythms.json`). Alarm limits in `vitals.json`.
   - **Monitor cycle:** student sets an auto cycle (off / q5 / q10 / q15 min), or presses **Take BP now** to cycle the NIBP immediately (logged as a student action). A **Charted only** toggle hides monitor rows. BP, HR, SpO2 auto-populate each cycle from the patient's current vitals — like a real NIBP cycle. Monitor values (BP, HR, SpO2) **always** come from the device, whether by cycle or a charted vital-signs check; the student never types them.
   - **Manual entries:** anything a monitor doesn't give (temp, RR, pain, GCS, glucose, I&O, weight, neuro checks) is typed in by the student, and their value is compared with the scripted value in the debrief.
     - `settings.revealManualVitals: true` (default, for demos): a **Measure** button fills temp/RR/pain with the current scripted values.
     - `false`: nothing is revealed; the student gets temp/RR/pain from the manikin or instructor. Delegated staff also report only monitor values.
     - Either way the log stores the scripted values at that moment for the debrief comparison (never shown to students).
4. **MAR** — scheduled/PRN meds. Give, hold (with reason), or not given. PRN limits (e.g. nitro max 3, interval, required BP check first) **warn** before giving; the student can proceed and the dose is logged with the warning for the debrief (see DECISIONS.md, pending instructor confirmation).
5. **Labs** — student draws labs by charting "Draw / send labs" for an order with `labCodes`; they show "Pending" until `resultDelayMin` (or the catalog default) passes after the draw. Pending labs no order can draw count as drawn at sim start. A lab with no scripted value (e.g. Robert's repeat troponin) waits for the instructor to enter one; the instructor can also release any lab early.
6. **Interventions** — category buttons → intervention buttons → small form (chartFields) → Save. Each save is time-stamped. "Delegate to LPN / CNA" is an option on every intervention. A delegated task is done after `settings.delegationDelayMin`; the staff member then reports back as a staff message (vitals land on the flowsheet, labs get drawn, the order moves along). Effects happen at report time, not at delegation.
7. **Notes** — free-text nursing notes, time-stamped. Plus quick actions: "Notified provider", "Called rapid response", "Notified charge nurse", "Escalated".

Every action → `log.append({ simMin, wallTime, userId, role, patientId, action, details })`.

**Entered in error:** students can strike their own chart entries with a required reason; the original stays visible struck through, both are logged, and rules ignore struck entries.

---

## 7. Flag rules (one file each in `js/engine/rules/`)

Rules are pure functions of the session, re-evaluated whenever flags are shown (live control refreshes them each sim minute, the debrief on open). That's equivalent to running on every log append and clock tick, with nothing stored. Each returns flags: `{ ruleId, severity: "red" | "amber", patientId, userIds, message, atMin, logIds }`.

**Assessments:** `assessment-mismatch` (charted band or score differs from the script; red for a missed high-risk result), `assessment-overdue` (required reassessments late, from timeliness), `required-assessment-missing` (one-time requirement not done within `withinMin`). All are off when `settings.gradeAssessments` is false.

**Timeliness:** tier-timeout, call-light-response and alarm-response read one helper (`engine/timeliness.js`) with thresholds in `rules.json rules.timeliness`, shared with the command center and debrief.

**Thresholds and severities are data:** `data/catalogs/rules.json` (marked proposed), overridable per scenario under `settings.rules.<ruleId>`. Defaults are listed as instructor questions in §14.

| Rule | Flags when |
|---|---|
| `priority-order` | A lower-tier order in a set is done while a higher-tier order in the same set is still open (e.g. Foley before cardioversion prep) |
| `tier-timeout` | A tier-1 order isn't done within its window (default 5 sim-min, tier 2: 15) |
| `call-light-response` | Call light unanswered past a threshold |
| `parameter-breach` | A parameter order's condition is met and the required action wasn't charted in time |
| `inappropriate-delegation` | A non-delegable intervention was delegated (e.g. assessment of chest pain to CNA) |
| `allergy-conflict` | A med given that matches a patient allergy |
| `prn-limit` | PRN given beyond max or before interval / without its required pre-check. **Red.** The MAR warns and lets the student "Give anyway"; every override is logged with its warning codes and shows as a red flag in the debrief (pending instructor confirmation, §14) |
| `left-unattended` | (instructor-marked) student left an unstable patient — instructor toggles |
| `priority-mismatch` | A student's priority doesn't match the instructor's tag (at the time) for longer than `graceMin`. `enabled`, `severity`, `graceMin`, `flagUnassigned` in rules.json. Any rule can be switched off with `enabled: false`. |

Rule file shape: `{ id, label, evaluate(state, ctx) → flags[] }` (ctx: templates, catalogs, current sim minute, group → students).

---

## 8. Instructor screens

1. **Patient library** — list of patient templates with tag chips and review badges ("Needs review" for anything `proposed`).
2. **Patient editor** — a form, sectioned like her case write-ups, with no JSON in the normal workflow: editable orders and labs tables, outcome and code branch fields, and **scenario changes**. A scenario change is one moment in the case, built from: time (shift clock) or instructor-triggered, how it starts (call light / staff message / silent), what the patient says, new vitals, new findings, new orders with tiers, and what students should recognize. Saving generates the linked events. A per-patient **timeline** shows each change as a marker (click to edit, drag to retime). There are Duplicate patient and Duplicate change buttons, and "Advanced: edit JSON" is hidden behind a toggle: demographics → H&P → vitals → findings → labs → orders (with tier + order set + delegable) → events/timeline → debrief "should recognize". Saves to the same JSON format. Import/export JSON.
3. **Sim setup** — one sectioned page (prototype) rather than a step-by-step wizard:
   - name, start clock, speed, settings
   - add groups; per group: student count, then pick patients OR enter tag counts
   - assignment manual or random
   - "Create sim" → generates a 6-character join code
0. **Command center** (default while a sim is in progress) — one card per group, worst first: students and the chart they're in, On track / Falling behind / Needs attention, counts (open orders, late, very late, meds overdue, call lights with longest wait, monitor alarms, flags), and per patient the instructor tag, vitals trend arrow and worst open item with its timeliness tag. Click → Live control filtered to that group/patient.
3a. **Patient editor → Reactive script** — starting state, state diagram, States and Reactions lists (When / If / Then forms with catalog dropdowns), duplicate, reaction templates (add, save ticked as a template, export), and **Test this patient** (dry run).
4a. **Live control → Patient scripts** — per scripted patient: current state, running countdowns ("If no O₂ by 08:05 → Hypoxic") with Skip, what it's listening for, Force state, Fire now, Disable/Enable a reaction, Pause/Resume scripting. All logged.
4. **Live control** — **Adjust vitals** per patient (edit any value; apply now or trend over N minutes; quick presets from `data/catalogs/vitals-presets.json` and the patient's `vitalsPresets`; logged old → new and shown on the debrief timeline), clock controls, "Skip to next event" (jumps sim time to the next scheduled event and fires it); per-group/per-patient view of what each student is doing; "Fire now" for any event; push ad-hoc orders; toggle call lights; release labs; code controls (code start, "first responder charted at…", ROSC / no ROSC); mark "left unattended".
5. **Debrief** — per student (including their end-of-sim reflection answers, a **Patient states** timeline for scripted patients with "nothing done in time" changes highlighted, and a **Timeliness** table: each order and scheduled med with ordered/due, done, minutes, tag, worst first, plus a summary and the median tier 1 time): timeline of every action with sim times, red/amber flags inline, order sequence per order set (shown as done-order vs correct-order), handoff notes, response times (call lights, codes, parameter breaches). Export CSV + print view. Also: charted vs scripted vitals (tolerances in `rules.json` `vitalsCompare`) and each patient's "should recognize" list.

---

## 9. Charge nurse screens (optional per sim)

- **Unit overview** — every patient on the unit, current tag (live; only if `showTagsTo` allows the viewer, and a student charge nurse doesn't see priority-mismatch flags either), which student has them, open flags, pending admissions.
- The charge nurse sets their own priority for each incoming admission on the board, like students do.
- **Admissions/EMS board** — incoming patients with report; decide: assign to a group now, or hold (EMS "holds the wall"). Decision + time logged.

---

## 10. Assignment and join codes

- Sim creation generates a join code. Students enter code + name.
- **Manual:** students pre-placed into groups by the instructor.
- **Random:** each group has a `studentCount`; students are placed into open slots until full. A student is never placed in two groups; a full group is never over-filled. If more students join than slots, the instructor is warned.
- **Tag-count patient fill:** for each group, pick that many patients of each tag from the library, without reusing a patient across groups in the same sim. Warn if the library doesn't have enough of a tag.
- Prototype: student tabs simulate joining (a "Join sim" form on each student tab). The instructor's Live control shows the code and who has joined.

---

## 11. Build phases

1. **Shell + data** — tab shell, storage, state, data loader with schema validation, renders patient library read-only.
2. **Clock + scheduler + events** — clock with speed/pause, scheduled + fire-now events, call lights.
3. **Student chart** — home, handoff popup, chart tabs, interventions, log. Student views read patients through a filter that drops instructor-only fields (UI convenience only, see §13).
4. **Vitals + labs** — monitor cycle, manual entries, lab delays.
5. **Rules + debrief** — all §7 rules, debrief screen, CSV export.
6. **Instructor tools** — patient editor, sim setup wizard, randomizer, join codes, live control, review queue (every `proposed`/`partial` item in one list with Approve / Edit).
7. **Charge nurse + admissions** — unit overview, admission event.
8. **Polish + GitHub Pages deploy.**
9. *(Later)* EMS arrival, real auth + backend (Supabase), multi-device realtime.

Commit and push at the end of every phase at minimum (see CLAUDE.md).

---

## 12. Starter content

`data/patients/` holds six patients from the instructor's case "The Busy Med-Surg Shift" (0700–1500, five assigned patients + one unexpected admission). `data/scenarios/busy-medsurg-shift.json` recreates her setup.

- Patients 1–4: her content, transcribed. A few values were hard to read in the photos and are listed in `reviewNotes`.
- Patient 5: her content through 0700 vitals; the rest is drafted (`review: "partial"`).
- Patient 6: fully drafted (`review: "proposed"`).
- All order tiers, intervention mappings, and the optional code branch are proposed and need her review.

---

## 13. Full-build migration notes

Things in the prototype that will need to change for the real website (logins, backend, multi-device realtime). Add to this list whenever a prototype choice won't carry over as-is.

| Prototype | Full build | Where |
|---|---|---|
| `data/manifest.json` lists every data file because GitHub Pages can't list folders | Backend API lists and serves patients/scenarios/catalogs; manifest goes away | `js/data-loader.js` (only file that reads it) |
| Data loader `fetch`es static JSON | Same function signature, backed by API calls; returns the same shape | `js/data-loader.js` |
| Schemas validated in the browser only | Same JSON schemas also validated on the server before saving (never trust the client) | `data/schemas/`, `js/validate.js` |
| `storage.js` writes to `localStorage` (per browser, per device) | Backend client; sim state and logs are server-owned and shared across devices | `js/storage.js` |
| One page with a tab per role; anyone can open any tab | Each user sees only their role's screens after login; role comes from the auth session, not a tab | `js/screens/shell.js`, `js/main.js` |
| Instructor-only content (`debrief`, `reviewNotes`, `teachingNote`, etc.) ships to every browser in the patient JSON. Phase 3 adds a student-view filter, but it is a **UI convenience only, not security**: the full JSON is still downloaded and visible in dev tools | Server strips instructor-only fields before sending patient data to students. This is the real protection | `js/engine/student-view.js` (allow-list) → API |
| Sim clock runs in the browser | Server is the clock authority; clients sync to it so every device sees the same sim time | `js/engine/clock.js` |
| Pause on close (`settings.pauseOnClose`): the browser pauses its own sim on `pagehide`, or on boot using a heartbeat | The server owns the clock, so closing one device never pauses the sim. Drop the pagehide/heartbeat code. Pausing becomes an explicit instructor action (maybe an auto-pause when the instructor disconnects) | `js/main.js`, `session.pauseForClose` |
| Store pub/sub is in-memory | Same `on`/`emit` API, fed by a realtime channel (e.g. Supabase Realtime) | `js/state.js` |
| Join codes and student "joins" happen per tab (each tab = one device) | Real join flow tied to student accounts | `js/engine/roster.js`, `assignment.js` |
| Instructor edits (patient editor, review approvals, new sims) save in this browser (`storage.js` via `data-loader.js` `saveLocal`); publishing = export JSON + commit | Edits are API writes to a content database, with history and who approved what | `js/data-loader.js` |
| Ad-hoc orders live in session state (`adhoc`) and merge into effective templates | Same, server-side | `js/engine/templates.js`, `instructor.js` |
| **Paste a case write-up → auto-convert with AI** (not in the prototype) | The instructor pastes or uploads a case (text or photos of her write-up). A backend calls an LLM to draft the patient JSON and scenario changes, validated against the schemas. Everything arrives tagged `review: proposed` for her to check in the editor and review queue. Needs a backend (API key, uploads) | new server endpoint + editor import |
| Standalone monitor page (`?monitor=<pid>`) follows the sim only in the same browser (reads saved session) | Subscribes to the server's realtime channel, so a bedside tablet/TV on its own device shows the live monitor | `js/screens/monitor/standalone.js` |
| One writer window per browser (storage lock; others read-only with Take over) | The server owns the session; any number of devices view it, and control is a role/permission (instructor), not a window lock | `js/window-lock.js`, `main.js` |
| Tab bars and chart tabs are plain buttons (no arrow-key navigation) | Follow the ARIA tabs pattern (arrow keys, Home/End, roving focus) when the UI is rebuilt | `screens/shell.js`, `student/patient-view.js` |
| Debrief and live flags recompute every rule on each change and each sim minute (fine at prototype size) | Rules run server-side and incrementally (on each log append), with cached flags per session | `engine/rules/index.js`, `screens/debrief/`, `instructor/live-flags.js` |
| `engine/session.js` is near the file-size limit (end of shift, skip, pause-on-close live there) | Split the time-control helpers into their own module as part of moving the session to the server | `engine/session.js` |
| What each role may see is spread over separate settings (`showTagsTo`, `revealManualVitals`, charge visibility rules) | One permissions model: per role, what it can see and do, enforced by the server | `engine/priority.js`, `engine/vitals.js`, settings |
| **Welcome popup** ("Welcome to RN sims!", text in `data/catalogs/ui.json`, once per browser session) | **Prototype only: remove it** (and `ui.json` `welcome`) in the full build | `js/main.js` `showWelcome` |
| Instructor tags are hidden from students/charge in the UI (`showTagsTo`) but are in the downloaded JSON and session state | Server never sends the tag (or tag history) to roles not in `showTagsTo` | `engine/priority.js` `canSeeInstructorTags` → API |
| User identities are hard-coded (`instructor`, `student-N`) in `main.js` | `userId`/`role` come from the auth session; log format is unchanged | `js/main.js` |
| The tick timer (`setInterval` in `main.js`) runs the scheduler in each browser | Server runs `session.tick()` and broadcasts state; clients only render and send actions | `js/main.js`, `js/engine/runner.js` |
| One saved session per browser (`storage` key `session`); a reload resumes it | Sessions are server records with ids, so many sims can run at once and the debrief reads past sessions | `js/engine/runner.js`, `js/storage.js` |
| Reactions run in the browser that owns the session (the one writer window), as a processor in `session.advance()` | They run on the server, which is the clock authority; student actions reach it as API calls, and the same pure `engine/reactions.js` runs there | `js/engine/reactions.js`, `session.js` |
| Assessment tools whose license isn't clearly public (Braden, Wong-Baker FACES, CAM, POSS: permission needed; Morse, FLACC, CPOT, RASS, COWS, NEWS2: terms unknown) are in the catalog with paraphrased wording, flagged and left out of default sims | Confirm each license (or buy it) before the real course; replace paraphrases with licensed wording or drop the tool | `data/catalogs/assessment-tools.json` `license` |
| The answer key for assessments (`assessmentsExpected`) is in the browser; students get one item at a time via Check patient | The server holds expected answers and returns one item only when the sim allows | `engine/assessments.js` `revealItem` |

---

## 14. Questions for the instructor

Open questions to confirm with the instructor. Answers update the relevant section and DECISIONS.md.

1. **PRN limits: warn or block?** The prototype warns and lets the student "Give anyway" (e.g. a 4th nitro, or nitro without a BP first), logs the override, and flags it red in the debrief. Should the MAR hard-block instead?
2. **Manual vitals in class:** for live sessions, should `revealManualVitals` be off (temp/RR/pain from the manikin or instructor), with the debrief comparing charted vs scripted values?
3. **Delegation timing:** is 10 sim-minutes a sensible default for LPN/CNA tasks, and should it differ by task (vitals vs. lab draw)?
4. **Robert's repeat troponin** has no scripted value. Rising or flat? (The instructor currently enters it live when it comes due.)
5. **PRN pre-check (BP before nitro):** any BP in the last 15 sim-minutes counts, whether a monitor-cycle reading, "Take BP now", a charted BP or full vitals, or a BP reported back by delegated staff. The student doesn't have to chart a separate BP. Is that right, and is 15 minutes the right window? (Data: `prn.requiresWithinMin` per order, else scenario setting `prnPreCheckWindowMin`, default 15; catalog `satisfiedByMonitor: true` on the BP check.)
7. **Flag rule defaults** (`data/catalogs/rules.json`, all proposed):
   - **tier-timeout:** tier 1 within 5 min (red), tier 2 within 15 (amber), counted from when the order arrived. Orders already in place at shift start aren't timed (`includeShiftStartOrders: false`). Only one-time orders and event-triggered PRNs (e.g. "ECG now") are tracked.
   - **priority-order:** amber, within an order set, same tracked orders.
   - **call-light-response:** amber after 5 min, red after 10.
   - **parameter-breach**, **inappropriate-delegation**, **allergy-conflict**, **prn-limit**, **left-unattended:** red.
   - Are these windows and severities right?
8. **Allergy classes:** penicillin, sulfa and codeine lists in `rules.json`. Should penicillin allergy also flag cephalosporins (e.g. ceftriaxone)? Should codeine flag other opioids?
9. **Code response:** the first `code-respond` or `rapid-response` charted after a code counts as the response. Right?
10. **Charted vs scripted tolerance:** temp ±0.3 °F, RR ±2, pain ±1 before the debrief marks "differs". Right?
11. **Left unattended** is attributed to every student in the patient's group. Should the instructor pick one student?
12. **Linda's lactates:** the scripted repeat value (4.1) belongs to the STAT lactate in the sepsis order set (`forOrder`). If the "repeat in 2–4 hours" order is also drawn, its result is unscripted and the instructor enters it. Confirm the 4.1 value and which order it belongs to.
13. **Delegated assessments:** when an LPN does an assessment, should its findings show on the chart once they report back? Default: no (`delegatedAssessmentRevealsFindings: false`); the RN must assess.
14. **Monitor vs. manual vitals:** BP, HR and SpO₂ (plus the O₂ device) come from the monitor; temp, RR and pain are measured by hand; NIBP cycle choices are off / q5 / q10 / q15 (`data/catalogs/vitals.json`). Right?
15. **Lab result delay fallback:** 30 sim-minutes for any lab with no delay set in the patient file or the labs catalog (`labs.json` `fallbackDelayMin`). Right?
16. **After ROSC** the patient's tag becomes red (`settings.roscTag`). Right, or should it depend on the patient?
17. **Admissions board:** should the charge nurse's decision time (admission waiting on the board) be flagged past some threshold, and who plays charge in class (a student or you)?
18. **Which triage/priority system should students use?** The prototype uses red / yellow / green / black (matching your tags). Options: ESI 1–5, an acuity scale, or rank-ordering the assignment. Any of these can be added as data (`priority-scales.json`). Rank order needs a small engine addition.
19. **Priority mismatch:** amber after 10 min of mismatch (`graceMin`); patients never prioritized aren't flagged (`flagUnassigned: false`). Should it fire at all, and how strictly?
20. **During a code** the instructor tag becomes black (`settings.codeTag`). Right?
21. **Who sees your tags:** only you by default (`showTagsTo: ["instructor"]`). Should a student charge nurse see them?
22. **Live vitals vs. the script:** after you adjust a patient's vitals live, should the next scripted vitals event still apply (current default, `scriptedVitalsAfterInstructor: "apply"`), or be skipped so you stay in control (`"skip"`)?
23. **Vitals presets:** "Deteriorate" (SBP −25, DBP −12, HR +25, RR +6, SpO₂ −5 over 10 min) and "Improve" (roughly the reverse), with safety limits, in `vitals-presets.json`. Right values? Do you want patient-specific presets (e.g. Linda's septic shock)?
24. **Starter rhythms** (proposed): Robert sinus → sinus tach at 08:15, Margaret and Harold sinus, Linda sinus tach, Dorothy AFib, James sinus tach → sinus. Right?
25. **Monitor alarm limits** (`vitals.json alarmLimits`): HR 50–120, SpO₂ < 90, RR 8–28, SBP 90–180, DBP > 110. Right for this unit?
26. **Rhythm after a code:** ROSC → sinus tach (`roscRhythm`), no ROSC → asystole (`noRoscRhythm`). Right?
27. **Monitor connections:** telemetry orders connect ECG, continuous pulse ox connects SpO₂, NIBP only when the cycle is on or after Take BP now. Should any patient start fully connected? Which patients have a temp probe (`monitor.tempProbe`)?
28. **Breathing rate during an arrest:** pulseless rhythms (VF, pVT, PEA, asystole; `pulseless: true` in rhythms.json) now show RR "--" along with no SpO₂/pleth. Should RR instead show 0, or agonal breaths for a while? (Still open.)
29. **Reflection questions** (`reflection.json`, proposed): which patient you saw first and why; what change you recognized and what you did; what you delegated and whether it was appropriate; what you'd do differently. Right questions? Required or optional?
30. **Alarm response:** flag a monitor alarm not silenced within 2 min (amber) / 5 min (red) (`rules.json alarm-response`); alarms that clear on their own within 2 min aren't flagged. Silencing lasts 2 min (`vitals.json alarmSilenceMin`). Right thresholds? Should silencing require being in the patient's chart (it does today)?
31. **Timeliness thresholds** (`rules.json timeliness`, proposed): tier 1 late > 5 / very late > 15 min; tier 2 > 15 / > 30; tier 3 > 60 / > 120; scheduled meds > 30 / > 60 min past due; call lights > 5 / > 10; alarms > 2 / > 5. Right numbers?
32. **When are shift-start daily meds due?** Daily meds already active at 07:00 with no set time are first due at 09:00 (`scheduledMeds.shiftStartDueMin: 120`). Right, or should each med carry its own due time?
33. **Group status rule:** Needs attention = any very late item or any red flag; Falling behind = any late item or amber flag (`timeliness.groupStatus`). Too sensitive?
34. **Vitals trend arrow:** worsening if, over 15 min, SpO₂ drops ≥ 3, SBP drops ≥ 15 or HR rises ≥ 15 (`vitals.json trend`). Right?
35. **Linda's O₂ responses** (starter `script`, proposed): 1–4 L → SpO₂ about 86% (below target); 5–9 L → about 90% (in her 88–92% COPD target); ≥ 10 L or a non-rebreather → about 96% (over-oxygenated, a teaching point). Are those bands and numbers right, and should a Venturi mask be its own band?
36. **Linda's deterioration timing:** the 08:00 worsening starts a desaturation; no O₂ within 5 min → SpO₂ 82%, RR 32, HR 128; no O₂ or rapid response within 10 more min → crashing (SpO₂ 76%, RR 36, HR 138, BP 78/44). Right timing and values? Should notifying the provider also count as a response?
37. **Hypoxic and crashing findings for Linda** (`findings.changes` `state-p4-hypoxic`, `state-p4-crashing`, proposed): "Speaking in 2–3 word sentences, accessory muscles, anxious" and "Lethargic, dusky lips and nail beds, mottled knees". Accurate?
38. **Starter reaction templates** (`reaction-templates.json`, proposed): "O₂ response" (1–3 L → about 89%, ≥ 4 L or NRB → about 95%) and "Fluid bolus response" (≥ 500 mL → BP 104/62, HR 104 over 10 min, cap refill 2–3 s). Reasonable generic defaults? Which other templates would you reuse (pain med response, nitro response, insulin response)?
39. **Recovery penalties for Linda** (proposed): SpO₂ ≤ 82% for 5+ min → recovery −20% (SpO₂, RR), wearing off over 30 min after treatment; SpO₂ ≤ 78% for 3+ min → −20% more, SpO₂ recovers no further than 92%, 1.5× slower; at 40% total the charge nurse calls rapid response. Right size and timing for a teaching sim?
40. **Penalty limits and "normal":** total penalty max 60% (`recoveryPenaltyMaxPercent`); recovery means moving toward SpO₂ 94–100, HR 60–100, RR 12–20, SBP 100–140, DBP 60–90, temp 97.0–99.5 °F (`vitals.json recovery.normal`). Should COPD patients use their own SpO₂ range (88–92) here? Is a cap better read as "recovers no further than" (today) or as a hard floor/ceiling?
41. **Neglect penalty template** (`reaction-templates.json`): SpO₂ < 80 for 5+ min → SpO₂ recovery −20% for the rest of the sim; SBP < 90 for 10+ min → BP recovery −20% and 1.5× slower. Reasonable defaults?
42. **Assessment tool content** (`assessment-tools.json`, proposed): are the items, points and interpretation bands right for your course? For example Morse ≥ 45 high, Braden ≤ 12 high, CIWA-Ar ≥ 16 severe, POSS 3 = hold opioid, NEWS2 ≥ 7 high, CPOT ≥ 3 pain likely. Which tools do you have licenses for (Braden, Wong-Baker, CAM, POSS…)?
43. **Reassessment timing** (`rules.timeliness.assessments`): late after 30 min, very late after 60. Orders already active at shift start are first due 60 min in; a check up to 30 min early counts. Margaret's POSS and pain are due 30 min after each oxycodone dose. Right?
44. **Assessment grading** (`rules.json`): flag when the band differs or the score is off by 3+ (amber; red for a high-risk result charted as lower risk); one-time required assessments must be done within 60 min. Too strict? Should delegated assessments be graded?
45. **Starter assessment answers** (proposed): Dorothy Morse 100 (history, secondary dx, walker, saline lock, weak gait, forgets limits), GCS 15 → 14 (V4), NIHSS 0 → 4, right pupil 4 mm sluggish, CAM positive at her decline. Margaret POSS 1 → 2 after oxycodone, Braden 18. Linda CAM positive from 08:00. Robert pain 3 → 7. James Braden 17, Morse 45. Accurate?
46. **Which tools are delegable** (`delegableTo`): numeric pain to LPN/CNA; Morse, Braden and Wong-Baker to LPN; the rest RN only. Right for your scope of practice?
47. **Message senders and O₂ devices** (`staff.json messageFrom`, `vitals.json o2Devices`): CNA, LPN, charge nurse, provider, family, patient, RT, pharmacy, lab; room air, nasal cannula, simple mask, Venturi, NRB, high-flow NC, BiPAP/CPAP. Anything to add or remove?
48. **Normal ranges shown as hints and used for recovery** (`vitals.json recovery.normal`): SpO₂ 94–100, HR 60–100, RR 12–20, SBP 100–140, DBP 60–90, temp 97.0–99.5 °F, GCS 15, glucose 70–180, pain 0–3. Linda uses SpO₂ 88–92 (COPD). Right?
49. **Patient tag groups and starter tags** (`patient-tags.json`, proposed): License (LPN, RN), Unit (Med-surg, Surgical, Cardiology, ED, ICU, OB, Peds, Psych, Neuro, Rehab), Topic (respiratory, cardiac, sepsis, neuro, post-op, pain, falls, heart failure, admission, discharge), Age (peds, adult, geriatric). Starter patients: Robert RN · Med-surg/Cardiology · cardiac/pain; Margaret LPN+RN · Med-surg/Surgical/Rehab · post-op/pain/falls; Harold LPN+RN · Med-surg · respiratory/discharge; Linda RN · Med-surg · respiratory/sepsis; Dorothy RN · Med-surg/Neuro · neuro/falls; James RN · Med-surg/Cardiology · cardiac/heart failure/admission. Which patients are appropriate for LPN students?
