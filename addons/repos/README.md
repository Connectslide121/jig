# Repos

A cross-project overview (which GitLens doesn't have), laid out like the Git plugin (D-143): every
git repository in the folders you added (a folder that is a repository, and the repositories inside a
folder), one row each:

- **Its name** (the folder's own name; a parent folder is added only when two would read the same,
  `lib/names.ts`; the full path and the last fetch are in its tooltip). Click it to show its
  **commits** under the row, like the Git plugin (D-149): its branch → upstream and what's to push
  or pull, then the commits to pull (↓, blue), the branch's latest marked to push (↑, amber) or
  pushed (●), with their branches and tags, author and age; **Show more** adds 25. Click a commit for
  its files (status, +added −removed), a file for its diff (long ones cut at a whole hunk). One
  repository open at a time; it reads again when the branch moves. Host `commits`, `commitFiles`,
  `commitDiff`; parsers in `lib/commits.ts`.
- **A status dot** (green up to date, amber changes, accent to pull or push, red when it can't be
  read) and **pills only when there is something to do**: `↓2 ↑1` and ✎ with the number of changed
  files. Press them to sync: pull when there is something to pull, then push (also a new branch
  without an upstream). Host `sync`. A clean repository shows no pill, so a long list stays calm.
- **Its branch**, with a branch icon (dimmed without an upstream), as a dropdown like the Git view's: pick a local branch (✓ marks the current one) or a remote one (it gets a tracking branch) to switch. Host `branches`, `switchBranch`.
- **In fixed columns** (D-152): name, changes (✎), sync (↓ ↑), branch, so pills and branches line
  up down the list; ⋯ shows over the row's end on hover. ✎ opens the repository in Git.
- ⋯ / right-click: Show commits, Open in Git (the repository becomes the active project and its
  Git view opens), Sync, Fetch, Pull, Push, New chat in this repository, Open in
  Explorer, and other add-ons' repository menus.

**Arrange** (header): hide repositories, drag them into your order, add dividers (a titled one groups
what follows) — each row has a button that adds a divider right above it. One arrangement for all
your projects (the add-on's global storage, `arrangement`); new repositories come after it.

- View **Repos**: starts in the lower half of the left sidebar (`"region": "left2"`, a split sidebar,
  D-173), under the left sidebar's tabs. Its ⋯ menu moves it anywhere. Header: how many
  repositories, then ↑ / ↓ / ✎ counts (to push, to pull, with changes); Fetch all; Refresh. Status bar item
  "N to push/pull", Search → Fetch all repos.
- Right-click a project or repo → Open in VS Code (your `code` command) / Open in Explorer.

Uses your own `git` and `code`.
