# Nursing Sim

Multi-student, multi-patient nursing simulation for prioritization, delegation, and critical thinking. Prototype: one static page with a tab per role, hosted on GitHub Pages.

- `SPEC.md` — full design (data model, screens, rules, build phases)
- `CLAUDE.md` — rules for Claude Code (save/push cadence, modularity)
- `docs/ARCHITECTURE.md` — code structure, module boundaries, how-tos
- `docs/DECISIONS.md` — design decision log
- `CHANGELOG.md` — what changed per phase
- Live demo: https://rhythmbyte.github.io/nursing-sim/
- `data/` — patients, scenarios, catalogs (all content is data, not code)

Patient content marked `"review": "proposed"` is drafted and awaits instructor review.

## Run locally

The page loads JSON with `fetch`, so serve the folder instead of opening `index.html` from disk:

```
python3 -m http.server 8000   # then open http://localhost:8000
```

New patient or scenario files must also be listed in `data/manifest.json`.

## Tests

```
node --test tests/
```

These validate every data file against `data/schemas/` and cover the pure modules. They're dev-only; the site itself has no build step.

Browser suites (the real app in headless Chromium; needs Node 22+, Chromium, Python 3):

```
tests/browser/all.sh              # all suites, about 15 minutes
tests/browser/all.sh debrief      # one suite
```

See `docs/ARCHITECTURE.md` §5 for what each suite covers.

## Demo guide

Live: https://rhythmbyte.github.io/nursing-sim/

**Fastest start:** Instructor → Setup → **Start demo sim** (starter scenario with the cases as written, a joined test student, clock running).

**The instructor flow in 3 minutes (wizard → Overview → debrief)**

1. **Instructor → Setup** is a six-step wizard: **Start from** (pick "Saved: The Busy Med-Surg Shift" or New sim) → **Groups and students** → **Patients** (pick cases, or "Random by patient tags and triage counts" with live match counts) → **Variation** (randomize names / vitals & labs / meds; off = the case as written) → **Sim options** (handoff, charge nurse, task timers, staff per group, assessments, shift times, speed; the rest under More options) → **Review** → **Create sim**. Defaults are fine: Next, Next, Next, Next, Next, Create.
2. **Ready** shows the join code big, who has joined and this sim's patients as "(C1) Cardiac 1 — *name, age, drugs*" with **Reroll** and **Lock variant**. **Projector view** opens the join code big, with who has joined, for the classroom screen (a second window; no patient information). Join on the **Student 1** tab with the code and a name, then **Start sim**.
3. **Overview** is the only screen while the sim runs: the clock bar (Pause, Break 5/10/15, Speed, Skip, End sim), the alerts strip (call lights, alarms, codes, rejoin requests) and one card per group. **Click a patient** for the drawer with everything for them: Adjust vitals, push order, call light, Add event, code / ROSC, script state with armed reactions and penalties, labs to release, events. **Click a student** for their status and rejoin approval. Everything else from the old Live control is under **More controls**. The **Builder** tab (editor, library, review queue) hides while the sim runs.
4. **End sim** goes straight to the **Debrief**: a **Summary** card per group (on time, late, very late, misprioritized, missed, flags, response averages; **Print summary** for one page), **Talking points** per group (prompts grouped by theme; tick as discussed, hide, or **Evidence →**), and the **Full breakdown** per student (every table, timeline and CSV export). After that, **Run again** (on the summary) repeats the same setup with a new code and new patients, or **1. New sim** starts a different one.

**The deeper tour (The Busy Med-Surg Shift)** below uses the older panel names in places: "Live control" is now the Overview's patient drawer or **More controls**, "Sim setup" is the wizard, the Patient editor and library are in the **Builder** tab, and the Debrief tab is the Instructor tab's **Debrief**.

