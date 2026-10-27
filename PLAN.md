# School Timetable Builder — Product & Technical Plan (Draft v3)

An app for building clash-free school timetables, managing daily relief and printing timetable sheets. It is a single page that runs fully in the browser. It works **offline from a single HTML file** (it can be copied on a pendrive), and also runs from a website. There is no server and no login. Data is saved as an explicit **project file**.

> **Review history.** This version incorporates six principal and coordinator reviews:
> - Round 1 (generic schools): a large secondary school, a private K–12 school, and a deputy principal who coordinates timetables.
> - Round 2 (Sri Lanka): a 1AB national school, a small rural Type 2/1C school, and a Colombo international school that runs both Cambridge and Pearson Edexcel.
>
> §16 records what changed and the decisions that are still open.

---

## 1. Product shape: one core and three school packs

The reviews showed that school types differ a lot. Some schools need a feature that another school would find overkill. So the app has **one data model and solver**, and a **school pack** chosen at setup. The pack sets the defaults, the screens that are visible, the templates, and the reports.

| Pack | For | Distinctive needs |
|---|---|---|
| **Simple (small school)** | Type 2/1C, rural, ≤ ~20 classes | Wizard setup in under 1 hour, ~5 rules, teacher shortage handled gracefully, multi-grade classes, visiting teachers, phone-friendly relief |
| **Sri Lanka Government** | 1AB/1C/national/provincial | NIE grade templates, Sinhala/Tamil/English medium and bilingual splits, Second National Language, O/L baskets, A/L streams and common subjects, minimum-load norms, cadre and deployment returns, term tests and exam season |
| **International (Cambridge / Pearson Edexcel)** | Private and international schools | Student-level clash checks, subjects tagged with board/level/tier, small sets that span Year groups, contact time in minutes, visiting specialists, exam series overlays, student and parent timetables |

Users can switch packs or turn individual modules on later; the pack only sets the starting point. **Simple mode** is a UI layer, not a separate app. It hides advanced screens, and it can be turned off at any time without losing data.

---

## 2. Goals and non-goals

**Goals**
- Capture the school's structure once, using editable templates (NIE / board).
- Generate a timetable with **zero physical clashes**: no teacher, room or student group in two places at once. Clashes are checked by **real clock time**.
- **Always produce a usable result**, even when there aren't enough teachers. The result is a best partial timetable with clearly labelled gaps and an exact shortfall figure.
- Support how timetables really get finalised: negotiation, minimal-change edits, and temporary clashes while editing.
- Handle mid-year changes, exam seasons and **daily relief** (relief must work on a phone).
- Print and export the sheets and **administrative returns** each school type needs.

**Non-goals (v1)**: real-time multi-user collaboration, cloud accounts, attendance, exam marks, fees, and full timetable editing on a phone (relief and viewing on a phone are supported).

---

## 3. Data model

Every entity has a stable `id`, `name`, `shortCode` (with an optional Sinhala/Tamil short code for dense prints), and an `active` flag. Retired items are kept, not deleted.

### 3.1 Time
- **The base unit is minutes.** Periods are derived from bell schedules. Curriculum targets, teacher loads and contracts can each be expressed in **periods or minutes/hours**. The pack picks the default: periods for the Sri Lanka packs, hours for International.
- **Bell schedules**: an ordered list of `Period` and `Break` slots (assembly, form time, interval, lunch), each with a start time and duration.
  - Schedules are assigned per section, with day overrides (a shorter Friday, early leave for Grades 1–2).
  - **Extra sessions**: Saturday, after-school and early-morning sessions. Each is flagged *counts as teaching* (e.g. A Level Further Maths) or *activity / not counted* (e.g. Grade 5 Scholarship seminars, clubs).
- Every placement resolves to absolute clock intervals. **Clashes are checked by time overlap.**
- **Calendar overlays** are date-ranged events placed on top of the weekly timetable:
  - term tests, mocks, Cambridge and Edexcel exam series, the school acting as an O/L or A/L exam centre;
  - sports meets, and teachers away at marking camps.
  - An overlay can block rooms, remove classes or students, free teachers, add invigilation or supervision duties, or mark teachers absent for weeks.

