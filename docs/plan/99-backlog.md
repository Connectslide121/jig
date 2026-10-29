# Backlog

Ideas and deferred work. Each entry says why it is here.

- **Sandboxed iframe runtime** for add-ons written by other people.
- **Mobile / remote access** to a running Jig.
- **Dropped: builder level 3 (Jig editing its own source).** Built and then removed (D-074): it needed a
  rebuild per change and a personal clone that drifts from upstream; Jon changes Jig's code himself when
  the slots aren't enough. The builder proposes the missing extension point instead. The removed code is
  in git history (commit "Builder level 3: …").
- **Git live refresh on Linux by watching folders** (D-098): needs a folder walker that follows
  `.gitignore` (Node's recursive watch can't leave `node_modules` out); until then Linux polls.
- **Releases: Claude tools** ("what changed since the last release?", "write the notes for 2.5.0").
  Add-ons can't give Claude tools today; this needs a new extension point (add-on tools on the `jig`
  MCP server), which is a core change for Jon to approve. The rest of "Releases, the rest" (merged
  PRs, the release pipeline, notes as an artifact, the badge in Git) is done.
