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

## Demo guide

Live: https://rhythmbyte.github.io/nursing-sim/

**Fastest start:** Instructor → Live control → **Start demo sim** (starter scenario, a joined test student, clock running).

**One window at a time.** If you open the sim in a second window of the same browser, that window is read-only and offers **Take over here** (the bedside monitor page is the exception: it only displays).

**Reset first.** Click **Reset demo** (top right) and confirm. That clears this browser's running sim, edits, approvals and created sims. Everything in the demo lives in your browser only, so it never affects anyone else.

**5-minute click-through (The Busy Med-Surg Shift)**

1. **Instructor → Live control.** Point out the join code, the unit strip (triage tags), and the event timeline with linked events.
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
   - **For the instructor:** print `docs/INSTRUCTOR-QUESTIONS.md`. It has every open question with the current default and space to answer, plus what needs review and which assessment tools need a license check.
   - **Patient tags:** Patient library → **Find patients** → click **LPN** (2 of 6 match). In Sim setup, set a group to "Random by tag counts" and tick patient tags for the randomizer. The matching counts per triage color update, and a warning shows if there aren't enough ("red 0/1 ⚠"). Patient editor → **Patient tags**: click chips, or **Add tag** / **Add group**.
   - **Add event (guided builder):** Patient editor → Linda → **Add scenario change** at 09:30 → Event: **Vitals change**. "From" fills with what she'll be by then (about 76% if untreated), "To" shows her normal range (88–92), and the line underneath reads it back ("SpO₂ improves from 76% to 90% over 5 minutes"). Add a **Code / cardiac arrest** with a planned outcome and ROSC rhythm. The same form is used for reaction effects, states, and **Live control → Add event** on any patient.
   - **Assessment tools:** in Dorothy's chart, open **Assessments** → **Glasgow Coma Scale** and use **Check patient** on each item (scripted answers fill in). The score and interpretation update as you go; **Save**. After her 08:45 decline, GCS drops to 14 and NIHSS rises to 4. Her neuro checks q2h show under **Due**, and late ones show on the Command center ("reassessments overdue"). To try Morse or Braden, tick them in **Sim setup → Assessment tools** (they're marked License check needed). The debrief's **Assessments** section compares what was charted with what the patient was.
   - **Recovery penalties:** leave Linda hypoxic past 08:10 and she earns a penalty (−20%). At 08:21 she earns a second one, which takes her to 40%, and the charge nurse calls rapid response. O₂ at 6 L then brings her only to about 84% instead of 90%, and it takes longer. The first penalty wears off over 30 min. Live control shows the penalty with **Add / −10% / Clear**. The dry run adds a "Without penalties" column, and the debrief lists each penalty and how it limited recovery.
6. **Charge tab.** Skip to 09:30. James waits on the **Admissions board**. **Assign now** to the group. He appears on Student 1's list.
7. **End the shift** (Live control → **End**, or let it reach 15:00). The student gets a short **reflection** form. Then the **Debrief tab.** Walk through:
   - the red/amber flags (nitro override, Foley before bolus, missed notifications);
   - the student's reflection answers beside each patient's "should recognize" list (possible mentions marked);
   - **Print summary** for a one-page-style handout per student;
   - priorities vs. your tags over time;
   - response times;
   - the order sequence (done vs. correct);
   - the timeline.
   - Then **Export CSV**.
8. Optional:
   - **Instructor → Review queue:** every AI-drafted item with Approve.
   - **Monitor-only event:** in the patient editor, add a scenario change with "Silent" and a new **Rhythm (monitor)**, and see who notices.
   - **Command center** (Instructor, the default while a sim runs): one card per group, worst first, with late / very late work, overdue meds, call lights, alarms and flags. Click a group or patient to jump to Live control. A card flashes for a few seconds when its status gets worse. The debrief adds a **Timeliness** table.
   - **Keyboard:** on Live control, Space pauses/resumes, N skips to the next event, ? lists shortcuts.
   - **Help:** every Sim setup and editor field has a ? with a plain-language explanation.
   - **Reactive script** (Patient editor → Linda → Reactive script): the state diagram (click a box or an arrow to edit it), When / If / Then reaction forms, **Add from template** (O₂ response, fluid bolus) and **Test this patient** (a dry run: wait, chart O₂ at 12 L, see what fires).
   - **Patient editor:** open a patient, click a timeline marker to see a scenario change, or **Add scenario change** (e.g. 09:45 call light, new vitals, a tier 1 order), then drag it on the timeline.
   - **Sim setup:** build a two-group sim with random tag counts.

Content marked "Needs review" was drafted by AI and is waiting on the instructor. Open clinical questions are listed in SPEC.md §14.
