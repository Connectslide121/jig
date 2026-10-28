# Phase 8 — Builder (levels 1 & 2)

**Goal:** "Build something…" from anywhere produces a layout/settings change or a new/changed add-on,
previewed and accepted by the user. Existing add-ons are always considered first.

**Done when:** from the Tools menu, an add-on's `⋯` menu, or a chat, asking for a tool results in a
validated preview that you can accept (committed) or discard.

## Checklist

- [x] Build job model (id, goal, origin, context, level, status, log, result) + Builds view
- [x] Entry: Tools → Build something… (form: what should it do? optional target add-on)
- [x] Entry: `⋯ → Change this with AI` on every add-on contribution (pre-selects that add-on)
- [x] Entry: `jig_request_build` tool in every chat session; progress card in that chat
- [x] Builder session: Claude Code with builder instructions + `jig-builder` MCP tools:
      `catalog` (existing add-ons: manifests, READMEs, contributions), `read_addon`, `validate`,
      `preview`, `stage_layout`, `stage_settings`, `propose_app_change`, `finish`
- [x] Builder instructions: levels in order; **prefer changing an existing add-on when it fits**;
      design tokens only; README must explain what and why
- [x] Work in a git worktree of `~/.jig/addons` (branch per job)
- [x] Validation: manifest schema, bundle, token check, smoke load; errors back to the session (max N rounds)
- [x] Preview mode in the UI (add-on from the worktree, marked Preview)
- [x] Accept → merge + commit; Discard → remove worktree; both recorded
- [x] Level 1: staged layout/settings changes shown as a diff with Accept/Discard
- [x] Builder docs (`docs/reference/builder.md`)

## Notes

- Level 3 (`propose_app_change`) records the request and waits; phase 10 implements it.
- Tested with the scripted fake builder that drives the real tools (unit: `main/builder/service.test.ts`,
  e2e: `e2e/builder.spec.ts`). A real build with Claude Code must be tried on Jon's machine.
