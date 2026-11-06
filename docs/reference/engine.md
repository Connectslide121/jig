# Engine and sessions reference

Chats run on one of two engines (principle 1, D-309): Claude Code, the default, or OpenAI's Codex
(optional, signed in with ChatGPT; see Chat providers below). Non-chat one-shot calls may also run on
ChatGPT through the Codex CLI (D-294, see Providers below). Code: `apps/desktop/src/main/engine/` (engine),
`apps/desktop/src/main/sessions/` (session manager), `apps/desktop/src/shared/engine.ts` (types) and
`apps/desktop/src/shared/chat.ts` (transcript reducer).

## Engine interface (`main/engine/types.ts`)

```ts
interface Engine {
  kind: "claude" | "codex" | "fake"; // fake: the scripted engine, for either provider
  provider: "claude" | "codex";      // whose chats it runs
  capabilities: EngineCapabilities;  // what its chats can do (table below)
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
  `canUseTool` → the permission prompt, `mcpServers` (the chat's `toolServers` as in-process SDK
  servers, `sdkMcp.ts`), `effort`, `additionalDirectories`, and
  `resumeSessionAt` after a rewind. Messages carry `origin: { kind: "human" }`; one sent while Claude
  works with `priority: "next"` joins the running turn.
- **`CodexEngine`** (`codex.ts`): OpenAI's Codex over `codex app-server` (JSON-RPC on stdio), one
  process and one thread per chat. See Codex chats below (D-311).
- **`FakeEngine`** (`fake.ts`): scripted replies for tests and `JIG_ENGINE=fake`, with no Claude Code
  process and no quota. The trigger words and environment variables are in `docs/guides/testing.md`
  → The fake engine.
- `normalize.ts` turns SDK messages into `EngineEvent`s and ignores anything it doesn't know.
- **`getEngine(provider = "claude")`** (`index.ts`): one engine per provider for the run. Without a
  provider it is Claude's, which also answers Jig's non-chat calls (one-shots, `callTool`, usage,
  saved conversations). `JIG_ENGINE=fake` gives a `FakeEngine` for both, the Codex one with
  `provider: "codex"` and Codex's capabilities; otherwise `getEngine("codex")` is the `CodexEngine`.

## Chat providers (D-309)

A chat runs on Claude Code (the default) or on OpenAI's Codex, and keeps that provider until it is
handed over to the other one, by a plan limit (D-338) or by you (D-339), both below (`SessionMeta.provider`; missing = `claude`, so chats from before read as Claude chats,
`chatProvider(meta)`). New chats take the provider asked for (`sessions.create { provider }`), else
the project's `provider`, else `engine.provider`. The project's `model` and `effort` are for its own
provider's chats; a chat on the other provider gets `engine.defaultModel` (Claude) or
`engine.codexModel` (Codex). Forks keep the provider; builder, attempt, worktree and opened Claude
Code chats stay on Claude; a saved conversation opens on the provider that saved it (D-315). The
session manager starts each chat on `engineFor(provider)`.

`ENGINE_CAPABILITIES` (`shared/engine.ts`) says what each provider's chats can do, so the UI hides
controls a provider doesn't have instead of showing dead buttons:

| Capability | Claude | Codex | What it covers |
|---|---|---|---|
| `planMode` | yes | yes (D-315: Jig's `exit_plan`) | Plan mode and the approve-the-plan card (ExitPlanMode) |
| `questions` | yes | yes (D-315: Jig's `ask_user`) | questions with choices (AskUserQuestion) |
| `subagents` | yes | no | jig-tester, jig-search (no `agents` are passed to Codex chats) |
| `searchHelper` | no (has jig-search) | yes (D-337) | Jig's `jig_search_code` tool: a separate read-only `codex exec` |
| `testerHelper` | no (has jig-tester) | yes (D-337) | Jig's `jig_test_page` tool: a separate `codex exec` with only the browser tools |
| `rewind` | yes | no | restoring files and the conversation (file checkpoints) |
| `fork` | yes | no | forking a chat into a new branch |
| `history` | yes | yes (D-315: `thread/list`, `thread/read`) | opening conversations the CLI saved on this machine |
| `effortLevels` | low, medium, high, xhigh, max | low, medium, high, xhigh, max, ultra | the effort picker's levels (Codex's from `codex debug models`) |
| `promptSuggestions` | yes | yes (D-315: a one-shot after each turn) | suggesting the next message after a turn |

Jig's tools (`toolServers`) go to both: in-process for Claude, over a local MCP server for Codex (see
Jig's tools in Codex chats below, D-313). Routines and Artifacts stay on Claude (Claude's cloud).

### When a chat hits its plan's limit (D-338)

- **Detection:** both normalizers emit `{ type: "error", code: "rate_limit", message, window?,
  resetsAt? }`. Claude: the assistant message with `error: "rate_limit"`; its reset comes from the
  `rate_limit_event` before it (`status: "rejected"`) or an older message's `|<unix seconds>` ending
  (`limitError`). Codex: the `error` notification with `codexErrorInfo` `usageLimitExceeded` or
  `rateLimitExceeded`; its reset from the latest `account/rateLimits/updated` (`limitReset`: the full
  window's, else the fullest's). A warning never stops anything.
- **The card:** `reduceEvent` turns it into a `limit` item (`status: open | waiting | continued |
  resumed | dismissed`, `provider`, `resetsAt`, `to`). The session manager (`limitHit`) sets
  `SessionMeta.limit = { itemId, provider, state: ask | waiting | continuing, resetsAt? }` by the
  policy (`limitPolicy`: the project's `onLimit`, else `engine.onLimit`; builder chats always ask), the
  other plan's room (`providerRoom`, the usage meter's `planHasRoom`) and the reset (`resetsAt`, else
  `providerResetsAt` from the meter). The limited turn doesn't start queued messages.
- **Waiting:** a timer sends "Your usage limit has reset. Carry on…" 30 s after `resetsAt` on the same
  provider (re-armed when Jig starts again). A message you send yourself ends the wait (the card
  says Dismissed).
- **Nobody answers (D-376):** with `ask` and a reset still ahead, the chat waits too, marked
  `limit.auto`; the card keeps Continue and offers Don't resume (`cancel`, back to `ask`). Any action
  of yours (`limitAction`, a message, a handover) drops `auto` or clears the limit, and
  `resumeAfterLimit` clears `limit` before its turn, so it runs once. A reset that already passed
  (a stale meter) doesn't wait at all, so a resume can't loop into the same limit. `wake()` (on
  `powerMonitor` resume and unlock-screen) resumes the chats whose reset passed during a sleep and
  re-arms the others from the clock.
- **Continuing** (`continueWith(to, reason)`): stops the old process, pushes a `handoff` item (the
  divider), moves the old provider's `engineSessionId` and model into `SessionMeta.providers`, sets
  `provider`, `model`, `effort` and `permissionMode` from `providerDefaults` (the same model tier
  and effort on the new provider, `mapModelAndEffort`, else a new chat's defaults, D-339),
  clears the engine session, and sets `handoffPending`. The next turn prepends
  `buildHandoff(...)` (`shared/handoff.ts`; rules, no AI, ≤ 16 000 characters, `diffStat` from
  `git diff --stat HEAD`) inside `<jig-handoff>`. After a limit Jig sends that turn itself ("Carry on
  with this chat's work from where it stopped.", a Jig message in the transcript).
- **Rewind** to a message before the last handoff is refused (it belongs to the other provider's
  session); the transcript hides rewind on those messages.

### Handing a chat over by hand (D-339)

- **Entry points:** the composer's provider picker (after the first message; before it the picker
  just switches with `sessions.setProvider`) and "Hand over to …" in the chat's ⋯ menu. Both open
  `HandoverDialog` (`renderer/features/sessions/HandoverDialog.tsx`) once
  `sessions.handOverPlan` has answered: `HandoverPlan { from, to, before, after, room, messages,
  files, blocked? }`, computed with the same `providerDefaults` the handover applies.
- **Hand over** calls `sessions.handOver`: `handOver(id, to)` refuses while a turn runs
  (`invalid_args`) and for builder/attempt/worktree chats (`not_allowed`), then `continueWith(to,
  "manual")`. Nothing is sent: the next message you write brings the handoff. No room on the other
  plan is a warning in the dialog, not a refusal.
- **Model tiers** (`mapModelAndEffort`, `shared/handoff.ts`): opus ⇄ sol, sonnet ⇄ terra, haiku ⇄
  luna, read from an alias or a full id; effort kept when the provider has it, `ultra` → `max` on
  Claude; anything else takes the provider's defaults. `featuresLost(from, to)` lists the
  capabilities the dialog says are missing there.
- **The divider** (`handoff` item) shows both marks, "Claude → ChatGPT", then "handed over by you" or
  "Claude's limit reached" (`data-reason` on `handoff-divider`).

## Codex chats (D-311)

`CodexEngine` (`main/engine/codex.ts`) runs one `codex app-server` per chat: the user's own `codex`
(`engine.codexPath`, else the one on PATH through `findCodex`, the native `codex.exe` on Windows),
JSON-RPC with one message per line on stdio. Codex reads its own config, `AGENTS.md` files, skills and
MCP servers as in its CLI, and signs in on its own (ChatGPT); Jig never reads its credentials.

- **Protocol types** are generated from the CLI (`codex app-server generate-ts`) into
  `main/engine/codex-protocol/`, with the version they came from in `codex-protocol/version.ts`
  (`CODEX_PROTOCOL_VERSION`). `npm run codex:protocol [path-to-codex]` regenerates both after a Codex
  update; Biome skips the folder. A chat on another Codex version still runs (the normalizer reads
  messages loosely) and logs the difference.
- **Start:** `initialize`, `model/list`, with `engine.codexSkills` = `claude` `skills/list` and
  `skills/extraRoots/set` (see Skills below), then `thread/resume { threadId: engineSessionId }` (a
  thread that can't resume starts a new one, with a notice), `thread/fork` for a chat opened from a
  saved thread (`forkSession`, D-315), or `thread/start`, all with `cwd`, the model, the approval
  policy and sandbox of the permission mode, and `developerInstructions` (personal instructions,
  D-312, then Jig's appended context, then `STAND_IN_INSTRUCTIONS`, which name the stand-in tools). The answer becomes `init` (thread id = the chat's
  `engineSessionId`, the model Codex picked). A model family (`sol`) resolves with
  `resolveChatGptModel` against `model/list` (D-310).
- **Turns:** `send(text, attachments)` → `turn/start` with text and image items (images as data URLs;
  document text as text; PDFs aren't sent, with a notice), `summary: "auto"` and the pending
  overrides: `setModel`, `setEffort` and `setPermissionMode` apply to the next turn (Codex keeps them
  for the turns after). A message sent with `priority: "next"` while a turn runs → `turn/steer`.
  `interrupt()` → `turn/interrupt`. `models()` is `model/list` (with each model's reasoning levels).
  `contextUsage()` is the last request's tokens against the model's window
  (`thread/tokenUsage/updated`). `close()` → `thread/unsubscribe`, then the process is killed.
  `commands()` is empty; MCP reconnect and toggle, background tasks and rewinding aren't available
  (the capabilities hide them).
- **Permission modes:**

  | Mode | `approvalPolicy` | Sandbox | Effect |
  |---|---|---|---|
  | `default` (Ask before changes) | `untrusted` | workspace-write (+ extra folders) | commands Codex knows only read run; it asks before every other command and every file change, and what you approve can write in the project (D-315) |
  | `acceptEdits` | `on-request` | workspace-write (+ extra folders) | edits run; file changes Codex still asks about are accepted |
  | `bypassPermissions` (Don't ask) | `never` | danger-full-access (no sandbox, D-334) | Codex never asks; MCP tools, Jig's included, run unasked |
  | `plan` (Plan only, D-315) | `on-request` | read-only | Jig declines every command or file approval; each turn starts with `PLAN_MODE_PROMPT`; the plan goes to `exit_plan` |

- **Plan only (D-315):** the turn's input starts with `PLAN_MODE_PROMPT` (a `<jig_plan_mode>` text
  item) while the mode is `plan`. Codex presents the plan with the stand-in `exit_plan`, whose card
  is the plan card. The card switches the mode first (`sessions.setPermissionMode`), then allows; as
  Codex takes a new sandbox only with a new turn, Jig holds that turn's `result` and starts the next
  turn itself with `PLAN_APPROVED_PROMPT` (hidden), in the new mode; the chat shows the two as one
  turn (`mergeResults`: durations and tokens added).
- **Stand-in tools (D-315, `codexTools.ts`):** each Codex chat's `jig` server also has `exit_plan`
  (`{ plan }`) and `ask_user` (AskUserQuestion's `{ questions }`). They run on Jig's side: the
  handler asks through `askPermission` with Claude's tool name (`ExitPlanMode`,
  `AskUserQuestion`) on the call's tool card (`normalizer.mcpCallId`), so the plan and question
  cards, Don't ask's "questions still wait" and voice mode work unchanged. They are marked
  `readOnly`, so Codex doesn't ask before calling them. Their tool cards are mapped to Claude's names
  (`codexToolCardName`). `ask_user` returns one `- question → answer` line per answer, or the card's
  message (skipped, or answered by voice). Waiting cards close when the turn ends.

- **Approvals:** `item/commandExecution/requestApproval` and `item/fileChange/requestApproval` become
  permission cards through `askPermission` (Bash, or Edit/Write with the file). Allow → `accept`,
  always → `acceptForSession`, deny → `decline`. `serverRequest/resolved` (Codex settled it, e.g. the
  turn ended) cancels the card. An MCP tool approval (an `mcpServer/elicitation/request` with
  `_meta.codex_approval_kind: "mcp_tool_call"`, `mcpToolApproval`) is the permission card of that
  tool's card (`mcp__<server>__<tool>`; always → `persist: "session"`); Jig's read-only tools and Don't
  ask mode accept it unasked. Other elicitations are declined and other requests refused until the
  later phases handle them.
- **Jig's tools** (D-313): see Jig's tools in Codex chats below.
- **Events** (`codexNormalize.ts`, `CodexNormalizer`, pure; unknown messages are ignored):

  | Codex | `EngineEvent` |
  |---|---|
  | `agentMessage` item, `item/agentMessage/delta` | text `block_start` / `block_delta` / `block_end` |
  | `reasoning` summary or text deltas | thinking blocks (nothing when Codex keeps its reasoning to itself) |
  | `commandExecution` item | `tool_use` Bash (`command` without Codex's `powershell -Command` / `bash -lc` wrapper) and its `tool_result` (exit code, declined) |
  | a command with no `item/commandExecution/outputDelta` for 3 minutes | a warning notice (key `silent-command-<id>`), replaced by an info notice when it finishes (`SilentCommandWatch`, D-334) |
  | `fileChange` item | `tool_use` Edit (Write for a new file) per file, `tool_result` with the diff |
  | `mcpToolCall`, `dynamicToolCall` | `tool_use` `mcp__<server>__<tool>` (Jig's `exit_plan` / `ask_user` → `ExitPlanMode` / `AskUserQuestion`), result text and images |
  | `webSearch`, `imageView`, `contextCompaction` | WebSearch, Read, `compacted` |
  | `turn/completed` | open blocks end, then `result` (this turn's tokens, no cost; interrupted → `stopped`) |
  | `error` | a notice (`willRetry`: "retrying"); login failures → `error` `not_signed_in` |
  | `account/updated` without a sign-in | `error` `not_signed_in`; an API key → billing notice |
  | `mcpServer/startupStatus/updated` | MCP status (failed → a notice) |

  Fixtures recorded from a real signed-in Codex 0.166.0 (paths renamed) are in
  `main/engine/__fixtures__/codex/`; `codexNormalize.test.ts` replays them. On Windows Codex writes
  small files with PowerShell commands rather than `apply_patch`, so those show as Bash cards.
- **Environment:** `codexSessionEnv` removes `OPENAI_API_KEY` and `CODEX_API_KEY` unless
  `engine.codexAllowApiKey` is on, and `ELECTRON_RUN_AS_NODE` always.
- **Personal instructions (D-312):** with `engine.codexInstructions` = `claude` (the default),
  `personalInstructions()` (`codexInstructions.ts`) reads `CLAUDE.md` in Claude Code's config folder
  (`CLAUDE_CONFIG_DIR`, else `~/.claude`) with its `@imports` followed as Claude Code does (relative
  to the importing file, `~/` = home, five hops, no cycles, not in code), and the chat gets it as
  developer instructions. Nothing is written: no copy in `~/.codex`. When Codex's own
  `$CODEX_HOME/AGENTS.md` says the same, it isn't sent twice. `off` leaves Codex with its own file.
- **Skills (D-315, `codexSkills.ts`):** Codex finds its own (`.agents/skills` in the repository,
  `~/.agents/skills`, `~/.codex/skills`). With `engine.codexSkills` = `claude` (the default) the
  chat's app-server also gets the skill folders a Claude chat there would load: `.claude/skills` from
  the chat's folder up to its repository root, `~/.claude/skills`, and the chat's skill plugins
  (Jig's built-in skills), one extra root per skill (`skills/extraRoots/set`), skipping any name
  `skills/list` already has. Nothing is copied. Jig's appended context leaves out what Codex can't
  use: the subagent and routine lines, `SEARCH_GUIDANCE` and the bundled-skill line.
- **Suggestions (D-315):** after a turn that ended well, with `promptSuggestions` on, the engine calls
  `StartOptions.suggestNext` with your last message (Jig's added text removed) and Codex's last
  reply. The session manager answers it with the AI feature `chatSuggestions` (ChatGPT / Luna by
  default) and `suggestionFrom`; the engine emits `suggestion` unless another turn started meanwhile.
- **History (D-315, `codexHistory.ts`):** `savedSessions` is `thread/list` (newest first, sources
  `cli`, `vscode`, `appServer`; not `exec`, Jig's one-shots) on a short-lived app-server, each thread
  as a `SavedClaudeSession` with `provider: "codex"`. `savedMessages` is `thread/read` with its turns,
  converted into Claude Code transcript messages (`threadMessages`: your text without Jig's added
  text, replies, reasoning, commands, file changes with a structured patch for the diff, MCP calls),
  so `savedChatItems` builds the chat. The session manager lists both providers' saved chats
  together and opens one on its own provider.
- **Not in chats:** the Codex engine's `oneShot`, `callTool` and `planUsage` refuse; those run on
  Claude's engine or through `main/providers` (D-294, D-298).
- **`completer(options)` (D-401):** a warm Codex for short answers one after another (code completion
  now, caption translation next), the same `Completer` as Claude's: `ask(prompt, signal?)` and
  `close()`. Get one with `getEngine("codex").completer(options)` (the fake engine answers in tests;
  `codexCompleter(options)` in `engine/codex.ts` is the real one). Options (`CompleterOptions`):
  `model` (an exact Codex model, "" for Codex's default; resolve a family with `resolveCodexModel`
  first), `appendSystemPrompt` (its developer instructions: completion's, or
  `TRANSLATE_INSTRUCTIONS`), `cwd` (`homedir()` is fine), `env` (the OpenAI keys are stripped),
  `codexPath` (`engine.codexPath`), `effort` (`"low"` is the fastest) and `timeoutMs` (default 60 s);
  `claudePath` is ignored. One `codex app-server` with no tools, a read-only sandbox and no approvals;
  each ask is a fresh ephemeral thread (nothing carries over); asks run in order; an abort or the
  timeout rejects that ask and leaves the process for the next; it restarts after it dies, and the
  caller makes a new completer when the model changes (as `main/completion` does).

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
  unless Settings → Chats → Allow API keys is on (`engine.allowApiKey`). Codex chats:
  `codexSessionEnv()` removes `OPENAI_API_KEY` and `CODEX_API_KEY` unless `engine.codexAllowApiKey`.
- The init message's `apiKeySource` becomes `meta.authSource`: `none` → `subscription`, anything else
  → `api_key` (a warning is shown in the chat and a badge in its header).
- Not signed in (assistant error `authentication_failed`, or a result error mentioning `/login`) sets
  `meta.needsLogin`; the chat shows how to sign in (`claude` → `/login` in a terminal) with a button that
  opens a Jig terminal running `claude` (action `jig.claudeLogin`, phase 5).

## Providers (D-294)

Non-chat AI features call `oneShot(provider, model, prompt, timeoutMs?, { cwd?, system? })` from
`main/providers/index.ts` (`provider: "claude" | "chatgpt"`, `shared/providers.ts`). Both return the
final text, reject with a plain message, and time out after 3 minutes ("... didn't answer in time").

- **`claude`:** the engine's `oneShot` (above): no tools, one turn, `system` appended to the preset.
- **`chatgpt`:** OpenAI's Codex CLI from PATH (`codexBinary()`; on Windows the native `codex.exe`
  behind npm's `codex.cmd`). Jig does not ship it (the npm package is ~480 MB per platform). It runs
  `codex exec` with `codexExecArgs(model, cwd)`: `--json`, `--sandbox read-only`, approvals `never`,
  shell/exec/apps/plugins/sub-agents/images/browser/hooks/memories disabled, web search off,
  `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `--skip-git-repo-check`, prompt on stdin
  (`system` goes before it). `parseCodexExec` returns the last `agent_message`; `turn.failed` and
  top-level `error` events reject (`error` *items* are warnings). `OPENAI_API_KEY` and
  `CODEX_API_KEY` are removed from its environment so it uses the ChatGPT sign-in.
