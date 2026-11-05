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
    instructor/            library, patient-editor, sim-setup, live-control, debrief
    student/               home (patient list), handoff-modal, patient-view
    charge/                unit-overview, ems-board
    chart/                 summary, flowsheet, mar, orders, labs, notes, interventions
    shared/                timer, toast, badge, triage-chip, modal
data/
  catalogs/                interventions.json, labs.json, staff.json
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

```jsonc
{
  "id", "name", "startClock": "07:00", "speed": 1,
  "settings": {
    "handoffMode": "once" | "always" | "never",
    "chargeNurse": "student" | "instructor" | "off",
    "showTagsToStudents": false,
    "vitalsCycleDefaultMin": 5
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

---

## 5. Event types (one file each in `js/engine/events/`)

Every event: `{ id, type, atMin | trigger, repeatEveryMin?, repeatCount?, payload }`. Every event can also be fired live from the instructor "Fire now" panel.

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
| `ems-arrival` | (phase 2) EMS crew arrives with a patient; charge decides accept now / hold the wall |

Adding a type = new file exporting `{ type, apply(state, event), describe(event) }` + register it.

---

## 6. Student experience

### Home
- List of assigned patients: room, name, age, dx, call-light indicator, new-orders badge, pending-lab badge, last-seen time. Tag color hidden unless `showTagsToStudents`.
- Sim clock always visible.

### Handoff popup
- `handoffMode: once` → opens the first time a patient is clicked. Student takes notes in a notes box. On close it's gone for good (notes stay). Time-stamped: opened, closed, duration.
- `always` → handoff available as a tab in the chart. `never` → no handoff.

### Patient chart (Epic-lite)
Tabs, left to right:
1. **Summary** — banner (name, age, room, allergies, code status), active problems, latest vitals, alerts.
2. **Orders** — active orders, with a status per order (new / acknowledged / done). New orders highlight until acknowledged.
3. **Flowsheet** — vitals table over time.
   - **Monitor cycle:** student sets an auto cycle (off / q5 / q10 / q15 min). BP, HR, SpO2 auto-populate each cycle from the patient's current vitals — like a real NIBP cycle.
   - **Manual entries:** anything a monitor doesn't give (temp, RR, pain, GCS, glucose, I&O, weight, neuro checks) is typed in by the student, and their value is compared with the scripted value in the debrief.
4. **MAR** — scheduled/PRN meds. Give, hold (with reason), or not given. PRN limits enforced (e.g. nitro max 3).
5. **Labs** — student orders labs from orders; they show "Pending" until `resultDelayMin` passes (instructor can override or release early).
6. **Interventions** — category buttons → intervention buttons → small form (chartFields) → Save. Each save is time-stamped. "Delegate to LPN / CNA" is an option on every intervention.
7. **Notes** — free-text nursing notes, time-stamped. Plus quick actions: "Notified provider", "Called rapid response", "Notified charge nurse", "Escalated".

Every action → `log.append({ simMin, wallTime, userId, role, patientId, action, details })`.

---

## 7. Flag rules (one file each in `js/engine/rules/`)

Rules run on every log append and on clock ticks. Each returns flags: `{ severity: "red" | "amber", patientId, message, logIds }`.

| Rule | Flags when |
|---|---|
| `priority-order` | A lower-tier order in a set is done while a higher-tier order in the same set is still open (e.g. Foley before cardioversion prep) |
| `tier-timeout` | A tier-1 order isn't done within its window (default 5 sim-min, tier 2: 15) |
| `call-light-response` | Call light unanswered past a threshold |
| `parameter-breach` | A parameter order's condition is met and the required action wasn't charted in time |
| `inappropriate-delegation` | A non-delegable intervention was delegated (e.g. assessment of chest pain to CNA) |
| `allergy-conflict` | A med given that matches a patient allergy |
| `prn-limit` | PRN given beyond max or before interval / without its required pre-check |
| `left-unattended` | (instructor-marked) student left an unstable patient — instructor toggles |

Rule file shape: `{ id, label, evaluate(state, logEntry?) → flags[] }`.

---

## 8. Instructor screens

1. **Patient library** — list of patient templates with tag chips and review badges ("Needs review" for anything `proposed`).
2. **Patient editor** — a form, sectioned like her case write-ups: demographics → H&P → vitals → findings → labs → orders (with tier + order set + delegable) → events/timeline → debrief "should recognize". Saves to the same JSON format. Import/export JSON.
3. **Sim setup** — wizard:
   - name, start clock, speed, settings
   - add groups; per group: student count, then pick patients OR enter tag counts
   - assignment manual or random
   - "Create sim" → generates a 6-character join code
4. **Live control** — clock controls; per-group/per-patient view of what each student is doing; "Fire now" for any event; push ad-hoc orders; toggle call lights; release labs; code controls (code start, "first responder charted at…", ROSC / no ROSC); mark "left unattended".
5. **Debrief** — per student: timeline of every action with sim times, red/amber flags inline, order sequence per order set (shown as done-order vs correct-order), handoff notes, response times (call lights, codes, parameter breaches). Export CSV + print view.

---

## 9. Charge nurse screens (optional per sim)

- **Unit overview** — every patient on the unit, current tag (live), which student has them, open flags, pending admissions.
- **Admissions/EMS board** — incoming patients with report; decide: assign to a group now, or hold (EMS "holds the wall"). Decision + time logged.

---

## 10. Assignment and join codes

- Sim creation generates a join code. Students enter code + name.
- **Manual:** students pre-placed into groups by the instructor.
- **Random:** each group has a `studentCount`; students are placed into open slots until full. A student is never placed in two groups; a full group is never over-filled. If more students join than slots, the instructor is warned.
- **Tag-count patient fill:** for each group, pick that many patients of each tag from the library, without reusing a patient across groups in the same sim. Warn if the library doesn't have enough of a tag.
- Prototype: student tabs simulate joining (a "Join sim" form on each student tab).

---

## 11. Build phases

1. **Shell + data** — tab shell, storage, state, data loader with schema validation, renders patient library read-only.
2. **Clock + scheduler + events** — clock with speed/pause, scheduled + fire-now events, call lights.
3. **Student chart** — home, handoff popup, chart tabs, interventions, log.
4. **Vitals + labs** — monitor cycle, manual entries, lab delays.
5. **Rules + debrief** — all §7 rules, debrief screen, CSV export.
6. **Instructor tools** — patient editor, sim setup wizard, randomizer, join codes, live control.
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
| Instructor-only content (`debrief.shouldRecognize`, review notes) ships to every browser in the patient JSON | Server strips instructor-only fields before sending patient data to students | data loader / API |
| Sim clock runs in the browser | Server is the clock authority; clients sync to it so every device sees the same sim time | `js/engine/clock.js` (phase 2) |
| Store pub/sub is in-memory | Same `on`/`emit` API, fed by a realtime channel (e.g. Supabase Realtime) | `js/state.js` |
| Join codes and student "joins" are simulated per tab | Real join flow tied to student accounts | `js/engine/assignment.js` (phase 6) |
