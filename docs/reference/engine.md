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
interface EngineSession { send(text); interrupt(); setModel(m); setPermissionMode(m); close(); }
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
| `status`, `notice`, `error { code? }`, `exit` | status/compact messages, errors, process end |

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
