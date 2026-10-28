# Backlog

Ideas and deferred work. Each entry says why it is here.

- **Git worktree per chat** — an option to start any chat in its own worktree (as ThinkRail does).
  "Try several ways" already runs its attempts in worktrees (phase 14); a per-chat option waits until
  that has been used for a while.
- **Split main area** (side-by-side tabs). Deferred: tabs first.
- **Drag-and-drop layout editing.** Menus move views first; drag later.
- **File tree and editor** (Monaco with `@shikijs/monaco`). Viewing is done (the Preview tab, phase
  14); Jig opens files in the user's editor for editing.
- **Diff review with anchored comments sent to the chat** (ThinkRail's best feature).
- **Sharing add-ons with colleagues**.
- **Sandboxed iframe runtime** for add-ons written by other people.
- **Mobile / remote access** to a running Jig.
- **Dropped: builder level 3 (Jig editing its own source).** Built and then removed (D-074): it needed a
  rebuild per change and a personal clone that drifts from upstream; Jon changes Jig's code himself when
  the slots aren't enough. The builder proposes the missing extension point instead. The removed code is
  in git history (commit "Builder level 3: …").