**Case templates:** the demo uses each case as written (Robert Miller, Linda Garcia, …). Any other new sim makes new patients from the cases (per the wizard's Variation step); instructors always see the case code, e.g. "(C1) Robert Miller". The Ready screen lists them with **Reroll** and **Lock variant**. Builder → Patient editor → **Case template** has the code, ranges, medication classes, warnings and **Check variants**.

**One window at a time.** If you open the sim in a second window of the same browser, that window is read-only and offers **Take over here** (the bedside monitor page is the exception: it only displays).

**Reset first.** Click **Reset demo** (top right) and confirm. That clears this browser's running sim, edits, approvals and created sims. Everything in the demo lives in your browser only, so it never affects anyone else.

**5-minute click-through (The Busy Med-Surg Shift)**

1. **Instructor → Setup → Start demo sim**, or create a sim with the wizard and **Start sim** on the Ready screen. On the Overview, open **More controls** to point out the join code, the unit strip (triage tags), and the event timeline with linked events.
2. **Student 1 tab.** Type the join code and a name, then **Join**. Five patients appear (James is an admission later).
3. **Instructor → Start.** Then **Skip to next event** twice to jump to 08:15. Robert's call light comes on: his chest pain is back.
4. **Student 1 → Robert.**
   - The handoff report pops up once. Type a note, then **Close report**.
   - Answer the call light.
   - **Flowsheet → Take BP now.**
   - **Orders:** acknowledge the new 12-lead ECG.
   - **Interventions → Cardiac → 12-lead ECG → Save.**
   - **Interventions → Assessment → Focused assessment → Save.** The Summary now shows his new findings.
   - Set **My priority** in the chart banner. Students never see your tags; the debrief compares their priorities with yours. Tags show a shape as well as a color (▲ ◆ ● ✕).
   - **Monitor** tab: **Connect to monitor**, watch the ECG and pleth, try **Full screen**, or **Open in new tab** for a monitor-only page (a tablet or TV next to the manikin; same browser). On Live control, **Adjust vitals** (e.g. rhythm → AFib, or the Deteriorate preset) and watch the monitor follow and alarm. The student presses **Silence alarm** (response time is logged and graded).
   - **Interventions:** type "EKG" or "foley" in the search box; the **Recent** row fills in. Mark an entry **Entered in error** (reason required): it stays visible, struck through.
   - **Print report sheet** on the student home gives one page per patient (instructor: **Print all report sheets** on Live control).
   - **MAR → Give** nitroglycerin twice quickly. The second dose warns "too soon". Click **Give anyway** to show an override.
5. **Student 1 → Linda.**
   - Skip to her 08:00 deterioration first if you haven't.
   - **Instructor → Event timeline → Fire now** on her sepsis orders.
   - Back as the student: chart **Insert Foley** before the fluid bolus (a deliberate priority mistake).
   - **Linda reacts on her own** (reactive script, proposed content): at 08:00 she starts desaturating. Chart **Apply / titrate oxygen** with 2 L (stays about 86%, below her target), 6 L (90%, in her 88–92% COPD target) or a NRB (96%, over-oxygenated). Or do nothing: after 5 min she is hypoxic (SpO₂ 82%, RR 32, the CNA calls it in), and 10 min later she is crashing and her daughter hits the call light. **Live control → Patient scripts** shows her state, the countdown ("If no O₂ by 08:05 → Hypoxic") and buttons to force a state, fire a reaction, skip a countdown, disable a reaction or pause her script. The debrief's **Patient states** table shows each change and why.
   - **Task timers** (default **manikin** mode: the real task happens on the manikin, so the screen locks for only a quarter of the task time, at least 5 s): chart Linda's **Head-to-toe assessment**. A "Busy" banner counts down 2 sim minutes (¼ of 8), the banner also lists **Next due** reassessments so you can plan; you can't start another task until it finishes, you **Pause task** (step away and **Resume** later) or **Interrupt task**, and call lights still work. For sims without manikins, pick **Screen only** in Sim setup and the full 8 minutes apply. Live control → Students shows what each student is doing, with **End now**. The debrief's **Task time** shows busy vs idle time and what went late meanwhile. Sim setup → **Task timers** switches between screen-only, manikin (short lockout) and off.
   - **Staff pool:** (the Command center card shows "Staff: CNAs 2/2 busy" and highlights it when a role is fully busy or tasks are waiting) the student's **Staff** panel shows CNA 1, CNA 2 and LPN 1. Delegate three walks to a CNA. The third says "No CNA free (next free at …)" with **Do it myself** / **Queue for a CNA**. Charge tab → **Staff** (also in Live control): move a helper, send one on break, add or remove helpers. The debrief's **Delegation** shows who did what, waits, queued tasks and helper utilization. Sim setup sets helpers per group and whether queuing is allowed.
   - **Away and shared computers:** if a student's screen closes or goes quiet, Live control and the Command center show "Away / reconnecting" within about 45 s, and the debrief totals their time away. On a shared computer, **End of sim on this computer** (student home, the reflection panel, or Live control) clears that person's drafts and saved place.
   - **Long sims:** Live control → **Break 5 / 10 / 15** (or **Break…**), **Extend break +5**, (e.g. 15 min) pauses the sim and every screen shows "Break — back at HH:MM". **Resume** ends it. While the sim runs, student screens and the bedside monitor stay awake (Screen Wake Lock, where the browser supports it).
   - **Rejoin:** reload the page mid-task: the student comes back to the same chart, with the task timer still running. Re-entering the join code with the same name rejoins that student instead of joining twice; from a device without the saved token, Live control asks you to **Approve**. Live control shows "↻ reconnected after N min".
   - **Nothing is lost:** start typing a note or an O₂ form, then reload. It comes back with "Draft restored · Discard". The same goes for the patient editor's unsaved edits, Sim setup and the event builders. The browser's Back button moves between screens; on the first screen it asks before leaving.
   - **For the instructor:** print `docs/INSTRUCTOR-QUESTIONS.md`. It has every open question with the current default and space to answer, plus what needs review and which assessment tools need a license check.
   - **Patient tags:** Patient library → **Find patients** → click **LPN** (2 of 6 match). In Sim setup, set a group to "Random by tag counts" and tick patient tags for the randomizer. The matching counts per triage color update, and a warning shows if there aren't enough ("red 0/1 ⚠"). Patient editor → **Patient tags**: click chips, or **Add tag** / **Add group**.
   - **Add event (guided builder):** Patient editor → Linda → **Add scenario change** at 09:30 → Event: **Vitals change**. "From" fills with what she'll be by then (about 76% if untreated), "To" shows her normal range (88–92), and the line underneath reads it back ("SpO₂ improves from 76% to 90% over 5 minutes"). Add a **Code / cardiac arrest** with a planned outcome and ROSC rhythm. The same form is used for reaction effects, states, and **Live control → Add event** on any patient.
   - **Assessment tools:** in Dorothy's chart, open **Assessments** → **Glasgow Coma Scale** and use **Check patient** on each item (scripted answers fill in). The score and interpretation update as you go; **Save**. After her 08:45 decline, GCS drops to 14 and NIHSS rises to 4. Her neuro checks q2h show under **Due**, and late ones show on the Command center ("reassessments overdue"). To try Morse or Braden, tick them in **Sim setup → Assessment tools** (they're marked License check needed). The debrief's **Assessments** section compares what was charted with what the patient was.
   - **Recovery penalties:** leave Linda hypoxic past 08:10 and she earns a penalty (−20%). At 08:21 she earns a second one, which takes her to 40%, and the charge nurse calls rapid response. O₂ at 6 L then brings her only to about 84% instead of 90%, and it takes longer. The first penalty wears off over 30 min. Live control shows the penalty with **Add / −10% / Clear**. The dry run adds a "Without penalties" column, and the debrief lists each penalty and how it limited recovery.