- **Models** (`providerModels`, IPC `ai.models { provider }`): Claude's from Claude Code; ChatGPT's
  from `codex debug models` (visible ones, Codex's order; read again after 30 minutes), else
  `CHATGPT_FALLBACK_MODELS`.
- **ChatGPT model families (D-310):** like Claude's `opus`/`sonnet`/`haiku`, Jig stores a family
  (`sol`, `terra`, `luna`; `CHATGPT_FAMILIES` in `shared/providers.ts`), while Codex's `--model` only
  takes exact slugs (`gpt-6.1-sol`). `resolveChatGptModel(choice, models)` (pure, unit-tested) turns
  a family into the newest `gpt-<version>-<family>` model in Codex's list, comparing versions as
  numbers (6.1 > 6, 6.10 > 6.9; families may sit on different versions), else in
  `CHATGPT_FALLBACK_MODELS`. Any family Codex lists resolves (`astra` too); exact slugs and `""` pass
  through unchanged; an alias no model has gives `""` (Codex's default) with a notice (logged).
  `resolveCodexModel(choice)` (`main/providers`) resolves at call time against the current list, so
  a new release (6.2) is used without a setting changing; `oneShot` uses it, and Codex chats
  too. Pickers list the families first ("Sol (latest) · now GPT-6.1-Sol", `chatGptModelChoices`),
  then a divider, then the exact versions for pinning one.
- **Credentials:** Jig never reads `~/.codex/auth.json` or any Codex/ChatGPT token. Sign-in is `codex
  login` in a private terminal (`jig.codexLogin`); `codex login status` gives only yes/no and the
  method (`parseCodexLoginStatus`).
- **Fake engine:** both providers answer from the fake engine's `oneShot`; Codex never runs in tests.
- **Per feature (D-297):** features call `featureOneShot(feature, prompt, { cwd, system, timeoutMs })`,
  which takes `aiChoice(config, feature)` (`shared/aiFeatures.ts`): the provider and model picked in
  Settings → AI features, else Claude on the feature's old model. On ChatGPT without a picked model
  it is the feature's family (`AiFeature.chatgpt`: Luna where Claude used Haiku, Terra for Sonnet,
  Sol for Opus), and switching a row to ChatGPT picks that family. `ai.providers` says whether ChatGPT
  is ready (installed and signed in). `ai.ask` (add-ons) uses its `feature` (Git, Releases) or the
  add-ons' rows. JSON features (tour, compare attempts) name who answered when the reply doesn't
  parse. Caption translation keeps Claude's warm completer; on ChatGPT it calls `oneShot` per batch of
  captions (D-384), and the row says so beside it while ChatGPT is picked (`AiFeature.chatgptNote`).

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
  permission mode, status, auth source, usage, cost, Claude Code's session id; `azureTenant`, the Azure
  tenant its running process started with, D-285) and a transcript cache of
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