### 3.2 Sections, grades and classes
- Section → Grade/Year → Class. **The labels are configurable**: "Grade 10", "Year 10", Key Stage names, and the mapping between Year and Grade.
- A class has a **medium** (Sinhala / Tamil / English / bilingual), class teacher, home room, student count and an `activeUntil` date (used when exam classes leave).
- **Multi-grade group**: one teacher and one room hold several grades (e.g. Grades 1+2) together. Each grade can have its own subject label in the same slot.
- **Merged class**: for small numbers, classes that are combined for every subject except a listed few (e.g. 12 Arts + 12 Commerce taking common subjects together).
- **House** (International pack, optional): used for form time, house lists and CCAs.

### 3.3 Student groups: the unit the clash check works on
This is the main fix from round 2.
- A **student group** is any set of students who must not be in two places at once.
- A class is the default group. **Sub-groups** are created for:
  - bilingual medium splits (an English-medium Science group and a Sinhala-medium one inside 9A);
  - Second National Language, Religion and Aesthetics groups;
  - O/L baskets, A/L combinations and international sets.
- There are three ways to define group membership. The pack picks one:
  1. **Counts only**: "9A has 28 Buddhism, 6 Christianity". The usual choice for government schools.
  2. **Combination list with counts**: e.g. A/L Arts "Sinhala + Geography + Political Science: 14 students". This is enough to build block lines.
  3. **Student list** (International): student ID, Year, form, house, and per subject the **board, level and tier**. Choices are dated, so a change such as "dropped AS Psychology on 15 Sep" is tracked. With a student list, the solver **checks clashes for every individual student**.
- The **student entity is in the data model from P0**, even though the student-list screens arrive with the International pack.

### 3.4 Subjects
- Name, code, colour and type (Theory / Practical / Activity / Self-study).
- **Board, syllabus code, level and tier** (International), e.g. Cambridge 9709, Edexcel IAL WMA, IGCSE Core or Extended. Sets cannot be merged across syllabi.
- **Priority** (Core / Normal / Low). This decides which subjects lose periods first when there is a shortage (§5.4).
- Required room type, and a "heavy" flag (prefer morning periods).

### 3.5 Rooms (only special rooms)
- Type, **seat capacity** (so a set of 25 is never put in a 10-seat room), and **concurrent capacity** (e.g. the playground can host 2 PE lessons, the hall 3).

### 3.6 Teachers
- **Identity and service** (Sri Lanka Government pack):
  - service grade (SLTS 3-I … 1) and appointment type (graduate / trained / diploma);
  - **appointment subject and appointment medium**;
  - date of appointment to the school (for transfer eligibility);
  - NIC (optional; stored only in the local project file).
- Subjects and grades the teacher can teach, and the **media they can teach in**.
- **Employment category**:
  - Permanent or contract teacher.
  - Attached or shared from another school.
  - Visiting specialist (paid hourly).
  - Development Officer.
  - Trainee (NCOE or university).
  - Sports coach.
  - Categories marked *not in cadre* are left out of the cadre counts.
- **Role and load norm** (min/max, in periods or hours; overridable per teacher):
  - The norm is defined per role and per pack.
  - In the Sri Lanka Government pack the main check is the **minimum**. It flags under-loaded teachers, who the zonal office may declare surplus.
  - The default minimum is ≈35 periods/week. **This figure must be verified against the current MoE circular before release** (§16).
- **Availability**:
  - Contracted days as one tick per day.
  - **Time windows** for visiting staff (e.g. "Tue/Thu after 12:30"), tagged with the other school's name.
  - **Quick day-swap** for when the other school changes the days.
  - Exceptions for specific periods.
- **Duty quotas** for admin, break and gate duty.
- Department (optional).
- **Vacancy / TBA** placeholder teacher.

### 3.7 Allocations (the main input screen)
- An **allocation matrix** of teachers × classes/groups. It shows live teacher totals against the norm (under / ok / over) and class totals against the available slots.
- Each allocation has a **status**:
  - *Appointed*: within the teacher's appointment.
  - **Covering (not appointed)**: shown as neutral, not as an error, and counted separately in returns.
  - **Uncovered / self-study / class-teacher supervised**: no teacher is available. The lesson is still placed in the timetable and reported as a deficit.
