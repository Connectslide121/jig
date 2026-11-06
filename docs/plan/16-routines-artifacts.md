# Phase 16 — Routines and artifacts

**Goal:** Claude Code's cloud features from inside Jig, without Jig touching your claude.ai login
(D-092): routines to see and manage, artifacts to open.

## Checklist

- [x] `Engine.callTool`: a guarded single-tool Claude Code call (hook + canUseTool), fake cloud for tests
- [x] Routines tab: list with schedules in words, on/off, Run now, runs and their messages; new and
      change through a chat; reloads when a chat changes a routine
- [x] Chat cards: Open Routines on RemoteTrigger calls; Open in Jig / Open on claude.ai on artifacts
- [x] ~~Artifacts tab: from your chats (no model call) and from claude.ai (on request); open in Preview~~ removed (D-404): Claude Code only gives the Artifact tool to the Claude desktop app; the Artifact card stays for old calls; replaced by the Pages add-on (D-405, `docs/reference/pages.md`)
- [x] Tests: unit (guard, parsers, schedules, artifact links), e2e (`e2e/routines-artifacts.spec.ts`)

## Later

- A schedule picker that drafts the routine request for Claude.
- Notifications when a routine run fails (would need a periodic check, i.e. a model call each time).
- [x] Pages (D-405): Jig's own artifacts, the `addons/pages` built-in add-on (tools, chat card, Pages view, `ctx.saveCopy`, e2e)