## Jig's tools in Codex chats (D-313)

Codex can't take in-process tools, so each Codex chat with `toolServers` gets a local MCP server:

- **Server** (`localMcp.ts`, `startLocalMcp`): Node `http` on `127.0.0.1`, port 0 (random), one
  `newMcpToken()` (32 random bytes, base64url) per chat. Each tool server is at `/mcp/<name>`
  (`/mcp/jig`), stateless streamable HTTP with JSON answers (`@modelcontextprotocol/sdk`'s
  `McpServer` + `StreamableHTTPServerTransport`, built per request). Tools carry
  `annotations.readOnlyHint`. `close()` with the chat (`session.close()` and when Codex exits).
- **Refused before any tool runs** (`refuseMcpRequest`): a `Host` other than `127.0.0.1:<port>` /
  `localhost:<port>` (DNS rebinding) or any `Origin` header (a browser) → 403; a missing or wrong
  `Authorization: Bearer <token>` (constant-time compare) → 401; an unknown server → 404; anything
  but POST → 405.
- **Codex's config** (`codexMcp.ts`, `jigMcpConfig`): `thread/start` / `thread/resume` `config`
  gets one dotted key per server, `mcp_servers.<name>` = `{ url, http_headers: { Authorization },
  startup_timeout_sec: 20, tool_timeout_sec: 1800, tools: { <read-only tool>: { approval_mode:
  "approve" } } }`, so the user's own Codex MCP servers stay. The token is a header in the thread's
  config, never in Codex's environment: Codex passes its environment to the commands it runs (checked
  with 0.166.0), and it doesn't write the thread's config into its rollout. Codex then lists the tools
  as `mcp__jig__<tool>`; their results (text and images) show on the tool card as in Claude chats.
