# Git

Jig's own Git tab (D-022): what matters is **history per branch, diffs, and clicking things to see the
detail in the main window**. Rebase, graph and blame are out of scope.

- **Git view** (left sidebar): the active project's current branch with ahead/behind, fetch/pull/push,
  working changes (staged, changes, untracked) with stage/unstage/discard and a commit box, and all
  local and remote branches (click → history; right-click → switch, compare, copy).
- **A workspace** (a folder of repositories) lists the repository you work in, not all of them
  (`lib/shown.ts`, D-100):
  - **The picker** at the top (`podium ▾`) chooses that repository. It is the focus repository, which
    also drives the status bar and Git actions. **All repositories** lists every one, changed first.
  - **The eye button** shows other repositories next to it, e.g. elearning while you integrate it into
    podium. The hide button on a repository's row (on hover) takes it away again.
  - The choice is kept per project and per focus repository (add-on storage `shown:<projectId>`).
  - Only the listed repositories are watched and checked.
  - The Repos add-on below the list shows every repository at a glance.
- **Write** (commit box) asks Claude for the message from the staged diff and recent subjects. When the
  repository's release policy (`.jig/release.json`, Releases add-on) sets `commitConvention:
  "conventional"`, it asks for Conventional Commits (`feat(scope): …`, `!` for breaking).
- **Tabs in the main window**: History of a branch (filter by message or author, paged), Commit detail
  (message, author, date, parents, changed files with +/−), Diff (side-by-side or inline,
  syntax-highlighted with the active theme, unchanged regions collapsed), Compare (commits ahead/behind).
- **Status bar**: current branch and ahead/behind. **Tools menu**: Show Git, History, Fetch, Pull,
  Push, Switch branch…, Create branch….
- Live refresh (`lib/watch.ts`, D-097):
  - The git folder (HEAD, the index, refs) is watched for every repository on view. On Windows and
    macOS the working folder is watched too: one system handle per repository, not one per folder.
    `node_modules` is left out.
  - A change refreshes only the repository that changed, at most once a second, 300 ms after a burst
    ends. Watches are shared between views and closed when the last view goes.
  - `git status` runs with `GIT_OPTIONAL_LOCKS=0`, so it never writes the index or triggers itself.
  - Also on window focus (a workspace at most every 10 s), and as a safety net while Jig is visible:
    every 60 s where the working folders are watched. Elsewhere (Linux) it runs every 5 s for one
    repository, and 1 s per repository for a workspace, up to 30 s.
  - One `git status` at a time per repository: a call while one runs waits for one more run after it,
    shared by every caller meanwhile (`singleFlight`).
- **Fetch in the background** (watcher `autoFetch`, every minute; Settings → Git; on, every 5 min):
  - It fetches every repository of your projects whose last fetch is older than the interval,
    oldest first and one at a time.
  - It never shows a login: `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, no askpass. A
    repository that would need one is skipped until the next round.
  - The refs change, so the views refresh by themselves.
- Long change lists show the first 500 files per group, then **Show all**; Stage all / Discard all
  still cover every file.

Uses your own `git` (no shell, argument arrays, `core.quotepath=off`, no credential prompts from Jig —
your credential helper works as usual). Parsers are in `lib/parse.ts` (tested).

Changed images (png, jpg, gif, webp, avif, bmp, ico, svg) show **before and after** side by side
instead of a text diff — the working copy against the index, staged against `HEAD`, or a commit
against its parent — with their pixel and file sizes; the image button opens the file in Jig's image
tab. The two sides of a text diff can be resized by dragging the line between them.

**Workspaces** (a project that is a folder of repositories, D-075): the view lists every repository
in one panel — changed ones first and open, each with its branch (click to switch), ↑↓, change count,
its own commit box and change groups; right-click or `⋯` for History, Fetch, Pull, Push, **New chat in
this repository**, Focus, Copy path. Clicking a repository makes it the **focus repository**: the status
bar shows `repo: branch`, and the Tools-menu Git actions (Fetch, Pull, Push, Switch/Create branch,
History) use it. **Fetch all** and **Look for repositories again** are in the header.

