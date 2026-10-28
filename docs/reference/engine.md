# Engine and sessions reference

Claude Code is the only engine (principle 1). Code: `apps/desktop/src/main/engine/` (engine),
`apps/desktop/src/main/sessions/` (session manager), `apps/desktop/src/shared/engine.ts` (types) and
`apps/desktop/src/shared/chat.ts` (transcript reducer).

## Engine interface (`main/engine/types.ts`)

```ts
interface Engine {
  kind: "claude" | "fake";
  start(options: StartOptions, onEvent: (e: EngineEvent) => void): EngineSession;
  oneShot(prompt: string, options: OneShotOptions): Promise<string>; // no tools, one turn (phase 9)
}
interface EngineSession { send(text); interrupt(); setModel(m); setPermissionMode(m); contextUsage(); close(); }
```

- **`ClaudeEngine`** (`claude.ts`): `query()` from `@anthropic-ai/claude-agent-sdk` in streaming-input
  mode (an `AsyncQueue` of user messages), so one Claude Code process serves a whole conversation.
  Options: `cwd` = the project folder, `settingSources: ["user","project","local"]` (CLAUDE.md, skills,
  plugins, hooks, MCP servers work as in the CLI), `systemPrompt: { type: "preset", preset:
  "claude_code", append: <Jig context> }`, `includePartialMessages: true` (streaming),
  `resume: <Claude Code session id>`, `pathToClaudeCodeExecutable` from `engine.claudePath`,
  `canUseTool` → the permission prompt, `mcpServers: { jig }`.
- **`FakeEngine`** (`fake.ts`): scripted replies for tests and `JIG_ENGINE=fake` (see the file header for
  the trigger words: "run", "question", "slow", "fail", "login", "build", and a path ending in an image
extension → a `Read` of that image). `JIG_FAKE_DELAY` sets the
  per-word delay (ms); `JIG_FAKE_ONESHOT` the one-shot answer.
- `normalize.ts` turns SDK messages into `EngineEvent`s and ignores anything it doesn't know.

## Credentials and billing

- Jig never reads, stores or forwards Claude credentials, and has no login screen.
- `sessionEnv()` removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the session environment
  unless Settings → Claude Code → Allow API keys is on (`engine.allowApiKey`).
- The init message's `apiKeySource` becomes `meta.authSource`: `none` → `subscription`, anything else
  → `api_key` (a warning is shown in the chat and a badge in its header).
- Not signed in (assistant error `authentication_failed`, or a result error mentioning `/login`) sets
  `meta.needsLogin`; the chat shows how to sign in (`claude` → `/login` in a terminal) with a button that
  opens a Jig terminal running `claude` (action `jig.claudeLogin`, phase 5).

## Events (`EngineEvent`)

