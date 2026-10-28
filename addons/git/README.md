# Git

Jig's own Git tab (D-022): what matters is **history per branch, diffs, and clicking things to see the
detail in the main window**. Rebase, graph and blame are out of scope.

- **Git view** (left sidebar): the active project's current branch with ahead/behind, fetch/pull/push,
  working changes (staged, changes, untracked) with stage/unstage/discard and a commit box, and all
  local and remote branches (click → history; right-click → switch, compare, copy).
- **Tabs in the main window**: History of a branch (filter by message or author, paged), Commit detail
  (message, author, date, parents, changed files with +/−), Diff (side-by-side or inline,
  syntax-highlighted with the active theme, unchanged regions collapsed), Compare (commits ahead/behind).
- **Status bar**: current branch and ahead/behind. **Tools menu**: Show Git, History, Fetch, Pull,
  Push, Switch branch…, Create branch….
- Live refresh: watches `.git/HEAD`, refs and the index.

Uses your own `git` (no shell, argument arrays, `core.quotepath=off`, no credential prompts from Jig —
your credential helper works as usual). Parsers are in `lib/parse.ts` (tested).
