# Phase 4 — Chat sessions

**Goal:** what the Claude desktop Code tab gives today — several Claude Code sessions in several
projects — inside Jig, on the user's subscription.

**Done when:** you can open several sessions across projects, chat with streaming output, see tool
calls, answer permission prompts, interrupt, queue follow-ups, switch model/permission mode, and reopen
a past session.

## Checklist

### Engine
- [x] `Engine` interface + normalised `EngineEvent`s
- [x] `FakeEngine` (scripted, used by tests and `JIG_ENGINE=fake`)
- [x] `ClaudeEngine` on `@anthropic-ai/claude-agent-sdk` `query()` in streaming-input mode
- [x] `settingSources: ['user','project','local']`, `claude_code` preset + appended Jig context
- [x] Strip `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the session env unless allowed in settings
- [x] Report auth source (subscription vs API key) from the init message; warn on API key
- [x] "Not signed in" detection → guidance + button that opens a terminal running `claude` (button added with terminals, phase 5)
- [x] Optional `engine.claudePath` to use the user's own `claude` binary
- [x] `jig` in-process MCP server attached to every session (`jig_list_addons`, `jig_request_build`; real handlers arrive with the add-on host and the builder)

### Sessions
- [x] Session manager in the host: create, send, interrupt, close, list; status per session
- [x] Persist metadata + transcript cache; resume with the SDK session id
- [x] Permission requests → UI (Allow once / Always allow / Deny)
- [x] Model and permission-mode menus per session
- [x] Usage/cost per turn and per session as reported by Claude Code

### UI
- [x] Session list across projects with live status (working / needs you / idle / error)
- [x] Chat view: streaming markdown, thinking (collapsed), tool-call cards, results, errors
- [x] Composer: multiline, send, queue while running, interrupt button, attach file paths
- [x] Prompt buttons in the composer toolbar (registry ready; the `prompt` slot feeds it in phase 6)
- [x] Code blocks highlighted with the active theme
- [x] `docs/reference/engine.md`
- [x] Context window meter in the chat header (Claude Code's `/context` data after each turn, breakdown
      on hover) and Compact (Claude Code's `/compact`, with or without instructions; a button from 70%)

## Notes

- Tested end to end with the fake engine (unit + e2e). The real Claude Code path was smoke-tested once
  in the cloud container (init, streaming, result and cost came through correctly); it must still be
  tried on Jon's machine with his own login (see `docs/status.md`).
- Subagent (Task) activity is shown inside the Task tool's card.
