# Repos

A cross-project overview (which GitLens doesn't have): every
git repository in the folders you added (a folder that is a repository, and the repositories inside
a folder, shown as `folder/repo`), with its branch, number of uncommitted files, commits ahead/behind its upstream and when
it was last fetched. Fetch, pull and push per repo or fetch everything at once. Clicking a repo makes
it the active project (for a workspace repository: the workspace, with that repository focused) and
opens its Git view. "New chat in this repository" starts a chat inside it.

- View **Repos**: a collapsible section at the bottom of the Git panel (`"under": "addon.git.git"`,
  D-099), like GitLens below Source Control. Its ⋯ menu moves it to its own tab. Status bar item
  "N to push/pull", Tools → Fetch all repos.
- Right-click a project or repo → Open in VS Code (your `code` command) / Open in Explorer.

Uses your own `git` and `code`.

Row actions reserve their layout space while hidden and become visible on hover or keyboard focus, so repository text and row heights do not shift.