- **Grade and stream templates** ship as **editable data, versioned by curriculum year**, because the NIE allocations change under the reform (Grades 1 and 6 first). The app does **not** hard-code these numbers. Templates cover:
  - Sri Lanka: Grades 1–5 (class-teacher based, with specialist slots), Grades 6–9 (including Second National Language), the O/L core plus Groups I/II/III, and A/L streams (Bio, Maths, Commerce, Arts, Technology with ET/SFT/BST) plus the common subjects (General English, GIT, CGT).
  - International: per-board targets for guided learning hours.
- **Paste from Excel** with column mapping, an **Excel template** to download, and **copy from last year** (which flags teachers who have left).
- Lesson patterns: `n × single`, doubles, combined lessons, co-teaching and fixed placements.

### 3.8 Option blocks (lines)
- A block has a set of **lines**. Each line has periods (or minutes) per week, and holds parallel **sets**. Each set has a subject, teacher, room and student group.
- A block can span a grade, several streams, or **more than one Year group** (e.g. AS and A2 sets combined, Year 12 and 13 sets combined).
- A block is placed as one unit. Every student group, teacher and room in it is busy at the same time.
- **Block builder (suggests lines):**
  - **Inputs**: the combination list or the student list. Constraints: number of lines, periods per line, maximum set size, **minimum viable set size** (e.g. don't run a set below 4), number of sets per subject (worked out from enrolment), teacher availability (so a visiting specialist's line lands on their days), and cross-Year sets.
  - **Outputs**:
    - The proposed lines.
    - A **choice clash matrix**.
    - The **students who cannot be satisfied**, each with the nearest workable combination.
    - An **"available combinations" grid** for parents.
  - **What-if** for late changes to a student's choices.

### 3.9 Timetable versions
- A version is a set of placements plus an `effectiveFrom` date and a status (Draft / Approved / Superseded). An Approved version is read-only. A new version is created *from* an existing one, and a diff shows which teachers, classes and students are affected.

### 3.10 Relief
- **Absence**:
  - one day, a set of periods, or a **date range** (e.g. a marking camp);
  - **recurring absences** (e.g. "every 2nd Tuesday, ISA visit");
  - automatic absences that come from calendar overlays.
- **Relief options per lesson**:
  - assign a free teacher;
  - **combine with a neighbouring class**;
  - **class teacher supervises**;
  - **send the class to the library or ground with a supervisor**.
- **Ledger**: relief count per teacher, by week and by term.

---

## 4. Rules

### 4.1 Hard constraints (always on)
1. Teachers, rooms and **student groups/students** never overlap in clock time.
2. Room seat capacity and concurrent capacity are respected.
3. Availability is respected (contracted days, time windows, overlays).
4. Each requirement and block gets its periods or minutes. **In shortage mode this becomes "as many as possible, by priority"** (§5.4).
5. Double periods are consecutive and never split across a break (configurable).
6. Locked placements stay where they are.
7. Blocks stay intact (every set in the same slot).
8. The teacher's medium matches the group's medium.

### 4.2 Rule defaults by pack

| # | Rule | Simple | SL Government | International |
|---|---|---|---|---|
| R1 | Class teacher takes P1 | Soft-High, 5/5 | **Soft-High, 5/5, Grades 1–11** | Off for secondary (form time replaces it) |
| R3 | Assembly / form time slot | Fixed | Fixed 07:30–07:50 | Form time 10–15 min daily |
| R4 | A subject at most once per day per class (a double counts as one) | Hard | **Hard for Grades 6–11, Soft for A/L, Off for Grades 1–5** | Soft for AS/A Level |
| R5 | Spread a subject across the week | Soft-High | Soft-High | Soft-High |
| R6 | Heavy subjects in the morning | Off | Soft-Low | Soft-Low |
| R7 | Activity subjects not in P1, and not straight after the interval or lunch | Off | Soft-Med | Soft-Med |
| R8 | A subject not in the same period every day | Off | Soft-Med | Soft-Med |
| R11 | Maximum consecutive periods (breaks reset the count) | Off | **4** (P1–P4 before the interval is allowed), Soft-High | 3, Soft-High |
| R12 | Maximum periods per day | **7, Soft-High** | **7, Soft-High** | 7, Soft-High |
| R13 | Avoid isolated free periods between lessons | Off | Low (High for visiting staff) | Low (High for visiting/hourly staff) |
| R14 | Balanced daily load | Off | Soft-Med | Soft-Med |
| R15 | At least one free period per day | Off | Soft-Med | Soft-High |
| R23 | Same class not in the teacher's last period more than twice a week | Off | Soft-Med | Soft-Med |
| R24 | Free periods spread across the week | Off | Soft-Med | Soft-Low |
| R25 | Compact days for visiting/hourly staff | Soft-High | Soft-High | Soft-High |
| R26 | At least N teachers free in every slot (relief pool) | **Off** | Soft-High, N=3 | Soft-Med, N=2 |
| R27 | Department common free period | Off | Off | Soft-Med |
| R28 | Duty quotas | Off | Hard | Hard |
| R18 | Section finishes by a set time (e.g. Grades 1–2 leave early) | Via bell schedule | Via bell schedule | Via bell schedule |
| R20 | Same-grade classes take the subject at the same time | Off | Off (blocks handle this) | **On for setted Maths and English** |
| R21 | Room type required | Hard | Hard | Hard; science doubles in labs |

