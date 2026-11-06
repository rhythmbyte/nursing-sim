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
   - **Patient editor:** open a patient, click a timeline marker to see a scenario change, or **Add scenario change** (e.g. 09:45 call light, new vitals, a tier 1 order), then drag it on the timeline.
   - **Sim setup:** build a two-group sim with random tag counts.

Content marked "Needs review" was drafted by AI and is waiting on the instructor. Open clinical questions are listed in SPEC.md §14.
