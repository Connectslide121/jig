# Phase 7 — Built-in add-ons

**Goal:** the user's daily tools, written as add-ons on the public slots (so they prove the slots and
are examples for the builder).

**Done when:** each add-on below works on the user's machine with their own `git` / `az` login.

## Checklist

### Repos overview (`addons/repos`)
- [ ] All registered projects' repos: branch, dirty count, ahead/behind, last fetch
- [ ] Per repo: fetch, pull, push, latest commits, changed files with a simple diff view
- [ ] Status bar item: repos needing a push/pull
- [ ] Context menu on a project: "Open in VS Code", "Open in Explorer"

### Pipelines (`addons/pipelines`)
- [ ] Uses the user's `az` CLI (`az devops`/`az pipelines`) — no tokens stored by Jig
- [ ] Pipelines grouped per Azure DevOps project; latest run status, branch, time
- [ ] Run a pipeline (pick branch), open run in browser, follow a run's status
- [ ] Watcher: notify when a run you started finishes / fails
- [ ] Settings page: organisation URL, projects to show

### Scripts (`addons/scripts`)
- [ ] Tools-menu actions and a view with every discovered script per project (from phase 5)
- [ ] Status bar item with running scripts

### VS Code tab (`addons/vscode`)
- [ ] Detect the user's `code` CLI; start `code serve-web` on a free local port with a private data dir
- [ ] Workbench tab type that shows it at the active project's folder
- [ ] Start/stop on demand; theme hint; document GitLens setup in that instance
- [ ] Verify `serve-web` flags on Windows