**The load norm** is a separate rule, not a scheduling rule. It is checked in the allocation matrix and in pre-flight. SL Government flags teachers below the minimum. International flags teachers over their contracted hours.

**Consistency check.** Pre-flight warns when the rules contradict each other. For example, a per-day maximum × number of days that comes out below the weekly minimum norm. (That exact bug was in v2.)

Not in v1: the custom rule builder, R9, R10, R17, R19 and R22.

### 4.3 Live checks and pre-flight (each with suggested fixes)
- Teacher load against the norm, with fixes such as moving N periods from one teacher to another who has spare capacity.
- Class periods against available slots.
- Medium or qualification mismatches.
- Room capacity.
- A block with no common free slot.
- Hard rules that contradict each other, and rules that contradict the norm.
- Missing data.
- **Supply versus demand**: "You need 312 teacher-periods and have 280, so you are short by 32. That shortage breaks down by subject and medium as follows…"

---

## 5. Scheduling engine

It runs in a Web Worker and shows live progress. Pressing Stop keeps the best result so far. The UI never uses solver jargon.

### 5.1 Algorithm
1. **Construction**, most constrained first: blocks → doubles → visiting staff → fixed lessons. It uses backtracking and conflict-directed repair.
2. **Optimisation** by local search (simulated annealing over move and swap moves). It never breaks a hard constraint.
3. Runs are deterministic for a given seed.
4. An independent **checker** verifies every result, including a per-student pass when students are in use.

### 5.2 Modes
- **Generate**.
- **Try another version** (a new seed). It shows a warning once the timetable has been shared.
- **Improve**.
- **Minimal-change**, against a reference version. It counts how many lessons, teachers and students change. This becomes the default once a timetable is shared or approved.
- **Generate for a selection** of classes or lessons.

### 5.3 What-if and explanations
- **What-if** answers single requests instantly, for example "Mrs. Perera free on Friday P7–8?" or "this student switches to Economics". The answer is Yes or No plus its cost.
- Every unplaced item comes with a reason and a fix.
- Soft-rule reports by rule and **by teacher**.

### 5.4 Shortage mode (when a full timetable is impossible)
- Pre-flight detects the shortage and asks the user to choose a **degradation policy**:
  1. Reduce periods for **low-priority subjects** first. This can be reordered; the default order is Aesthetics, then PE, then Health, then the rest.
  2. Fill the remaining gaps as **self-study / class-teacher supervised** periods.
  3. Allow **merged classes** for subjects that are marked combinable.
  4. Downgrade selected Hard rules (other than physical clashes) to Soft.
- The engine **always outputs a timetable**. Uncovered cells are clearly labelled (e.g. "Self-study – ICT (no teacher)").
- The shortage turns into a **surplus/deficit return** by subject × medium, ready to attach to a request for teachers.

---

## 6. Manual editor (in the first usable release)
- A class, teacher, room or student grid with drag-to-move. Each target slot is shown as green (no problems), amber (breaks a soft rule, with the reason), or red (a clash).
- **Temporary clashes are allowed** while editing. A clash counter is always visible, and a version with clashes can't be approved.
- A swap assistant (single swaps and 2-step chains) that **names every teacher affected**.
- Lock, an unplaced-lessons tray, undo/redo, and a live conflict panel.

