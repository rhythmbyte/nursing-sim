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
   - **MAR → Give** nitroglycerin twice quickly. The second dose warns "too soon". Click **Give anyway** to show an override.
5. **Student 1 → Linda.**
   - Skip to her 08:00 deterioration first if you haven't.
   - **Instructor → Event timeline → Fire now** on her sepsis orders.
   - Back as the student: chart **Insert Foley** before the fluid bolus (a deliberate priority mistake).
6. **Charge tab.** Skip to 09:30. James waits on the **Admissions board**. **Assign now** to the group. He appears on Student 1's list.
7. **Debrief tab.** Walk through:
   - the red/amber flags (nitro override, Foley before bolus, missed notifications);
   - response times;
   - the order sequence (done vs. correct);
   - the timeline.
   - Then **Export CSV**.
8. Optional:
   - **Instructor → Review queue:** every AI-drafted item with Approve.
   - **Sim setup:** build a two-group sim with random tag counts.

Content marked "Needs review" was drafted by AI and is waiting on the instructor. Open clinical questions are listed in SPEC.md §14.