6. **Charge tab.** Skip to 09:30. James waits on the **Admissions board**. **Assign now** to the group. He appears on Student 1's list.
7. **End the shift** (Overview → **End sim**, or let it reach 15:00). The student gets a short **reflection** form, and the Instructor tab goes to the **Debrief**: Summary → Talking points → Full breakdown. In the full breakdown, walk through:
   - the red/amber flags (nitro override, Foley before bolus, missed notifications);
   - the student's reflection answers beside each patient's "should recognize" list (possible mentions marked);
   - **Print summary** for a one-page-style handout per student;
   - priorities vs. your tags over time;
   - response times;
   - the order sequence (done vs. correct);
   - the timeline.
   - Then **Export CSV**.
8. Optional:
   - **Builder → Review queue:** every AI-drafted item with Approve.
   - **Monitor-only event:** in the patient editor, add a scenario change with "Silent" and a new **Rhythm (monitor)**, and see who notices.
   - **Overview group cards** (the Command center): one card per group, worst first, with late / very late work, overdue meds, call lights, alarms and flags. Click a group, patient or student to open the drawer. A card flashes for a few seconds when its status gets worse. The debrief adds a **Timeliness** table.
   - **Keyboard:** on Live control, Space pauses/resumes, N skips to the next event, ? lists shortcuts.
   - **Help:** every Sim setup and editor field has a ? with a plain-language explanation.
   - **Reactive script** (Patient editor → Linda → Reactive script): the state diagram (click a box or an arrow to edit it), When / If / Then reaction forms, **Add from template** (O₂ response, fluid bolus) and **Test this patient** (a dry run: wait, chart O₂ at 12 L, see what fires).
   - **Patient editor:** open a patient, click a timeline marker to see a scenario change, or **Add scenario change** (e.g. 09:45 call light, new vitals, a tier 1 order), then drag it on the timeline.
   - **Sim setup:** build a two-group sim with random tag counts.

Content marked "Needs review" was drafted by AI and is waiting on the instructor. Open clinical questions are listed in SPEC.md §14.