---

## 7. Mid-year changes and the calendar
1. Create a new version from the approved one and set its effective date. Then pick a template:
   - **Teacher leaves / transfers**: the whole load moves to a replacement in one action, or is spread out with suggestions.
   - **New appointee**.
   - **Long leave**: date-ranged cover, after which the original teacher returns automatically.
   - **Exam classes leave**.
   - **Student choice changes** (International).
2. **Minimal-change repair** runs.
3. Review the diff.
4. Approve the version.
5. **Print only the sheets that changed**, plus a per-teacher change notice with a signature column.
- **Calendar overlays** (§3.1) adjust relief automatically. Examples:
  - teachers at marking camp are marked absent;
  - while a grade sits exams, its teachers become available for relief;
  - when the school is an exam centre, its rooms are blocked.
- **Term test / exam mode**:
  - An exam timetable grid (paper × date × session).
  - **Supervision and invigilation roster**, generated with fair rotation.
  - A list of **clashes between exams and teaching**.

---

## 8. Daily relief (v1; works fully on a phone)
1. On the **Today** screen, mark absences: a tap per teacher, then whole day or specific periods. Recurring absences and overlay-driven absences appear automatically.
2. The screen lists **uncovered lessons**.
3. Each lesson shows **ranked suggestions**:
   - Free teachers come first, ranked by fewest reliefs this week and term, then whether they already teach that class or subject, then same department.
   - Teachers already at their daily maximum are skipped.
   - **Alternatives** follow: combine with a neighbouring class, class-teacher supervision, or library/ground with a supervisor.
4. One-click assign, or **auto-assign all** and then edit.
5. **Print or share** in either of two forms:
   - a **relief register** sheet in the register layout (date, period, class, absent teacher, relief teacher, signature column);
   - relief slips, or a single **WhatsApp image or PDF**.
6. The ledger feeds the fairness reports.

---

## 9. Views, printing, sharing and reports

### 9.1 Output pipeline: designed for print shops and WhatsApp
- **Download PDF** directly, with no need to set up a print dialog. **A4 and black-and-white are the defaults**, and A3 is optional. Fonts are **embedded** (bundled Noto Sans Sinhala and Tamil), so the file prints the same on any shop's PC.
  - **P0 spike result** (`docs/spikes/pdf-sinhala-tamil.md`): pdf-lib/fontkit breaks Sinhala, so it is not used for text.
    - **Download PDF**: the browser renders each sheet to an image, and pdf-lib assembles the images into the PDF. Shaping is identical to the screen.
    - **Print**: uses the browser print engine, which keeps text selectable.
- **Image (PNG)** of any single timetable or relief sheet, for WhatsApp.
- **Batch outputs**:
  - one PDF with one teacher per page;
  - a set of **per-teacher PDFs** in a zip;
  - only the sheets changed in a version.

### 9.2 Sheets
| Sheet | Pack |
|---|---|
| Class timetable (+ class subject–teacher list) | All |
| Teacher timetable (weekly total, free-period count; Sinhala/Tamil/English) | All |
| **Student timetable**, on letterhead, batch per student | International |
| **Set lists** per teaching group | International |
| **Option block chart** (lines × sets with counts) | International / SL A/L |
| Room / lab timetable, **room utilisation** | All / International |
| Master staff-room chart (110 teachers on 2 × A3, repeating headers, grouped by section) | SL Government / International |
| Master class chart by day | All |
| Free-period chart | All |
| Relief register sheet + slips | All |
| Change notice with signature column | All |
| Section-wise class list (class teacher, medium) | SL Government |
| Exam supervision / invigilation roster | SL Government / International |
| Interval / gate duty roster | SL Government |
| CCA rosters, house lists | International |

### 9.3 Returns and administrative reports
- **Cadre return**: approved vs actual teachers by **subject × medium**, excluding categories marked "not in cadre". The **layout is configurable**, because formats differ by province and zone. It ships with a generic layout, and a school can map columns to its own zonal format.
- **Teacher deployment return**:
  - per teacher: service grade, appointment subject and medium, the subjects and grades they actually teach, periods per week, and norm status;
  - periods taught while covering outside their appointment, shown separately.
