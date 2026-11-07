# Questions for the instructor

Everything clinical in the Nursing Sim prototype is a starting guess until you approve it. This sheet collects the open questions, grouped by topic. Each one says what the sim does **right now** and leaves space for your answer. Nothing changes until you answer; "keep it" is a fine answer.

*How to use it: print it (it is plain text, one question per block), write on it or reply by email, and we'll update the sim. The same questions live in SPEC.md §14 with technical details (file names and settings) for the developers. Numbers in brackets are the SPEC §14 numbers.*

---

## 1. Patients and content

**1.1 Robert's repeat troponin** [4]
Right now: it has no scripted result; you type it in live when it comes due.
Should it come back rising or flat? Value?
Your answer: ______________________________________________

**1.2 Linda's lactates** [12]
Right now: the STAT lactate in her sepsis orders comes back 4.1. A second "repeat in 2–4 hours" lactate, if drawn, has no scripted value (you enter it).
Is 4.1 right? Should the repeat have a value?
Your answer: ______________________________________________

**1.3 Starter heart rhythms** [24]
Right now: Robert sinus, then sinus tach at 08:15; Margaret and Harold sinus; Linda sinus tach; Dorothy atrial fibrillation; James sinus tach, then sinus.
Right?
Your answer: ______________________________________________

**1.4 How Linda responds to oxygen** [35]
Right now: 1–4 L → SpO₂ about 86% (still below her target); 5–9 L → about 90% (inside her COPD target of 88–92%); 10 L or more, or a non-rebreather → about 96% (too much oxygen for her; shown as a teaching point).
Right bands and numbers? Should a Venturi mask be its own band?
Your answer: ______________________________________________

**1.5 How fast Linda gets worse without help** [36]
Right now: at 08:00 she starts dropping. No oxygen within 5 min → SpO₂ 82%, RR 32, HR 128. No oxygen or rapid response within 10 more min → crashing (SpO₂ 76%, RR 36, HR 138, BP 78/44).
Right timing and values? Should calling the provider also count as "doing something"?
Your answer: ______________________________________________

**1.6 Linda's new findings when hypoxic and crashing** [37]
Right now: hypoxic = speaking 2–3 words at a time, using accessory muscles, anxious. Crashing = lethargic and hard to wake, dusky lips and nail beds, mottled knees.
Accurate?
Your answer: ______________________________________________

**1.7 Late-treatment penalties for Linda** [39]
Right now: if her SpO₂ stays at 82% or lower for 5+ min, treatment later brings her back 20% less (fading over 30 min once treated). If it stays at 78% or lower for 3+ min, another 20% less, SpO₂ can't recover past 92%, and recovery is 1.5× slower. When she reaches 40% the charge nurse calls rapid response.
Right size and timing for teaching?
Your answer: ______________________________________________

**1.8 Reusable reaction templates** [38, 41]
Right now: "Oxygen response" (1–3 L → about 89%, 4 L or more or a non-rebreather → about 95%); "Fluid bolus response" (500 mL or more → BP 104/62, HR 104 over 10 min, cap refill 2–3 s); "Neglect penalty" (SpO₂ under 80 for 5+ min → 20% less recovery; SBP under 90 for 10+ min → 20% less and slower).
Reasonable? Which others would you reuse (pain medicine, nitro, insulin…)?
Your answer: ______________________________________________

**1.9 Starter assessment answers** [45]
Right now: Dorothy fall risk (Morse) 100, GCS 15 → 14, NIH stroke score 0 → 4, right pupil 4 mm and sluggish, confusion screen (CAM) positive when she declines. Margaret sedation (POSS) 1 → 2 after oxycodone, skin risk (Braden) 18. Linda CAM positive from 08:00. Robert pain 3 → 7. James Braden 17, Morse 45.
Accurate?
Your answer: ______________________________________________

**1.10 Reflection questions at the end of the shift** [29]
Right now: Which patient did you see first and why? What change did you recognize and what did you do? What did you delegate, and was it appropriate? What would you do differently?
Right questions?
Your answer: ______________________________________________

**1.11 Patients with their own "normal"** [40, 48]
Right now: the sim treats SpO₂ 94–100, HR 60–100, RR 12–20, systolic 100–140, diastolic 60–90, temp 97.0–99.5 °F, GCS 15, glucose 70–180 and pain 0–3 as normal. Linda's normal SpO₂ is 88–92% (COPD).
Right? Any other patient who needs their own normal?
Your answer: ______________________________________________

