# Repos

A cross-project overview (which GitLens doesn't have), laid out like the Git plugin (D-143): every
git repository in the folders you added (a folder that is a repository, and the repositories inside a
folder), one row each:

- **Its name** (the folder's own name; a parent folder is added only when two would read the same,
  `lib/names.ts`; the full path and the last fetch are in its tooltip). Click it: it becomes the
  active project (for a workspace repository: the workspace, with that repository focused) and its
  Git view opens.
- **A status dot** (green up to date, amber changes, accent to pull or push, red when it can't be
  read) and **pills only when there is something to do**: `↓2 ↑1` and ✎ with the number of changed
  files. Press them to sync: pull when there is something to pull, then push (also a new branch
  without an upstream). Host `sync`. A clean repository shows no pill, so a long list stays calm.
- **Its branch**, with a branch icon (dimmed without an upstream).
- ⋯ / right-click: Open in Git, Sync, Fetch, Pull, Push, New chat in this repository, Open in
  Explorer, and other add-ons' repository menus.

**Arrange** (header): hide repositories, drag them into your order, add dividers (a titled one groups
what follows) — each row has a button that adds a divider right above it. One arrangement for all
your projects (the add-on's global storage, `arrangement`); new repositories come after it.

- View **Repos**: a collapsible section at the bottom of the Git panel (`"under": "addon.git.git"`,
  D-099), like GitLens below Source Control. Its ⋯ menu moves it to its own tab. Header: how many
  repositories, then ↑ / ↓ / ✎ counts (to push, to pull, with changes); Fetch all; Refresh. Status bar item
  "N to push/pull", Tools → Fetch all repos.
- Right-click a project or repo → Open in VS Code (your `code` command) / Open in Explorer.

Uses your own `git` and `code`.