- **Surplus/deficit** by subject × medium (in periods and in teachers).
- **Teacher workload and relief-fairness summary**.
- **Contact hours vs. guided learning hours**, per subject per board. Used for Cambridge or Pearson centre inspections and for accreditation.
- **Contract-hours compliance** for expatriate staff, and **hours claimed** by visiting specialists (for payroll).
- Export to Excel or CSV is available for every report.

### 9.4 Sharing for review
- A read-only **review bundle**: either a PDF or a self-contained HTML file that opens on any device.

---

## 10. Usability
- **Setup wizard** for each pack, starting from an **example school** for that pack: a small rural school, a 1AB-style school, or an international school.
- **Simple mode** limits the steps to:
  - one bell schedule;
  - classes;
  - teachers and their subjects;
  - one allocation matrix;
  - about 5 rules;
  - generate, print, relief.
  Target: **set up in under 1 hour**.
- **UI languages in v1**: English for every screen, plus **Sinhala and Tamil for the Simple-mode screens, Today/Relief, and View & Print**. Full translation of every screen comes later.
- **Responsive design**: Today/Relief and all the viewing screens are built mobile-first. Setup and the editor are built for laptops but still work on tablets.
- Autosave after every change, so power cuts don't lose work. A crash-recovery snapshot is offered on the next start.

---

## 11. Data storage and safety
- **Project file**: Open / Save / Save As, using the File System Access API where the browser supports it, with a download fallback. Files get dated names, e.g. `Timetable_2027_T1_2026-11-03.ttb`.
- IndexedDB autosave keeps the last N snapshots. It is a safety net, not the primary store.
- Personal data (NIC, student lists) stays inside the local file. The app has no network calls.
- The file schema is versioned. Zod validates files and runs migrations when they are opened.

---

## 12. Technical architecture

| Concern | Choice |
|---|---|
| Language / UI | TypeScript, React 18, Vite, Tailwind, Radix/shadcn |
| Distribution | (a) hosted static site with PWA caching; (b) **single-file offline build** (`vite-plugin-singlefile`) for pendrive use |
| State | Zustand + Immer (patches for undo/redo and diffs) |
| Grids | Custom CSS-grid timetable; TanStack Table for lists and the matrix |
| Drag and drop | dnd-kit (touch support) |
| Persistence | File System Access API + Dexie autosave |
| Solver | Pure TS in a Web Worker (Comlink); independent checker |
| Validation | Zod |
| Excel | SheetJS |
| i18n | i18next (partial UI + print dictionaries); bundled Noto Sans Sinhala/Tamil |
| PDF / PNG | Print: browser print engine with paged CSS. Download PDF: html-to-image → pdf-lib (image pages). PNG: html-to-image. (Decided in the P0 spike.) |
| Tests | Vitest (domain, solver, checker, per-pack fixtures); Playwright (E2E, PDF snapshots incl. Sinhala/Tamil) |

```
src/
  domain/     entities (incl. Student, StudentGroup), time model, overlays, schemas, migrations
  packs/      simple/, sl-gov/, international/  (defaults, templates, rule presets, report layouts)
  solver/     model, construct, optimise, minimal-change, shortage, what-if, block-builder, feasibility, explain, checker
  workers/
  features/   setup, classes, subjects, teachers, rooms, students, allocations, blocks, rules,
              check, generate, editor, versions, calendar, exams, relief, views, print, reports, io
  ui/
  i18n/       en, si, ta
```

---

## 13. Delivery phases

**Release plan**: **v1.0 = Core + Simple + SL Government**, then **v1.1 = International pack**. The International data model is still built in P0, so v1.1 needs no migration (see §16, Q1).

