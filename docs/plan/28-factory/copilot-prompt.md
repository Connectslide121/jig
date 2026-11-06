# Prompt for a coding agent (one session per phase-28 session)

Paste this into a new GitHub Copilot (or other coding agent) session on this repository. Change only
the session number on the first line.

```text
SESSION = 0   ← change to the session you want (0–8) from docs/plan/28-factory.md

You are working on Jig (this repository), building phase 28, "Jig factory": a built-in add-on
that turns an idea into an interview, a polished demo, and a full pack of documents and material.

Read these first, in this order, and follow them strictly:
1. AGENTS.md (binding rules: architecture, UI and design rules, testing, commits, docs).
2. docs/plan/28-factory.md (decisions J-1…J-16 and the sessions with their checklists).
3. The detail docs the session needs: docs/plan/28-factory/architecture.md, pipeline.md, ui.md,
   demo-quality.md, testing.md, and docs/plan/28-factory/mockup.html for how the screens look.
4. docs/reference/addon-api.md and docs/reference/slots.md, and one existing built-in add-on
   (addons/tasks or addons/workflows) as the pattern to copy.

Your job: do session SESSION of docs/plan/28-factory.md, and only that session.
- Start by checking which items of earlier sessions are done ([x]). If an earlier session is
  unfinished and blocks yours, finish the blocking items first and say so.
- Work through the session's checklist in order. Keep the scope: no work from later sessions.
- Follow the data model, file layout, tool names and settings in architecture.md exactly. If you
  must deviate, reserve a decision with `npm run decision -- "Title"`, write why in it, and update
  the plan docs in the same commit.
- UI: follow ui.md and the mockup, with Jig's own components (apps/desktop/src/renderer/ui,
  @jig/sdk/ui) and token utilities only. No hard-coded colours or arbitrary values, no layout
  shift, aligned columns with status at the right edge, whole rows/cards clickable, modals for
  forms, layouts for sidebar, bottom panel and tab widths, Jig Dark and Light.
- Say "Jig" (not "Claude") in user-visible text. No real company, product or people names in
  code, tests, fixtures or docs (use neutral placeholders).
- Add-ons import only from addons/ and packages by name (D-415).
- Tests: unit tests next to the code; extend the fake engine and docs/guides/testing.md for any
  new tool or behaviour; e2e specs in e2e/ with a rule in e2e/affected.json.
- Run `npm run verify` before every commit. At the end of the session run
  `xvfb-run -a npm run e2e:changed` (Linux) and fix what fails. Never use real AI credentials.
- Commit on main in small logical commits with clear messages (what and why). No AI attribution.
  Never push tags or force-push.
- Keep the docs true in the same commits: tick the items you finished ([x], or [~] when written but
  not tested), set the session's status line ("done" or what remains), update docs/plan/README.md's
  phase 28 row, docs/status.md for anything user-visible, docs/architecture.md and
  docs/reference/*.md for new contracts, slots, settings or IPC.

When you finish, reply with: what you built, what you tested (commands and results), what is left
in this session and why, decisions you made on your own, and what Jon should try in Jig after
pulling (exact clicks).
```