- **Approvals:** read-only tools run unasked (pre-approved in the config, and an approval request for
  one is accepted); others ask with the permission card, like Claude chats.
- **Project servers** (`projectMcp.ts`, `projectMcpConfig`): the folder's `.mcp.json` `mcpServers`
  that Claude Code may start there (`enableAllProjectMcpServers` or `enabledMcpjsonServers`, minus
  `disabledMcpjsonServers`, in `~/.claude/settings.json`, the project's `.claude/settings.json` and
  `settings.local.json`, and the folder's entry in `~/.claude.json`; only those flags are read) go in
  the same `config` as `mcp_servers.<name>`: stdio → `command`, `args`, `env`; `http` → `url`,
  `http_headers`. `${VAR}` and `${VAR:-default}` are expanded from the chat's environment. SSE servers
  are skipped (Codex has none); names `jig` and `jig-builder` are Jig's.
- **A server that can't start** leaves the chat running without Jig's tools, with a notice.
- **Fake engine:** `call <tool> over mcp [with {json}]` calls a tool through this path
  (`fakeMcp.ts`, the official MCP client); see `docs/guides/testing.md`.

## Helpers in Codex chats (D-337)

Codex has no subagents, so the roles Claude chats hand to jig-search and jig-tester are two tools on a
Codex chat's `jig` server (`main/providers/helpers.ts`, `codexHelperTools`), added in
`sessions/index.ts` `toolServers` when the provider's `searchHelper` / `testerHelper` flag is on.
Each call runs one separate, scoped `codex exec` (`runCodexExec`, `main/providers/index.ts`) in the
chat's folder, stopped with the chat (the tool's abort signal), and counts toward the ChatGPT usage
meter like every Codex call (`onChatGptCall`, D-298).