| Phase | Scope | Outcome |
|---|---|---|
| **P0 – Foundations** (1.5 wks) | Full domain model (students, groups, minutes, overlays), project file, autosave, single-file build, **Sinhala/Tamil PDF spike** | Safe data and a proven print path |
| **P1 – Setup and allocations** (3 wks) | Setup wizard, packs, versioned templates, allocation matrix with statuses, Excel import, multi-grade/merged classes, visiting staff, **student groups via counts and combinations**, manual blocks, live checks | All SL input captured |
| **P2 – Solver** (3 wks) | Hard constraints (time overlap, groups, blocks), construction and repair, **shortage mode**, pre-flight with fixes and the consistency check, checker | Always a valid (possibly partial) timetable |
| **P3 – Edit and print → first usable release** (3 wks) | Basic editor, views, core sheets, **PDF/PNG output**, batch print, Sinhala/Tamil print, review bundle | A real school can finalise and print |
| **P4 – Relief and daily use** (2 wks) | Mobile Today/Relief, relief alternatives, recurring absences, register sheet, ledger, WhatsApp sharing, Sinhala/Tamil UI for those screens | Daily use all year |
| **P5 – Rules, versions, calendar** (3 wks) | Rule presets per pack, optimisation, minimal-change, what-if, mid-year wizard, diffs, change notices, overlays, term-test supervision roster | Quality, plus support for the whole year |
| **P6 – SL returns and polish** (1.5 wks) | Cadre and deployment returns (configurable layout), surplus/deficit, duty rosters, example schools → **v1.0** | v1.0 |
| **P7 – International pack** (4 wks) | Student list import, board/level/tier, **block builder**, per-student checks, cross-Year sets, contact-hour targets, exam series, invigilation, student timetables, set lists, GLH and payroll reports, houses/CCAs → **v1.1** | v1.1 |

**Progress**
- **P0: done.** Live at https://timetable.nuwan.dev/.
- **P1: done.**
  - Setup wizard; sections, grades and classes (quick add); subjects (standard SL list); special rooms; teachers (roles and norms, paste from Excel, service data); bell-schedule editor (day overrides).
  - Allocation matrix: live class and teacher totals, covering/uncovered status, copy to grade, checks with suggested fixes, supply vs demand.
  - Versioned curriculum templates: save from a class, apply to a grade, import/export.
  - Excel paste for allocations, in list or grid layout.
  - Option blocks with student groups: Religion, Aesthetics and Second National Language presets; teacher, room and student-count checks.
  - Merged classes (with subjects taught separately) and multi-grade groups (teacher load counted once).
  - Deferred to P7 (International): student-list import and the line-suggesting block builder.
- **P2: done.**
  - Solver: construction and conflict-directed repair. Covers clock-time clashes for classes, teachers and rooms; option-block lines; doubles that never cross a break; contracted days and availability; hard R4 and R12; seeded, so a run can be repeated.
  - Runs in an inline web worker with progress and Stop, so it also works in the offline file.
  - Shortage mode: low-priority lessons give way first, and empty periods become Self-study. A "Relax rules" option is available.
  - Pre-flight checks with fixes:
    - lessons with no possible time;
    - once-per-day vs lesson count;
    - daily maximum vs load and vs norm;
    - mixed bell schedules;
    - room capacity;
    - blocks with little common time;
    - missing class teachers.
  - The independent checker re-verifies every run.
  - Check and Generate screens, with a class/teacher grid viewer. Each run is stored as the active draft version.
  - A "Try a sample school" button on the start screen loads a Grades 6–11, 18-class sample. The same sample is used in tests.
  - Measured: 60 classes and about 2,050 lessons placed fully in about 0.5 s.
  - Soft-rule scoring (R1 class teacher in period 1, spreading, heavy subjects early) is not done yet; it goes with the optimiser pass.
- **P3: done.** This is the first usable release.
  - **Edit screen**:
    - drag-to-move or click-to-move on a class or teacher grid;
    - each target period is coloured green, amber (with the reason) or red (clash);
    - clashes are allowed while editing, with a clash counter and a live conflict list;
    - swap assistant: single swaps and 2-step chains, naming every teacher affected;
    - lock, an unplaced-lessons tray, and undo/redo;
    - Approve, which is blocked while there are clashes. Editing an approved timetable makes a new draft.
  - Generate keeps locked lessons in place.
  - **Sheets**, all in English, Sinhala or Tamil:
    - class sheet, with the subject–teacher list;
    - teacher sheet, with weekly and free-period totals;
    - room sheet;
    - master staff chart (A3 landscape, paginated, grouped by section);
    - master class chart (one per day);
    - free-period chart;
    - section-wise class list.
  - **Output**:
    - Download PDF: image PDF, A4/A3 per sheet, 2× JPEG;
    - Print through the browser, with named `@page` sizes;
    - PNG of any one sheet;
    - per-item PDFs in a zip;
    - a self-contained HTML review bundle (fonts embedded, no scripts).
  - The vector PDF path, @pdf-lib/fontkit and regenerator-runtime are removed, as the spike decided. The JS bundle went from 1.6 MB to 1.1 MB.
  - Measured: about 340 KB and 1 s per page. Grayscale JPEG is a possible size follow-up.
  - Not done: Playwright print snapshot tests, and a check of the browser Print dialog's pagination for the A3 master chart.

