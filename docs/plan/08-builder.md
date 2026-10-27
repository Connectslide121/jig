# Phase 8 — Builder (levels 1 & 2)

**Goal:** "Build something…" from anywhere produces a layout/settings change or a new/changed add-on,
previewed and accepted by the user. Existing add-ons are always considered first.

**Done when:** from the Tools menu, an add-on's `⋯` menu, or a chat, asking for a tool results in a
validated preview that you can accept (committed) or discard.

## Checklist

- [ ] Build job model (id, goal, origin, context, level, status, log, result) + Builds view
- [ ] Entry: Tools → Build something… (form: what should it do? optional target add-on)
- [ ] Entry: `⋯ → Change this with AI` on every add-on contribution (pre-selects that add-on)
- [ ] Entry: `jig_request_build` tool in every chat session; progress card in that chat
- [ ] Builder session: Claude Code with builder instructions + `jig-builder` MCP tools:
      `catalog` (existing add-ons: manifests, READMEs, contributions), `read_addon`, `validate`,
      `preview`, `stage_layout`, `stage_settings`, `propose_app_change`, `finish`
- [ ] Builder instructions: levels in order; **prefer changing an existing add-on when it fits**;
      design tokens only; README must explain what and why
- [ ] Work in a git worktree of `~/.jig/addons` (branch per job)
- [ ] Validation: manifest schema, bundle, token check, smoke load; errors back to the session (max N rounds)
- [ ] Preview mode in the UI (add-on from the worktree, marked Preview)
- [ ] Accept → merge + commit; Discard → remove worktree; both recorded
- [ ] Level 1: staged layout/settings changes shown as a diff with Accept/Discard
- [ ] Builder docs (`docs/reference/builder.md`)
