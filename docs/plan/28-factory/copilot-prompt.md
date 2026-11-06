# Prompt for a coding agent (picks up phase 28 where it stopped)

Paste this into a new GitHub Copilot (or other coding agent) session on this repository, as it is:
it finds the next session by itself. To force a session, add `SESSION = <n>` as its first line
(a number, or `M1`, `M2`, `M3` for Motion).

```text
You are working on Jig (this repository), building phase 28, "Jig factory": a built-in add-on
that turns an idea into an interview, a polished demo, and a full pack of documents and material.

0. Work on the git branch `factory` (`git fetch && git checkout factory && git pull`; create it
   from main only if it doesn't exist). Commit there and **push `factory` after every commit**
   (`git push`), so nothing is lost if the session ends; never force-push, no tags. The demo kit
   (D-431) is on branch `demo-kit`; clone it beside this repo as "Where we are" says, and push its
   commits back to that branch (`git push origin HEAD:demo-kit` from the kit's folder).

1. Find where the work stopped, before reading anything else:
   - docs/plan/28-factory.md → "Where we are" (the handoff note: current session, what is half
     done, where the demo kit repository is, how to build and check it).
   - The "## Sessions" list in the same file: the first session whose heading doesn't end in
     "— done" is yours. Inside it, `[x]` is done, `[~]` is written but not tested, `[ ]` is open.
   - `git log --oneline -15` on `factory`, and `git status` (uncommitted work from an interrupted
     agent: finish it or explain it, never throw it away silently).
   - If SESSION is set above, do that session instead; if an earlier session is unfinished and
     blocks it, finish the blocking items first and say so.

2. Read, in this order, and follow strictly:
   - AGENTS.md (binding rules: architecture, UI and design rules, testing, commits, docs).
   - docs/plan/28-factory.md (decisions D-426…D-441 and later ones, the sessions, their notes).
   - The detail docs your session needs: docs/plan/28-factory/architecture.md, pipeline.md, ui.md,
     demo-quality.md, testing.md, motion.md (sessions M1–M3), and docs/plan/28-factory/mockup.html
     for how screens look.
   - docs/reference/addon-api.md, docs/reference/slots.md, and addons/factory (the add-on so far;
     addons/tasks or addons/workflows for patterns it doesn't show yet).
   - The decisions about phase 28 in docs/decisions.md (search "Jig factory" / "phase 28").

3. Do that one session, in checklist order. No work from later sessions.
   - Follow the data model, file layout, tool names and settings in architecture.md exactly. To
     deviate, reserve a decision with `npm run decision -- "Title"`, write why, and update the plan
     docs in the same commit.
   - UI: ui.md and the mockup, with Jig's own components (apps/desktop/src/renderer/ui,
     @jig/sdk/ui) and token utilities only. No hard-coded colours or arbitrary values, no layout
     shift, aligned columns with status at the right edge, whole rows/cards clickable, modals for
     forms, layouts for sidebar, bottom panel and tab widths, Jig Dark and Light. Look at
     screenshots before calling UI done (e2e/factory.spec.ts has a JIG_UI_SHOTS test).
   - Say "Jig" (not "Claude") in user-visible text. No real company, product or people names in
     code, tests, fixtures or docs (Contoso, Fabrikam and such).
   - Add-ons import only from addons/ and packages by name (D-415).
   - Tests: unit tests next to the code; extend the fake engine and docs/guides/testing.md for any
     new tool or behaviour; e2e specs in e2e/ with a rule in e2e/affected.json. Never use real AI
     credentials.

4. Keep the handoff true as you go, not only at the end, so another agent can take over at any
   moment:
   - Tick items as they are finished ([x], or [~] when written but not tested) in the session's
     checklist, in the same commit as the work.
   - Update "Where we are" in docs/plan/28-factory.md whenever you stop or finish a piece: the
     session, what is done, what is half done and where, the next step.
   - Set the session's heading status ("— in progress", "— done") and docs/plan/README.md's phase
     28 row; docs/status.md for anything user-visible; docs/architecture.md and docs/reference/*.md
     for new contracts, slots, settings or IPC; a "Session N notes" paragraph under the session for
     choices the next sessions build on.

5. Before every commit: `npm run verify`. At the end of the session (or before handing over):
   `xvfb-run -a npm run e2e:changed` on Linux (add `-- --since origin/main` when it says no passing
   run is recorded) and fix what fails. Small logical commits with clear messages (what and why),
   no AI attribution, each pushed. Delete your scratch files in .tmp/.

When you finish, reply with: what you built, what you tested (commands and results), what is left
in this session and why, decisions you made on your own, and what Jon should try in Jig after
pulling (exact clicks).
```
