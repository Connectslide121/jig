# Phase 7 — Built-in add-ons

**Goal:** the user's daily tools, written as add-ons on the public slots (so they prove the slots and
are examples for the builder).

**Done when:** each add-on below works on the user's machine with their own `git` / `az` login.

## Checklist

### Git tab (`addons/git`) — Jig's own git, no VS Code (D-022)
What matters: **commit history per branch, diffs, and clicking things to see the detail in the main
window.** Rebase, graph and blame are out of scope.

- [ ] Host: safe git runner (no shell, argument arrays, `-c core.quotepath=off`, UTF-8, timeouts;
      see ThinkRail `packages/server/src/git/gitExec.ts`)
- [ ] Host: parsers for `status --porcelain=v2 -z`, `log` (custom `--format` with NUL separators),
      `branch --format`, `diff --numstat` / `--patch`, `show`
- [ ] Sidebar view **Git**: active project's branches (local + remote), current branch first, with
      ahead/behind
- [ ] **History** of the selected branch: virtualised list (subject, author, relative date, short hash),
      paged, with a filter box (message/author)
- [ ] Click a commit → **commit detail tab in the main window**: message, author, date, parents, the list
      of changed files with +/− counts
- [ ] Click a file (in a commit or in working changes) → **diff tab in the main window**: side-by-side
      and inline, syntax-highlighted with the active theme, collapsed unchanged regions
- [ ] **Working changes**: staged / unstaged / untracked files; click → diff; stage/unstage per file;
      commit with a message; discard per file (with confirmation)
- [ ] Branch actions from menus: switch, create, fetch, pull, push (with upstream), compare branch with
      current (commits ahead/behind)
- [ ] Copy hash, open commit on the remote (GitHub/Azure DevOps URL) from the commit's `⋯` menu
- [ ] Live refresh (watch `.git/HEAD`, refs and index; debounced)

### Repos overview (`addons/repos`)
- [ ] All registered projects' repos: branch, dirty count, ahead/behind, last fetch
- [ ] Per repo: fetch, pull, push; click a repo → its Git tab
- [ ] Status bar item: repos needing a push/pull
- [ ] Context menu on a project: "Open in VS Code", "Open in Explorer"

### Pipelines (`addons/pipelines`)
- [ ] Uses the user's `az` CLI (`az devops`/`az pipelines`); Jig stores no tokens
- [ ] Pipelines grouped per Azure DevOps project; latest run status, branch, time
- [ ] Run a pipeline (pick branch), open run in browser, follow a run's status
- [ ] Watcher: notify when a run you started finishes or fails
- [ ] Settings page: organisation URL, projects to show

### Scripts (`addons/scripts`)
- [ ] Tools-menu actions and a view with every discovered script per project (from phase 5)
- [ ] Status bar item with running scripts
