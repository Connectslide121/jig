# Phase 7 — Built-in add-ons

**Goal:** the user's daily tools, written as add-ons on the public slots (so they prove the slots and
are examples for the builder).

**Done when:** each add-on below works on the user's machine with their own `git` / `az` login.

## Checklist

### Git tab (`addons/git`) — Jig's own git, no VS Code (D-022)
What matters: **commit history per branch, diffs, and clicking things to see the detail in the main
window.** Rebase, graph and blame are out of scope.

- [x] Host: safe git runner (no shell, argument arrays, `-c core.quotepath=off`, UTF-8, timeouts;
      see ThinkRail `packages/server/src/git/gitExec.ts`)
- [x] Host: parsers for `status --porcelain=v2 -z`, `log` (custom `--format` with NUL separators),
      `branch --format`, `diff --numstat` / `--patch`, `show`
- [x] Sidebar view **Git**: active project's branches (local + remote), current branch first, with
      ahead/behind
- [x] **History** of the selected branch: virtualised list (subject, author, relative date, short hash),
      paged, with a filter box (message/author)
- [x] Click a commit → **commit detail tab in the main window**: message, author, date, parents, the list
      of changed files with +/− counts
- [x] Click a file (in a commit or in working changes) → **diff tab in the main window**: side-by-side
      and inline, syntax-highlighted with the active theme, collapsed unchanged regions
- [x] **Working changes**: staged / unstaged / untracked files; click → diff; stage/unstage per file;
      commit with a message; discard per file (with confirmation)
- [x] Branch actions from menus: switch, create, fetch, pull, push (with upstream), compare branch with
      current (commits ahead/behind)
- [x] Copy hash, open commit on the remote (GitHub/Azure DevOps URL) from the commit's `⋯` menu
- [x] Live refresh (watch `.git/HEAD`, refs and index; debounced)
- [x] Live refresh for big workspaces: watch working folders (Windows/macOS), refresh only the
      repository that changed, rare safety-net polling (D-097)
- [x] One `git status` at a time per repository; fetch in the background (Settings → Git); long
      change lists show 500 files per group, then Show all (D-098)

### Repos overview (`addons/repos`)
- [x] All registered projects' repos: branch, dirty count, ahead/behind, last fetch
- [x] Per repo: fetch, pull, push; click a repo → its Git tab
- [x] Status bar item: repos needing a push/pull
- [x] Branch is a dropdown to switch branches (D-172)
- [x] Context menu on a project: "Open in VS Code", "Open in Explorer"

### Pipelines (`addons/pipelines`)
- [x] Uses the user's `az` CLI (`az devops`/`az pipelines`); Jig stores no tokens
- [x] Pipelines grouped per Azure DevOps project; latest run status, branch, time
- [x] Run a pipeline (pick branch), open run in browser, follow a run's status
- [x] Watcher: notify when a run you started finishes or fails
- [x] Settings page: organisation URL, projects to show

### Scripts (`addons/scripts`)
- [x] Tools-menu actions and a view with every discovered script per project (from phase 5)
- [x] Status bar item with running scripts

## Notes

- All four are ordinary add-ons in `addons/` using only public slots and `ctx`/`api` (each folder is
  self-contained, so it can be copied into `~/.jig/addons` and changed). Parsers are unit-tested
  (`addons/git/lib/parse.test.ts`, `addons/pipelines/lib/runs.test.ts`, `addons/repos/host.test.ts`);
  e2e: `e2e/builtin-addons.spec.ts`.
- History is a main-area tab (one per branch) rather than a sidebar list, so it has room for author,
  date and hash columns; the sidebar keeps changes and branches.
- Pipelines can't be tested against Azure DevOps here (no `az` login): see `docs/status.md`.
- The Scripts status-bar item and dashboard card are part of Jig (phase 5); the add-on adds the view and
  the Tools-menu actions.
