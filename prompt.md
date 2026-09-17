# Start here

You are building **Flare**, a batteries-included fullstack framework on top of
Cloudflare's `vinext`. Three other files in this directory define the
project. Read them in this order, fully, before writing any code:

1. **`project-description.md`** — the vision, the problem, the tech stack,
   and the core technical decisions (especially the resource descriptor
   pattern and the codegen overwrite contract). This is the "why" and the
   "what" — internalize it before touching `phases.md`.
2. **`phases.md`** — the ordered build plan. This is your task list and your
   progress tracker, both at once.
3. **`style-guide.md`** — the visual system for anything you build in the
   generated admin dashboard. Consult it whenever you write UI code; do not
   improvise colors, spacing, or components outside it.

## How to work

- **Find your starting point.** Open `phases.md` and find the first phase
  with an unchecked (`- [ ]`) task. Work phases strictly in order — do not
  start Phase M2 work while Phase M1 has unchecked tasks, even if it seems
  faster to jump ahead.
- **One task at a time.** Implement a task, verify it actually works
  (run it, test it, don't just eyeball the code), then edit `phases.md` to
  check it off (`- [x]`). Do this task-by-task, not in a batch at the end —
  `phases.md` should always reflect true current state, since it's what
  future sessions (yours or a human's) will read to know where things stand.
- **Respect phase exit criteria.** Each phase in `phases.md` ends with an
  "Exit criteria" line. Don't consider a phase complete, or move to the
  next one, until that criteria is demonstrably true.
- **Don't touch the backlog.** `phases.md` ends with a "Backlog (not phased
  yet)" section. Do not implement anything from it without being explicitly
  asked — it's listed to record the idea, not to greenlight the work.
- **When something in `project-description.md` and reality conflict,**
  stop and ask rather than silently deviating from the documented
  architecture (especially the resource descriptor pattern and the
  generated-file marker convention — these are load-bearing decisions the
  whole generator depends on; getting them wrong early is expensive to fix
  later).
- **Keep the four files in sync with what you build.** If you discover
  during implementation that a decision in `project-description.md` needs to
  change (a field type doesn't work as specified, a CLI verb needs
  adjusting), update that file in the same session — don't let the docs and
  the code drift apart.
- **Commit conventions:** one commit per checked-off task where practical,
  commit message referencing the phase and task (e.g.
  `M1: implement gen resource field grammar parser`).

## First session checklist

- [ ] Read all three files fully
- [ ] Confirm the monorepo/package layout described implicitly in Phase M0 before scaffolding anything
- [ ] Start on Phase M0, task by task, checking off `phases.md` as you go
- [ ] Stop and summarize progress + next steps at the end of the session, even if a phase isn't finished
