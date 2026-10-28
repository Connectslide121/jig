# Jig — the plan

The plan is split into phases. Each phase has its own file with a goal, a "done when" and a checklist.
**Tick items as they land, in the same commit as the code.** Add items when you discover work;
never silently drop one — move it to the backlog (`99-backlog.md`) with a reason.

Status legend: ✅ done · 🟡 in progress · ⬜ not started · ⏸ blocked (reason in the phase file).
In phase files, `[x]` = done, `[~]` = written but not yet tested/wired, `[ ]` = not started.

**Next session: start with `docs/status.md` → "Continue here".**

| # | Phase | Status | Done when |
|---|---|---|---|
| 0 | [Foundations](00-foundations.md) | ✅ | repo, docs, tooling and checks exist |
| 1 | [App skeleton](01-app-skeleton.md) | ✅ | an Electron window renders the React UI and talks to the host through the typed bridge; e2e harness runs |
| 2 | [Design system & themes](02-design-system-themes.md) | ✅ | tokens everywhere, built-in themes, VS Code themes importable, token check enforced |
| 3 | [Workbench shell](03-workbench-shell.md) | ✅ | layout-as-data regions, tabs, Tools menu, projects, settings |
| 4 | [Chat sessions](04-chat-sessions.md) | ✅ | several Claude Code sessions across projects, streaming, permissions, history |
| 5 | [Terminals & scripts](05-terminals-scripts.md) | ✅ | terminals per project; scripts startable with a click |
| 6 | [Add-on system](06-addon-system.md) | ✅ | slots, manifest, UI + host runtime, hot reload, management UI |
| 7 | [Built-in add-ons](07-builtin-addons.md) | ✅ | Git tab, Repos overview, Pipelines (Azure DevOps), Scripts |
| 8 | [Builder — levels 1 & 2](08-builder.md) | ✅ | "Build something…" changes layout/settings or creates/changes an add-on, with preview + accept |
| 9 | [Learning & suggestions](09-learning.md) | ✅ | activity log, pattern mining, "Look for patterns now", Monday 10:00 run, inbox |
| 10 | [Extension proposals (no self-editing)](10-extension-proposals.md) | ✅ | when no slot fits, the builder proposes the missing extension point; Jig never edits its own code |
| 11 | [Packaging & Windows](11-packaging.md) | ✅ | Windows installer, first-run checks, updates |
| 12 | [Workspaces](12-workspaces.md) | ✅ | a folder of repositories works as one project: Git, scripts, repos and chats across all of them |
| 13 | [What Jig can do](13-about-page.md) | ✅ | an in-app page (also the welcome screen and in the Jig menu): features with screenshots, live extension slots, add-ons, skills, configure examples, shortcuts |
| 14 | [AI features and previews](14-ai-features.md) | ✅ | suggestions, checkpoints, forks, parallel attempts, tours, checks, standups, previews for every file Claude writes, Claude's terminals and browser |
| — | [Backlog](99-backlog.md) | — | ideas and deferred work |

## How to work the plan

1. Pick the first unchecked item of the earliest unfinished phase (phases can overlap when an item
   does not depend on the previous phase).
2. Build it with tests; run `npm run check`.
3. Tick it here and in the phase file; update `docs/status.md` if something user-visible changed;
   record any decision you made on your own in `docs/decisions.md`.
4. Commit (one coherent change per commit).