| | `jig_search_code({ question, thoroughness? })` | `jig_test_page({ url, steps })` |
|---|---|---|
| Arguments (`main/providers/codex.ts`) | `codexSearchArgs`: read-only sandbox (no writes, no network), Codex's shell on (it reads with `rg`), no MCP servers (`--ignore-user-config`, none added: no Jig tools), `project_doc_max_bytes=0` (no AGENTS.md), web search, plugins, apps, sub-agents and the rest off; on Windows `windows.sandbox="unelevated"` (without a mode Codex refuses every command, and the user's mode is in the ignored config) | `codexTesterArgs`: read-only sandbox, no shell at all, one MCP server `jig` = a local MCP server of its own (`startLocalMcp`, new token, closed after the call) serving only the chat's `jig_browser_*` tools, each `approval_mode="approve"`; the token in `JIG_HELPER_MCP_TOKEN` (`bearer_token_env_var`), never on the command line |
| Instructions (`shared/searcher.ts`, `shared/tester.ts`) | `codexSearchPrompt`: jig-search's rules (paths, line numbers, short excerpts, never change files) and the thoroughness | `codexTesterPrompt`: jig-tester's `TEST_PROTOCOL` (PASS/FAIL per check), the page and the steps |
| Model | `engine.codexSearchModel` (default `luna`) | `engine.codexTesterModel` (default `luna`) |
| Returns | the answer text | the report, with the screenshots the browser tools took (newest 6) as `ToolOutput` images |
| Approval | `readOnly`: runs unasked | asks like other tools that change something (it drives the chat's page) |

A role without a model of its own uses `engine.codexHelperFallbackModel` (default `terra`); an empty
fallback is Codex's default model (`chatGptHelperChoice`, `shared/providers.ts`). Families resolve to
their newest version at call time (D-310). The chat is told when to use them: `CODEX_SEARCH_GUIDANCE`
in its appended instructions and `CODEX_TESTER_GUIDANCE` in `jigContext`. The dev server must
already run for a test, as with jig-tester. With `enabled_tools` set on the command line Codex offered
the model no tools at all (0.166.0), so the server itself is what scopes the tester.
The fake engine answers both at once ("Fake search (…)", "Fake test (…)"; `docs/guides/testing.md`).

## The `jig` MCP server (`main/engine/jigTools.ts`)

Attached to every real session, through the engine-neutral registry (D-313): `registerJigTools` /
`setAddonTools` keep the tools, `jigToolServer(meta)` binds them to a chat as a `ChatToolServer`
(`{ instructions, tools: ChatTool[] }`: name, zod shape, handler, `readOnly`, `alwaysLoad`), and the
session hands `{ jig: … }` (a builder chat: `{ "jig-builder": … }`) to the engine as
`StartOptions.toolServers`. Helpers in `chatTools.ts`: `runChatTool` (output → MCP text and image
blocks, a thrown error → an error result), `isReadOnlyChatTool`, `toolHandlersOf` (the fake engine).
A handler gets an `AbortSignal` (D-319): the engine's own cancellation (the Agent SDK's and the local
MCP server's `extra.signal`, the fake engine's turn signal) combined with the chat's, which
`abortJigToolCalls(id)` aborts when the chat is interrupted (Stop) or its process ends; a tool that
can wait long (Claude's browser) gives up then. Tools: `jig_list_addons` (the add-on catalog) and
`jig_request_build { goal, addonId? }` (starts the builder). Handlers are set with
`setJigToolHandlers()` by the add-on host (phase 6) and the builder (phase 8). The appended system
prompt tells Claude to use `jig_request_build` instead of editing Jig's files itself. It also tells Claude what an add-on can be (a whole module, with the D-215 abilities), so the goal it
passes on isn't shrunk to "a button"; the builder's own prompt has the details.

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
which the session manager hands to the usage service instead of the transcript (a used-up window's
reset also goes with the limit error that follows, D-338). Details:
`docs/reference/usage.md`.

## Jig's tools in every chat

The `jig` MCP server (`engine/jigTools.ts`) has `jig_list_addons`, `jig_request_build`, and the tools
other modules register with `registerJigTools`:
- **Configuration** (settings, themes, layout, add-ons, projects): `docs/reference/configure.md`.
- **Terminals** (`jig_terminal_run/read/list/stop`): `docs/reference/terminals.md`.
- **Browser** (`jig_browser_*`): `docs/reference/browser.md`.

Every chat with these tools also gets one subagent (`StartOptions.agents`, the SDK's `agents`):
**`jig-tester`** (`shared/tester.ts`, D-124) tests pages in the browser on
`engine.testerModel` (Haiku by default), with the browser tools and Read/Grep/Glob only, without
CLAUDE.md; `jigContext` tells Claude to hand testing to it. Search → Test something… (and the flask
in the browser view) starts a chat on the tester model with the same protocol (`testChatMessage`).
- **Learning** (`jig_note_evidence`, `jig_read_profile`, `jig_update_profile`): `docs/reference/learning.md`.
- **Add-ons:** their own tools (`contributes.tools`, slot `claude.tool`, named `addon_<add-on>_<id>`;
  `setAddonTools` replaces them when add-ons change, so new chats get the current set), and Jig's
  `jig_get_addon` / `jig_get_addon_data` / `jig_set_addon_data` / `jig_delete_addon_data`
  (`docs/reference/configure.md`).
  The built-in add-ons with tools (each add-on's README says what they do): Releases, Workflows,
  Tasks, Boards, Tests, Time, Pipelines (`pipelines`, `runs`, `run`: read only, never start a run,
  D-371) and Repos (`status`, `commits` read only; `fetch` asks). Scripts, Git, Files and Meetings
  have none yet (D-371, plan in `docs/plan/26-phone.md`).

Tools marked `readOnly` run without a permission prompt. A tool may return images as well as text
(`ToolOutput`); they show in the chat. `jigContext` (appended to Claude Code's system prompt) tells
Claude when to use the terminal and browser tools.


## Model routing defaults (D-129)

New chats use Opus (D-207; before, Claude Code's native `opusplan`, which uses Opus only in Plan mode and Sonnet for all other work, tool calls included). Project/chat model choices win over the global default. Explicit saved settings are preserved; Settings → Chats → Use recommended defaults applies the preset to an existing installation.

Every regular chat gets the `jig-search` subagent (`shared/searcher.ts`): Read, Grep and Glob only, no CLAUDE.md, on `engine.searchModel` (Haiku; empty leaves it out), and a system-prompt line asking the chat to hand code searches to it instead of searching itself or using Explore. Claude Code's built-in Explore inherits the chat's model (capped at Opus), so it saves nothing in an Opus chat. Delegating stays Claude's choice.

`engine.subagentModel` supplies `CLAUDE_CODE_SUBAGENT_MODEL` to newly started chat processes (default Sonnet). In the bundled Claude Code, the invocation's model wins, then agent definition (including inherit), then this fallback, then the main model. Explore and Plan follow Claude Code's built-in rules; external `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` can override precedence. Jig does not force every agent onto a smaller model. Settings explain this; Agent/Task cards include explicitly requested models, not an inferred actual model. Organization restrictions and Claude settings may substitute models.

Add-on one-turn questions use `engine.helperModel` (Sonnet), or `engine.quickModel` (Haiku) when the add-on asks for a `quick` answer, as the Git add-on does for commit messages. The tester and weekly reflection keep their existing Haiku defaults. Smaller models and delegation cannot guarantee identical quality or a spending cap; large contexts and parallel work still consume quota. `opusplan` does not mean all thinking uses Opus: Sonnet reasons during execution too.

Sources: [model configuration](https://code.claude.com/docs/en/model-config#opusplan-model-setting), [subagent models](https://code.claude.com/docs/en/sub-agents#choose-a-model). Checked 2026-10-29 against SDK 0.3.296.

Settings discovers available model choices through `engine.models`, using a prompt-free, tools-free, non-persistent SDK control process, shared with the usage control-request lifecycle. No model list is hard-coded; opusplan is offered separately as the native planning/execution policy, and existing saved custom IDs remain selectable.

Reported model attribution (D-197): `EngineEvent.result` carries optional `modelUsage` (tokens and cost per model id, Claude Code's running totals including subagents and compaction), kept as `SessionMeta.modelUsage` and shown per model in the chat details (D-207). `EngineEvent.block_end` and `tool_use` have optional `model`,
read from the SDK assistant message's own `message.model`, never inferred from a current setting or
agent request. Parent ids keep subagent messages scoped correctly. Imported Claude Code transcripts
use the same normalizer; absent model data remains unknown. The fake skill/subagent examples report
the caller and child models for UI regression coverage.

`SessionMeta.draft?: boolean` marks a memory-only unsent regular chat. A nonempty send clears it
before starting/queuing the turn. Metadata/discovery updates never persist a draft. Imported/forked
sessions have history and explicitly clear the flag; builder sessions keep existing persistence.
