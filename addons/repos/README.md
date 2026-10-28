# Repos

A cross-project overview (which GitLens doesn't have): every registered project that is a git
repository, and every repository inside a workspace project (shown as `workspace/repo`), with its branch, number of uncommitted files, commits ahead/behind its upstream and when
it was last fetched. Fetch, pull and push per repo or fetch everything at once. Clicking a repo makes
it the active project (for a workspace repository: the workspace, with that repository focused) and
opens its Git view. "New chat in this repository" starts a chat inside it.

- View **Repos**: a collapsible section at the bottom of the Git panel (`"under": "addon.git.git"`,
  D-099), like GitLens below Source Control. Its ⋯ menu moves it to its own tab. Status bar item
  "N to push/pull", Tools → Fetch all repos.
- Right-click a project or repo → Open in VS Code (your `code` command) / Open in Explorer.

Uses your own `git` and `code`.