| Event | From |
|---|---|
| `init { engineSessionId, model, permissionMode, authSource, slashCommands }` | `system/init` |
| `block_start/block_delta/block_end { id, block: text \| thinking, parentId? }` | stream events + complete assistant messages; ids are `<messageId>:<type>:<n>` so the complete block replaces the streamed one |
| `tool_use { id, name, input, parentId? }` / `tool_result { toolUseId, output, isError }` | assistant / user messages; `parentId` = a subagent's Task tool |
| `permission { request }` / `permission_resolved { requestId, status }` | `canUseTool` |
| `result { ok, durationMs, totalCostUsd, usage, error }` | `result` (cost is cumulative; the turn's cost is the difference) |
| `suggestion { text }` | `prompt_suggestion` (with `promptSuggestions: true`, setting `engine.promptSuggestions`): kept as `SessionMeta.suggestion` until the next send; the composer shows it as a chip and as placeholder (Tab takes it). The fake engine suggests from the second turn on |
| `compacted { trigger: manual \| auto, preTokens, postTokens? }` | `system/compact_boundary` (shown as "Conversation compacted (157k → 21k tokens)") |
| `status`, `notice`, `error { code? }`, `exit` | status messages ("Compacting…"), errors, process end |

## Sessions (`main/sessions/manager.ts`)

- A session = one Claude Code conversation in a project: `SessionMeta` (title, project, cwd, model,
  permission mode, status, auth source, usage, cost, Claude Code's session id) and a transcript cache of
  `ChatItem`s in `~/.jig/sessions/<id>.json` (last 3000 items; Claude Code keeps the full history).
- The Claude Code process starts on the first message and is **resumed** with Claude Code's session id
  after Jig restarts. "Stop Claude Code process" ends it; the next message resumes.
- **Status**: `idle`, `starting`, `working`, `needs_you` (a permission or question waits), `error`.
- **Queue**: a message sent while Claude works waits in Jig's queue (shown above the composer,
  removable) and is sent when the turn ends.
- **Permissions**: Allow once, Always allow (returns Claude Code's suggested permission rules as
  `updatedPermissions`), Deny. `AskUserQuestion` is answered with the chosen options
  (`updatedInput.answers`, question → answer).
- **Model** (`Default`, `opus`, `sonnet`, `haiku` or any id) and **permission mode** (`default`,
  `acceptEdits`, `plan`, `bypassPermissions`) change live (`setModel` / `setPermissionMode`).
- Activity (prompts, tool calls with their commands) is reported to `onSessionActivity` listeners for
  the learning log.

## The `jig` MCP server (`main/engine/jigTools.ts`)

Attached to every real session. Tools: `jig_list_addons` (the add-on catalog) and
`jig_request_build { goal, addonId? }` (starts the builder). Handlers are set with
`setJigToolHandlers()` by the add-on host (phase 6) and the builder (phase 8). The appended system
prompt tells Claude to use `jig_request_build` instead of editing Jig's files itself.

## IPC

See `docs/reference/ipc.md` → `sessions.*` and the `sessions.update` event (`ChatUpdate[]`:
`upsert` an item, `append` streamed text, `meta`, `queue`).

## Attachments (images and documents)

Files pasted (Ctrl+V — screenshots, or files copied in Explorer), dropped on the message box, or picked
with the paperclip are kept in `~/.jig/attachments/<session>/` (`sessions.addAttachment`) and shown as
thumbnails (images) or chips (documents). On send, the host checks they belong to that session and
turns each into what Claude Code takes, placed before your text (`main/sessions/attachments.ts`,
`packages/documents`):

| File | Sent as | Limit |
|---|---|---|
| PNG, JPEG, GIF, WebP | image block (base64) | 5 MB |
| PDF | document block (`application/pdf`, base64) — Claude reads text and pages as images | 30 MB |
| Word `.docx`, Excel `.xlsx`/`.xlsm`, PowerPoint `.pptx` | text extracted by Jig (headings, lists and tables; one CSV block per sheet; one section per slide with notes), in `<document name="…" note="text extracted by Jig">` | 30 MB file, 400k characters |
| text files (txt, md, csv, json, xml, html, code, logs, …) | text in `<document name="…">` | 30 MB file, 400k characters |

All attachments of one message together may not exceed 30 MB (Claude's request limit is 32 MB). Old
binary Office files (`.doc`, `.xls`, `.ppt`) and other types are refused with a message saying what to
do. Files picked with the paperclip that are code or text **inside the project** are still sent as
`@path` mentions (Claude Code reads the current version and can edit it). The user item keeps
`attachments: [{ path, mime, name, kind }]` (older transcripts: `images`); queued messages keep theirs.
The fake engine answers "I see N image(s)." and "I read <names>."

## Context window and compacting

After every turn the session manager calls `EngineSession.contextUsage()`: the Claude engine asks
Claude Code for its `/context` data (`getContextUsage({ detail: "summary" })`, nothing is sent to
Claude) and `contextFrom()` keeps the total, the window size, the percentage and the categories (used
ones largest first, then free space and the autocompact buffer; deferred tool schemas are dropped). It
is stored as `SessionMeta.context`, so the last value shows after a restart until the next turn.

Compacting is Claude Code's own `/compact`, sent as a message (`sessions.send` with `/compact` or
`/compact <what to keep>`), so it queues behind a running turn like any message. The chat header shows
the context meter (hover: breakdown; click: Compact / Compact with instructions…) and a **Compact**
button from 70%; the session ⋯ menu has the same entries. The fake engine counts 9k tokens a turn
(130k for "big file") and compacts to 21k.

## Plan usage

`Engine.planUsage()` returns the data behind Claude Code's `/usage` (5-hour and weekly windows) by
asking a prompt-less Claude Code process — no message is sent to Claude, and Jig never sees the login.
`rate_limit_event` messages become `{ type: "rate_limit", status, window?, resetsAt? }` engine events,
which the session manager hands to the usage service instead of the transcript. Details:
`docs/reference/usage.md`.

## Jig's tools in every chat

The `jig` MCP server (`engine/jigTools.ts`) has `jig_list_addons`, `jig_request_build`, and the
configuration tools other modules register with `registerJigTools` (settings, themes, layout, add-ons,
projects — `docs/reference/configure.md`). Tools marked `readOnly` run without a permission prompt.