**1.12 Random names** [58]
Right now: each sim picks names from a list of 30 first names per sex and 40 last names (data/catalogs/names.json), never the same full name twice in a sim.
Add or remove names? Should some cases limit the names used?
Your answer: ______________________________________________

**1.13 Ranges for each case** [59]
Right now: each case varies age and baseline vitals within a range, e.g. Sepsis 1 ages 56–70, HR 100–108, BP 98–106 systolic, SpO₂ 90–92%. Any of the six cases can be a man or a woman.
Are the ranges realistic? Should any case keep a fixed sex?
Your answer: ______________________________________________

**1.14 Values that never change** [60]
Right now: Linda's lactate 2.8 and creatinine 1.4, Robert's first troponin, Dorothy's platelets and INR, and James's potassium, creatinine and magnesium always stay as written.
Any others the case depends on?
Your answer: ______________________________________________

**1.15 Medication swaps** [61]
Right now: Dorothy's anticoagulant is apixaban or rivaroxaban and her beta blocker metoprolol or carvedilol; home ACE inhibitors, ARBs and statins vary within their class. Margaret's oxycodone and James's metoprolol succinate never change.
Are the drug lists and doses right?
Your answer: ______________________________________________

**1.16 What varies by default** [62]
Right now: a new sim varies names, vitals and labs (within each case's ranges), and medications (within their class). You can turn each one off in the setup wizard to run the cases exactly as written.
Should any of them be off by default?
Your answer: ______________________________________________

**1.17 Your program's defaults** [64]
Right now: RN sims offer every case, CNA and LPN helpers, the usual assessment tools and a charge nurse. LPN / LVN sims offer cases tagged LPN, CNA helpers only, six assessment tools (pain, GCS, pupils, BE-FAST, CIWA, head-to-toe) and no charge nurse.
Right for your programs? What should differ for LPN students?
Your answer: ______________________________________________

**1.18 Ready-made setting bundles** [65]
Right now: Standard med-surg, Beginner (gentler timing, no penalties), Code-heavy, Delegation focus, Manikin lab, Screen-only.
Are these useful? Anything to add or change?
Your answer: ______________________________________________

## 2. Scoring and flags

**2.0 Debrief talking points** [63]
Right now: after the sim, each group gets discussion prompts grouped as prioritization, recognition, delegation, communication and timeliness, written from what happened (e.g. "Foley placed before the fluid bolus… ask what drove that order") plus each case's "should recognize" list. A summary card counts tasks on time, late, misprioritized and missed.
Items from a case's "should recognize" list that every student already wrote about in their reflection (matched by keywords) are left out, one click away. Are these the right themes and questions? Should items the reflections cover still be listed?
Your answer: ______________________________________________


**2.1 Extra PRN doses: warn or block?** [1]
Right now: the sim warns (for example a 4th nitro, or nitro without a BP first), lets the student give it anyway, and flags it red.
Should it block instead?
Your answer: ______________________________________________

**2.2 Flag defaults** [7]
Right now: a tier 1 order not done in 5 min is red; tier 2 not done in 15 min is amber; orders already in place at shift start aren't timed; a call light is amber after 5 min and red after 10; wrong order sequence is amber; missing a parameter, inappropriate delegation, an allergy conflict, a PRN limit and leaving a patient unattended are red.
Right windows and colors?
Your answer: ______________________________________________

**2.3 Allergy cross-reactions** [8]
Right now: the sim knows penicillin, sulfa and codeine allergy lists.
Should a penicillin allergy also flag cephalosporins (e.g. ceftriaxone)? Should a codeine allergy flag other opioids?
Your answer: ______________________________________________

**2.4 What counts as responding to a code** [9]
Right now: the first "respond to code" or "call rapid response" charted after a code starts.
Right?
Your answer: ______________________________________________

**2.5 How close the student's own vitals must be** [10]
Right now: temp within 0.3 °F, RR within 2 and pain within 1 of the script before the debrief says "differs".
Right?
Your answer: ______________________________________________

**2.6 Who is blamed for a patient left unattended** [11]
Right now: every student in the patient's group.
Should you pick one student instead?
Your answer: ______________________________________________

**2.7 Priority mismatch** [19]
Right now: amber after 10 min of a student's priority differing from yours; patients the student never prioritized aren't flagged.
Should this fire at all, and how strictly?
Your answer: ______________________________________________

**2.8 Monitor alarms not silenced** [30]
Right now: amber after 2 min, red after 5; alarms that clear by themselves within 2 min aren't flagged; silencing lasts 2 min, and students must be in the patient's chart to silence.
Right?
Your answer: ______________________________________________

**2.9 Command center colors** [33]
Right now: "Needs attention" = any very late item or red flag; "Falling behind" = any late item or amber flag.
Too sensitive?
Your answer: ______________________________________________

**2.10 Grading assessments** [44]
Right now: a charted tool is flagged when its interpretation differs from the patient's, or its score is off by 3+ (amber; red if a high-risk result was charted as lower risk). One-time required assessments must be done within 60 min. Delegated assessments aren't graded.
Too strict? Should delegated ones be graded?
Your answer: ______________________________________________

## 3. Timing

**3.1 How long tasks take** [50]
Right now: charting a task keeps the student busy for its time (sim time), e.g. head-to-toe 8 min, focused assessment 3 min, full vitals 2 min, BP 45 s, 12-lead ECG 5 min, IV start 5 min, Foley 10 min, blood cultures 5 min, giving a med 3 min, holding one 30 s, GCS 1 min, NIH stroke scale 7 min, CIWA 5 min, notifying the provider 2 min.
Realistic for students?
Your answer: ______________________________________________

**3.1a Busy rules** [51]
Right now: by default (manikin mode) the screen locks for a quarter of the task time (at least 5 s), because the real task already happened on the manikin. For sims without manikins you can choose "screen only": the student waits the whole time. While busy they can still answer call lights, silence alarms, call rapid response or a code, and notify charge.
Right? Anything else they should be able to do while busy?
Your answer: ______________________________________________

**3.1b Helpers students can delegate to** [52, 53]
Right now: each group of students has 2 CNAs and 1 LPN. Each helper does one task at a time: the task's time (a CNA takes 1.2× as long) plus 60 s to walk there. If nobody is free, the student does it themselves or queues it.
Realistic staffing and speed for your clinical sites? Should a student charge nurse be able to move helpers between groups?
Your answer: ______________________________________________

**3.1c Waiting for a helper, and delegating too much** [54]
Right now: a queued task waiting more than 10 min is late (20 min very late); delegating more than 4 tasks in 15 min is flagged amber.
Right?
Your answer: ______________________________________________

**3.2 BP before nitro** [5]
Right now: any BP in the last 15 sim-minutes counts (monitor reading, "Take BP now", charted vitals, or one reported by delegated staff).
Right window?
Your answer: ______________________________________________

**3.3 Default lab turnaround** [15]
Right now: 30 sim-minutes for any lab without its own delay.
Right?
Your answer: ______________________________________________

**3.4 "Late" and "very late"** [31]
Right now: tier 1 orders late after 5 min, very late after 15; tier 2 after 15 / 30; tier 3 after 60 / 120; scheduled meds 30 / 60 min past due; call lights 5 / 10; alarms 2 / 5.
Right numbers?
Your answer: ______________________________________________

**3.5 When morning meds are due** [32]
Right now: daily meds already active at 07:00 with no set time are due at 09:00.
Right, or should each med have its own time?
Your answer: ______________________________________________

**3.6 Reassessment timing** [43]
Right now: a required reassessment is late after 30 min and very late after 60. Orders active at shift start are first due 60 min in; a check up to 30 min early counts. Margaret's sedation and pain checks are due 30 min after each oxycodone dose.
Right?
Your answer: ______________________________________________

**3.7 The worsening arrow** [34]
Right now: a patient shows "worsening" if, over 15 min, SpO₂ drops 3+, systolic drops 15+ or HR rises 15+.
Right?
Your answer: ______________________________________________

**3.8 Admissions waiting on the board** [17]
Right now: no flag for how long the charge nurse takes.
Should waiting too long be flagged? Who plays charge nurse in class: a student or you?
Your answer: ______________________________________________

## 4. Assessments and licenses

**4.1 Tool content** [42]
Right now: 17 tools with standard items and cut-offs, for example fall risk (Morse) 45+ = high, skin risk (Braden) 12 or less = high, alcohol withdrawal (CIWA-Ar) 16+ = severe, sedation (POSS) 3 = hold the opioid, early warning (NEWS2) 7+ = high, CPOT 3+ = pain likely.
Are the items, points and cut-offs right for your course?
Your answer: ______________________________________________

**4.2 Who can do which tool** [46]
Right now: the 0–10 pain score can be delegated to an LPN or CNA; Morse, Braden and Wong-Baker to an LPN; all others are RN only.
Right for your scope of practice?
Your answer: ______________________________________________

**4.3 Delegated assessments** [13]
Right now: when an LPN does an assessment, its findings don't show on the chart; the RN must assess.
Right?
Your answer: ______________________________________________

**4.4 Licenses** (see the list at the end)
Right now: tools that aren't clearly free to use are marked "License check needed", use reworded items, and are off in the default sim.
Which of these does the school have a license for?
Your answer: ______________________________________________

## 5. Patient tags

**5.1 Tag groups and starter tags** [49]
Right now: License (LPN, RN); Unit (Med-surg, Surgical, Cardiology, ED, ICU, OB, Peds, Psych, Neuro, Rehab); Topic (respiratory, cardiac, sepsis, neuro, post-op, pain, falls, heart failure, admission, discharge); Age (peds, adult, geriatric). Robert: RN, Med-surg + Cardiology, cardiac + pain. Margaret: LPN + RN, Med-surg + Surgical + Rehab, post-op + pain + falls. Harold: LPN + RN, Med-surg, respiratory + discharge. Linda: RN, Med-surg, respiratory + sepsis. Dorothy: RN, Med-surg + Neuro, neuro + falls. James: RN, Med-surg + Cardiology, cardiac + heart failure + admission.
Which patients are right for LPN students? Any groups or tags to add?
Your answer: ______________________________________________

## 6. Settings

**6.1 Measuring temp, RR and pain** [2, 14]
Right now: BP, HR, SpO₂ and the oxygen device come from the monitor; temp, RR and pain are measured by hand, and the "Measure" button reveals the script's value. BP cycle choices: off, every 5, 10 or 15 min.
In class, should "Measure" be off so students take these from the manikin or you?
Your answer: ______________________________________________

**6.2 Triage tags around a code** [16, 20, 26]
Right now: during a code the patient's tag turns black; after ROSC it turns red with sinus tach on the monitor; with no ROSC the monitor shows asystole.
Right?
Your answer: ______________________________________________

**6.3 Which priority system students use** [18]
Right now: red / yellow / green / black, the same as your tags.
Keep it, or use ESI 1–5, an acuity scale, or ranking the patients?
Your answer: ______________________________________________

**6.4 Who sees your triage tags** [21]
Right now: only you.
Should a student charge nurse see them?
Your answer: ______________________________________________

**6.5 Live vitals vs. the script** [22]
Right now: after you change a patient's vitals live, the script's next change still happens (it takes back over).
Or should the script stop changing vitals once you've taken over?
Your answer: ______________________________________________

**6.6 Quick vitals buttons** [23]
Right now: "Deteriorate" drops SBP 25 and DBP 12, raises HR 25 and RR 6, and drops SpO₂ 5 over 10 min; "Improve" roughly reverses it.
Right values? Do you want buttons tailored to particular patients?
Your answer: ______________________________________________

**6.7 Monitor alarm limits** [25]
Right now: HR 50–120, SpO₂ under 90, RR 8–28, systolic 90–180, diastolic over 110.
Right for this unit?
Your answer: ______________________________________________

**6.8 Monitor hook-up** [27]
Right now: a telemetry order connects the ECG, continuous pulse ox connects SpO₂, and the BP cuff only reads when cycling or after "Take BP now".
Should anyone start fully connected? Who has a temperature probe?
Your answer: ______________________________________________

**6.9 Breathing rate during an arrest** [28]
Right now: shows "--".
Should it show 0, or agonal breaths for a while?
Your answer: ______________________________________________

**6.9a Sim length and breaks** [55]
Right now: the sim runs as long as the scenario says; Live control has a Break button that pauses it and shows "back at HH:MM" on every screen.
How long are your sims usually (1, 2, 4 hours)? Do you take breaks, and how long?
Your answer: ______________________________________________

**6.9b Lab computers (for school IT)** [56]
Right now: the prototype never logs anyone out and keeps student screens awake while the sim runs.
Do lab or shared computers enforce an idle logout or screen lock? After how long? Can it be relaxed during a sim?
Your answer: ______________________________________________

**6.9c Away status and shared computers** [57]
Right now: a student shows "Away / reconnecting" when their device has been silent for 45 seconds during the sim. "End of sim on this computer" clears their drafts and saved place.
Is 45 seconds right? On shared lab computers, should students always use "End of sim on this computer" at the end?
Your answer: ______________________________________________

**6.10 Message senders and oxygen devices** [47]
Right now: messages can come from the CNA, LPN, charge nurse, provider, family, patient, RT, pharmacy or lab. Oxygen devices: room air, nasal cannula, simple mask, Venturi, non-rebreather, high-flow, BiPAP/CPAP.
Anything to add or remove?
Your answer: ______________________________________________

---

## AI-drafted content to review

Everything below was drafted by AI and is marked "Needs review" in the app (Instructor → Review queue lists each item; approve it there or tell us what to change).

**Patients**
- **Robert Miller (Rm 201):** handoff report, vitals, assessment answers, labs, 10 orders, scenario changes, patient tags.
- **Margaret Wilson (Rm 202):** handoff report, vitals, reactive script (oxycodone → drowsier; a CNA message if POSS ≥ 3), assessment answers, 12 orders, scenario changes, patient tags.
- **Harold Thompson (Rm 203):** handoff report, vitals, 11 orders, patient tags.
- **Linda Garcia (Rm 204):** handoff report, vitals, new findings when hypoxic and crashing, assessment answers, labs, 15 orders, scenario changes, code branch, the whole reactive script (oxygen responses, deterioration, penalties), patient tags, her own SpO₂ normal range.
- **Dorothy Evans (Rm 205):** handoff report, vitals, findings, assessment answers, 8 labs, 11 orders, scenario changes, debrief notes, patient tags.
- **James Carter (Rm 206):** the whole patient (written for the sim), including vitals, assessment answers and patient tags.

**Settings and lists**
- Flag rules and their thresholds, timeliness, Command center colors (rules.json).
- Normal ranges, monitor limits, the worsening arrow, oxygen devices (vitals.json).
- Every scenario setting default (scenario-defaults.json), including task timer mode and the staff pool per group.
- Task times for every intervention, assessment tool and MAR action (interventions.json, assessment-tools.json, task-timing.json) and helper speed and walking time (staff.json).
- Interventions, labs, staff roles, priority scales, quick vitals buttons, heart rhythms, reflection questions.
- Reaction templates (oxygen response, fluid bolus, neglect penalty).
- All 17 assessment tools (items, points, cut-offs, reassessment times, who can do them).
- Patient tag groups.

## Assessment tools to check with the school

These are in the app but marked **License check needed**. Their wording is paraphrased, and they're off in the default sim until a license is confirmed.

| Tool | Status | Note |
|---|---|---|
| Braden Scale (pressure injury risk) | Permission needed | © Barbara Braden and Nancy Bergstrom |
| Wong-Baker FACES pain scale | Permission needed | © Wong-Baker FACES Foundation; faces not reproduced |
| Pasero Opioid-induced Sedation Scale (POSS) | Permission needed | © Chris Pasero |
| Confusion Assessment Method (CAM) | Permission needed | © Sharon K. Inouye |
| Morse Fall Scale | Terms unknown | Morse 1989 |
| FLACC (behavioral pain) | Terms unknown | Merkel et al. 1997, University of Michigan |
| Critical-Care Pain Observation Tool (CPOT) | Terms unknown | Gélinas et al. 2006 |
| Richmond Agitation-Sedation Scale (RASS) | Terms unknown | Sessler et al. 2002 |
| Clinical Opiate Withdrawal Scale (COWS) | Terms unknown | Wesson & Ling 2003 |
| NEWS2 (early warning score) | Terms unknown | © Royal College of Physicians 2017 |

Free to use (on by default): NIH Stroke Scale, BE-FAST, Glasgow Coma Scale, pupils, 0–10 pain score, CIWA-Ar, head-to-toe.

Licenses the school holds: ______________________________________________
