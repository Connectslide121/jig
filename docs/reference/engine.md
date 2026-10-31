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
interface EngineSession {
  send(text, attachments?, priority?: "next"); interrupt(); setModel(m); setPermissionMode(m); contextUsage();
  rewindFiles(messageId, dryRun); commands(); models(); setEffort(level | null);
  mcpStatus(); mcpReconnect(name); mcpToggle(name, on); background(toolUseId?); stopTask(id); close();
}
```

- **`ClaudeEngine`** (`claude.ts`): `query()` from `@anthropic-ai/claude-agent-sdk` in streaming-input
  mode (an `AsyncQueue` of user messages), so one Claude Code process serves a whole conversation.
  Options: `cwd` = the project folder, `settingSources: ["user","project","local"]` (CLAUDE.md, skills,
  plugins, hooks, MCP servers work as in the CLI), `systemPrompt: { type: "preset", preset:
  "claude_code", append: <Jig context> }`, `includePartialMessages: true` (streaming),
  `resume: <Claude Code session id>`, `pathToClaudeCodeExecutable` from `engine.claudePath`,
  `canUseTool` → the permission prompt, `mcpServers: { jig }`, `effort`, `additionalDirectories`, and
  `resumeSessionAt` after a rewind. Messages carry `origin: { kind: "human" }`; one sent while Claude
  works with `priority: "next"` joins the running turn.
- **`FakeEngine`** (`fake.ts`): scripted replies for tests and `JIG_ENGINE=fake`, with no Claude Code
  process and no quota. The trigger words and environment variables are in `docs/guides/testing.md`
  → The fake engine.
- `normalize.ts` turns SDK messages into `EngineEvent`s and ignores anything it doesn't know.

- **`callTool(request, options)`** (`toolCall.ts`): has Claude Code call one of its own tools with
  an exact input, for Jig's routines and artifacts tabs.
  - It runs a hidden session: Haiku, no settings, only that tool, at most 3 turns, not persisted.
  - A `PreToolUse` hook and `canUseTool` both allow only that exact call (`isRequestedCall`).
  - It returns the tool's text and structured result.
  - The fake engine answers from `fakeCloud.ts`.
  - See D-092.

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
| `tool_result … imageData` → `images` | image blocks in a tool result (an MCP screenshot): the session manager saves them with the chat's attachments (`tool-<id>-n.png`) and the tool card shows thumbnails |
| `permission { request }` / `permission_resolved { requestId, status }` | `canUseTool` |
| `result { ok, durationMs, totalCostUsd, usage, error }` | `result` (cost is cumulative; the turn's cost is the difference) |
| `suggestion { text }` | `prompt_suggestion` (with `promptSuggestions: true`, setting `engine.promptSuggestions`): kept as `SessionMeta.suggestion` until the next send; the composer shows it as a chip and as placeholder (Tab takes it). The fake engine suggests from the second turn on |
| `compacted { trigger: manual \| auto, preTokens, postTokens? }` | `system/compact_boundary` (shown as "Conversation compacted (157k → 21k tokens)") |
| `tool_result … diff` | an Edit/Write's `tool_use_result.structuredPatch` (or a new file's content) as unified-diff hunks, at most 400 lines |
| `result … chainUuid` | the last main-conversation message of the turn (not a subagent's): where a rewind resumes |
| `command_output { id, text }` | `system/local_command_output` (what `/usage`, a custom command… printed), shown as an answer |
| `task { task, toolUseId? }` | `task_started/progress/notification/updated`: a subagent's progress on its Task card |
| `background_tasks { tasks }` | `background_tasks_changed` → `SessionMeta.backgroundTasks` |
| `commands { commands }` | `commands_changed` → the session manager's command cache |
| `notice { key? }` | also `api_retry` (one notice, updated), `informational`, high-priority `notification`, `permission_denied` |
| `init … mcpServers` | servers that failed or need sign-in add a notice |
| `status`, `notice`, `error { code? }`, `exit` | status messages ("Compacting…"), errors, process end |

## Sessions (`main/sessions/manager.ts`)

- Chat features on top of a session (commands, `@`, `!`, rewind, steering, effort, MCP, folders,
  background tasks): `docs/reference/chat.md`.

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

## File checkpoints, restoring and forking

- Every message Jig sends carries its own `uuid`; `send()` returns it and the user `ChatItem` keeps it
  as `messageId`.
- With `engine.fileCheckpoints` (default on) Claude Code runs with `enableFileCheckpointing`, and
  `EngineSession.rewindFiles(messageId, dryRun)` restores (or previews) files to their state before
  that message. The chat shows Rewind to before this message → Only the files in a user message's menu: a dry
  run lists the files, you confirm, then they are restored and the chat gets a notice. The transcript
  itself is unchanged.
- **Rewinding the conversation** (`sessions.rewind`, the same submenu and Edit and send again): each
  turn's result keeps `chainUuid`, the last main-conversation message of the turn.
  - Rewinding to before a message drops it and everything after it from the transcript, stops Claude
    Code, and stores `meta.resumeAt`. The next start resumes with `resumeSessionAt` at that point.
  - Rewinding to before the first message sets `meta.resetPending`, and the next message starts a new
    conversation.
  - With `files`, the files are restored first.
- **Fork chat** (the chat's ⋯ menu, `sessions.fork`): a new session with a copy of the transcript and
  `forkPending`; its first start resumes the original Claude Code session with `forkSession: true`,
  so it continues under a new id and the original is untouched.
- The fake engine: "write <file>" writes a file and records a checkpoint; a fork gets a new id.

## Desktop notifications

`main/sessions/notify.ts` decides: when a chat (not a builder session) goes from working to needs-you,
idle or error, and `notifications.desktop` is on and no Jig window is focused, the host shows a system
notification (needs-you also flashes the taskbar button). Clicking it focuses Jig and sends
`sessions.reveal`, which opens the chat.

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

The `jig` MCP server (`engine/jigTools.ts`) has `jig_list_addons`, `jig_request_build`, and the tools
other modules register with `registerJigTools`:
- **Configuration** (settings, themes, layout, add-ons, projects): `docs/reference/configure.md`.
- **Terminals** (`jig_terminal_run/read/list/stop`): `docs/reference/terminals.md`.
- **Claude's browser** (`jig_browser_*`): `docs/reference/browser.md`.

Every chat with these tools also gets one subagent (`StartOptions.agents`, the SDK's `agents`):
**`jig-tester`** (`shared/tester.ts`, D-124) tests pages in Claude's browser on
`engine.testerModel` (Haiku by default), with the browser tools and Read/Grep/Glob only, without
CLAUDE.md; `jigContext` tells Claude to hand testing to it. Search → Test something… (and the flask
in the browser view) starts a chat on the tester model with the same protocol (`testChatMessage`).
- **Learning** (`jig_note_evidence`, `jig_read_profile`, `jig_update_profile`): `docs/reference/learning.md`.
- **Add-ons:** their own tools (`contributes.tools`, slot `claude.tool`, named `addon_<add-on>_<id>`;
  `setAddonTools` replaces them when add-ons change, so new chats get the current set), and Jig's
  `jig_get_addon` / `jig_get_addon_data` / `jig_set_addon_data` / `jig_delete_addon_data`
  (`docs/reference/configure.md`).

Tools marked `readOnly` run without a permission prompt. A tool may return images as well as text
(`ToolOutput`); they show in the chat. `jigContext` (appended to Claude Code's system prompt) tells
Claude when to use the terminal and browser tools.


## Model routing defaults (D-129)

New chats use Claude Code's native `opusplan` in Plan mode: Opus plans, then Sonnet executes after plan approval. Project/chat model choices win over the global default. Explicit saved settings are preserved; Settings → Claude Code → Use recommended defaults applies the preset to an existing installation.

`engine.subagentModel` supplies `CLAUDE_CODE_SUBAGENT_MODEL` to newly started chat processes (default Sonnet). In the bundled Claude Code, the invocation's model wins, then agent definition (including inherit), then this fallback, then the main model. Explore and Plan follow Claude Code's built-in rules; external `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` can override precedence. Jig does not force every agent onto a smaller model. Settings explain this; Agent/Task cards include explicitly requested models, not an inferred actual model. Organization restrictions and Claude settings may substitute models.

Add-on one-turn questions use `engine.helperModel` (Sonnet), or `engine.quickModel` (Haiku) when the add-on asks for a `quick` answer, as the Git add-on does for commit messages. The tester and weekly reflection keep their existing Haiku defaults. Smaller models and delegation cannot guarantee identical quality or a spending cap; large contexts and parallel work still consume quota. `opusplan` does not mean all thinking uses Opus: Sonnet reasons during execution too.

Sources: [model configuration](https://code.claude.com/docs/en/model-config#opusplan-model-setting), [subagent models](https://code.claude.com/docs/en/sub-agents#choose-a-model). Checked 2026-10-29 against SDK 0.3.296.

Settings discovers available model choices through `engine.models`, using a prompt-free, tools-free, non-persistent SDK control process, shared with the usage control-request lifecycle. No model list is hard-coded; opusplan is offered separately as the native planning/execution policy, and existing saved custom IDs remain selectable.

Reported model attribution (D-197): `EngineEvent.block_end` and `tool_use` have optional `model`,
read from the SDK assistant message's own `message.model`, never inferred from a current setting or
agent request. Parent ids keep subagent messages scoped correctly. Imported Claude Code transcripts
use the same normalizer; absent model data remains unknown. The fake skill/subagent examples report
the caller and child models for UI regression coverage.