**v2 ideas**: Week A/B and multi-day cycles, custom rule builder, cloud sync with a read-only link for teachers, full UI translation, parent portal.

---

## 14. Testing and quality
- Fixtures for each pack:
  - a rural school with 15 classes and 22 teachers, built with a shortage;
  - a 1AB school with 50 classes and 120 teachers, bilingual;
  - an international school with 40 classes, 85 teachers and about 600 students across dual boards.
- An independent checker runs on every result, as a property test: no physical clashes, including per student.
- Performance targets:
  - 1AB-size school: a complete timetable in under 60 seconds.
  - Rural school: under 10 seconds on an old laptop.
- PDF snapshot tests, including the shaping of Sinhala and Tamil text.
- Tests for import and migration.

---

## 15. Risks
| Risk | Mitigation |
|---|---|
| Scope is large | Packs and phases. v1.0 targets the Sri Lankan packs only. The International data model is built early, but its UI comes later. |
| Sinhala/Tamil PDF rendering | P0 spike, and snapshot tests |
| Official norms change (MoE circulars, NIE reform) | Norms and templates are editable data with a version number, never hard-coded |
| Solver performance on per-student checks | Students are grouped into equivalence classes (identical choices), so the solver checks groups, not individuals |
| Data loss (browser cleared, laptop dies) | Explicit project file, dated names, autosave snapshots, backup reminders |

---

## 16. Review log and open decisions

**Round 2 changes (v2 → v3)**
- Added three **school packs** and a **Simple mode**.
- Introduced the **student group** as the clash unit, with three ways to define membership. The student entity is part of the model from P0.
- Moved to **minutes as the base unit**. Contract hours and visiting-staff time windows are now supported.
- Added **shortage mode**: uncovered and self-study lessons, subject priorities, and an output that is always produced (partial if necessary).
- **Load model fixed**. SL Government now uses minimum norms. R12 changed to 7 (Soft), resolving its contradiction with the minimum norm. Pre-flight now checks rules for consistency.
- Rule defaults retuned per pack: R4 scoped by grade, R11 = 4 for SL Government, R1 = 5/5 for SL Government and off for international secondary, R26 off in small schools.
- Added bilingual medium splits, Second National Language, Tamil-medium religion groups, A/L streams and common subjects, multi-grade groups, merged classes.
- Added teacher service data, employment categories (outside cadre where applicable), and a "covering, not appointed" status.
- Added calendar overlays (exam series, term tests, marking camps, exam centre), an exam mode, and supervision rosters.
- Option block builder: set-size limits, cross-Year sets, the list of unresolved students, and a combinations grid for parents.
- Relief: alternatives to a free teacher, recurring absences, register layout, mobile-first.
- Distribution: a single-file offline build is now in v1. Added direct PDF/PNG output for print shops and WhatsApp, and a Sinhala/Tamil UI for the key screens.
- New reports: cadre (by subject × medium, configurable layout), contact hours vs. guided learning hours, payroll hours, student timetables, set lists, room utilisation.

**Open decisions for you**
1. ~~Release order~~: **Decided (2026-10-27).** Sri Lankan packs (Simple + SL Government) ship in v1.0, and the International pack in v1.1. The app is **frontend-only, with no backend**.
2. **MoE workload norm**: which circular and figures should be the defaults? The reviewers suggested about 35 periods/week minimum, but this needs checking. The same applies to reduced loads for sectional heads and deputies.
3. **Zonal return formats**: can you get a sample cadre or deployment return from a target zone?
4. **Pilot schools**: which real school (size and pack) should v1.0 be validated against?
5. **Hosting**: a public static website as well as the offline file, or the offline file only?
