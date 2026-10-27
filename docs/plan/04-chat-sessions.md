# Phase 4 — Chat sessions

**Goal:** what the Claude desktop Code tab gives today — several Claude Code sessions in several
projects — inside Jig, on the user's subscription.

**Done when:** you can open several sessions across projects, chat with streaming output, see tool
calls, answer permission prompts, interrupt, queue follow-ups, switch model/permission mode, and reopen
a past session.

## Checklist

### Engine
- [ ] `Engine` interface + normalised `EngineEvent`s
- [ ] `FakeEngine` (scripted, used by tests and `JIG_ENGINE=fake`)
- [ ] `ClaudeEngine` on `@anthropic-ai/claude-agent-sdk` `query()` in streaming-input mode
- [ ] `settingSources: ['user','project','local']`, `claude_code` preset + appended Jig context
- [ ] Strip `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the session env unless allowed in settings
- [ ] Report auth source (subscription vs API key) from the init message; warn on API key
- [ ] "Not signed in" detection → guidance + button that opens a terminal running `claude`
- [ ] Optional `engine.claudePath` to use the user's own `claude` binary
- [ ] `jig` in-process MCP server attached to every session (`jig_list_addons`, `jig_request_build`)

### Sessions
- [ ] Session manager in the host: create, send, interrupt, close, list; status per session
- [ ] Persist metadata + transcript cache; resume with the SDK session id
- [ ] Permission requests → UI (Allow once / Always allow / Deny)
- [ ] Model and permission-mode menus per session
- [ ] Usage/cost per turn and per session as reported by Claude Code

### UI
- [ ] Session list across projects with live status (working / needs you / idle / error)
- [ ] Chat view: streaming markdown, thinking (collapsed), tool-call cards, results, errors
- [ ] Composer: multiline, send, queue while running, interrupt button, attach file paths
- [ ] Prompt buttons in the composer toolbar (the `prompt` slot comes in phase 6)
- [ ] Code blocks highlighted with the active theme
- [ ] `docs/reference/engine.md`
