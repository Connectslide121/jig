# Phase 12 — Workspaces (a folder of repositories as one project)

**Goal:** work the way Jon does in VS Code: open the folder that holds all repositories as one
project, so chats can look across repositories and Git, scripts and repos cover all of them, whatever
repository you're in (D-075).

**Done when:** adding a folder of repositories shows every repository's changes in the Git view,
scripts of every repository on the dashboard, the repositories in the Repos view, and a chat can start
at the workspace root or inside one repository.

## Checklist

- [x] Find the git repositories inside a project folder that isn't one (two levels deep, cached;
      "Look for repositories inside again")
- [x] `ProjectInfo.repos`, `AddonProject.repos`, focus repository (`focusRepo`, `projects.setFocusRepo`)
- [x] Git view for workspaces: one section per repository (changed first and open), branch, ↑↓,
      commit box and changes per repository, Fetch all; history/commit/diff tabs per repository
- [x] Status bar and Tools-menu Git actions use the focus repository (click a repository to focus it)
- [x] Repos view lists workspace repositories; "New chat in this repository" (`ctx.openChat`,
      `sessions.create { cwd }`)
- [x] Scripts: each repository is also searched from its own root
- [x] Projects view and dashboard show "N repositories"
- [x] Tests: repo finder, project store, script discovery, repos list, e2e

## Notes

- A folder that is itself a repository stays a single-repository project (nested repositories inside
  it are not listed).
- Later: a setting for the search depth if two levels isn't enough; sessions in a git worktree.
