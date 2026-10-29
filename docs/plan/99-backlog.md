# Backlog

Ideas and deferred work. Each entry says why it is here.

- **Git worktree per chat** — an option to start any chat in its own worktree (as ThinkRail does).
  "Try several ways" already runs its attempts in worktrees (phase 14); a per-chat option waits until
  that has been used for a while.
- **Drag-and-drop layout editing.** Menus move views first; drag later.
- **Diff review with anchored comments sent to the chat** (ThinkRail's best feature).
- **Sharing add-ons with colleagues**.
- **Sandboxed iframe runtime** for add-ons written by other people.
- **Mobile / remote access** to a running Jig.
- **Dropped: builder level 3 (Jig editing its own source).** Built and then removed (D-074): it needed a
  rebuild per change and a personal clone that drifts from upstream; Jon changes Jig's code himself when
  the slots aren't enough. The builder proposes the missing extension point instead. The removed code is
  in git history (commit "Builder level 3: …").
- **Git live refresh on Linux by watching folders** (D-098): needs a folder walker that follows
  `.gitignore` (Node's recursive watch can't leave `node_modules` out); until then Linux polls.
- **Releases, the rest** (phase 18 item 8): merged PRs next to the commits, starting the release
  pipeline after a release (through Pipelines), publishing the notes as an artifact, an unreleased
  badge inside the Git panel, and Claude tools ("what changed since the last release?"). The core
  (policy, release, deploys, reminders) came first; these wait until releases have been used a while.
