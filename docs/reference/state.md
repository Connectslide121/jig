# State reference (`~/.jig`)

Root: `JIG_HOME` or `~/.jig` (`C:\Users\<you>\.jig` on Windows). Paths are defined in
`apps/desktop/src/main/state/paths.ts`. JSON files are written atomically (temp file + rename) through
`state/jsonStore.ts`; a file that fails validation is renamed to `<file>.invalid-<timestamp>` and
defaults are used, so a hand-edit mistake never prevents Jig from starting.

| Path | Format | Contents |
|---|---|---|
| `config.json` | JSON, `ConfigSchema` (`shared/config.ts`) | user settings — see below |
| `window-state.json` | JSON | main window size, position, maximised |
| `logs/main.log` | text | host log |
| `electron/` | Electron's own data | only when `JIG_HOME` is set: Electron's data folder (and so its one-instance lock) moves here, so a Jig with another home runs next to your usual one (your usual Jig keeps Electron's default folder) |
| `layout.json` | JSON, `LayoutSchema` (`shared/layout.ts`) | regions, views, hidden views, main-area tabs, named layouts (`saved`) — see `docs/reference/layout.md` |
| `dev-requests/<build id>/` | `files/` (README.md, SPEC.md, PROMPT.md, mockup.html, context.json), `jig-request-<title>-<id>.zip`, `request.json` (`DevRequestInfo` and `approvedHash`, the version you confirmed) | development requests (D-119), written again from the build each time |
| `worktree-chats.json`, `worktrees/<id>/` | `{ chats: WorktreeChat[] }`; git worktrees | chats in their own worktree (New chat in a worktree…), removed from the chat's ⋯ menu |
| `attempts/<run>.json`, `attempts/<run>/<n>/` | JSON `AttemptRun`; git worktrees | "Try several ways" runs and the attempts' worktrees (removed on Keep or Discard) |
| `sessions/<id>.json` | JSON `{ meta, items, queue }` | chat session metadata and transcript cache (`shared/engine.ts`). Besides title, model, mode, usage and Claude Code's session id, `meta` keeps the chat's `effort`, extra folders (`addDirs`), background tasks, MCP status, the context window, and after a rewind the point to resume at (`resumeAt`, or `resetPending` to start over), and for a Generate notes chat its meeting (`meetingNotes`). `provider` (`claude` \| `codex`, D-309): who runs the chat now; chats saved before it have none and run on Claude. After a limit handoff (D-338): `providers` (`[{ provider, engineSessionId?, model, until, reason }]`, the providers it ran on before), `handoffPending` (`{ from, reason }` until the next message brings the handoff) and, while a limit holds it, `limit` (`{ itemId, provider, state: ask \| waiting \| continuing, resetsAt? }`; a waiting chat resumes at `resetsAt`, also after a restart). Items of kind `limit` (the limit card) and `handoff` (the divider) |
| `attachments/<session>/<uuid>.<ext>` | files | images and documents pasted, dropped or attached in a chat; deleted with the session |
| `attachments/<session>/tool-<toolUseId>-<n>.png` | files | images a tool returned (a browser screenshot), shown in its tool card |
| `attachments/addon-<id>/<uuid>.<ext>` | files | files an add-on kept for messages it sends later (`ctx.attachments`; the Tasks add-on's task files), copied into the chat when sent; the add-on deletes them (`api.attachments.remove`) |
| `scripts.json` | JSON `{ groups: { <projectId>: [{ id, name, scriptIds }] } }` | script groups per project |
| `addons/` | git repository | your add-ons, one folder each; every accepted change is a commit |
| `addon-originals/<id>/` | `files/`, `origin.json` | how an add-on installed from a gallery or `.zip` came (`{ kind, source?, version?, savedAt }`), to show "edited" and Restore original (D-249); removed with the add-on |
| `addons-state.json` | JSON `{ disabled: [ids] }` | add-ons you switched off |
| `addon-data/<id>.json`, `addon-data/<id>/` | JSON / files | per-add-on storage and data folder |
| `cache/addons/` | bundles | bundled add-on host code (safe to delete) |
| `cache/galleries/<hash>/` | git clones | add-on gallery sources (D-179), shallow clones made with your git (safe to delete) |
| `cache/artifacts/<id>.html` | HTML | claude.ai artifacts Claude Code read back, for the Preview tab (safe to delete) |
| `builds.json` | JSON `{ jobs: BuildJob[] }` | build jobs (last 200) |
| `work/<job>/` | git worktree | a build's workspace (branch `build/<job>` of `addons/`), removed on Accept/Discard |
| `app-builds/previous/` | build snapshot | the build that ran before the last "Pull, build and restart" (launcher fallback) |
| `launcher/` | `status.json`, `launcher.log`, `ready-*` | the launcher's result, log and ready heartbeats (`docs/reference/setup.md`) |
| `evidence.json` | `{ notes: [{ id, at, category, text, projectId?, sessionId? }] }` | notes Claude saved from chats for suggestions (`jig_note_evidence`) |
| `profile.md` | Markdown | how you work, read by every reflection; edit it on "What Jig knows about me" |
| `activity/YYYY-MM-DD.jsonl` | JSON lines `{ at, kind, text, projectId?, detail? }` | the local activity log; prompt detail includes `imageAttachments` / `fileAttachments` string counts, not source method (`docs/reference/learning.md`) |
| `suggestions.json` | JSON `{ suggestions, blocked, runs, lastRun }` | the suggestion inbox, your answers, blocked patterns, pattern runs |
| `projects.json` | JSON, `ProjectsFileSchema` (`shared/projects.ts`) | `{ workspaces: [{ id, path, addedAt }], projects: [{ id, name, path, color, addedAt, focusRepo?, provider?, model?, effort?, permissionMode?, instructions?, starters?, links?, azureTenant? }], activeId }` (D-101). `azureTenant`: the Azure tenant key the project pins (`default` = your own az login; missing = Default, the tenant in use stays); making the project active switches to it, a key whose tenant was removed counts as Default (D-286). `links`: `[{ id, title, links: [{ id, url, label?, type }] }]`, the project's link groups (`shared/links.ts`). Workspaces are the folders you added; a project is a group of chats with `path` = its default workspace, `focusRepo` = its default Git repository and defaults for its chats. `provider` (`claude` \| `codex`; missing = `engine.provider`) runs its new chats; its `model` and `effort` apply to chats on that provider only (D-309). `onLimit` (`ask` \| `switch` \| `wait`; missing = `engine.onLimit`): what its chats do when their plan's limit stops them (D-338). A project's folder missing from `workspaces` is added on load |
| `themes/*.json` / `*.jsonc` | Jig or VS Code theme | your own themes; watched — saving re-applies (see `docs/guides/themes.md`) |
| `models/<org>/<model>/` | Hugging Face files | dictation's Whisper models (config, tokenizer, ONNX encoder/decoder: q8 for the processor, fp32 + q4 for the graphics card), downloaded on first use; Settings → Speech removes them (D-208) |
| `azure/tenants.json` | JSON `TenantsFile` (`@jig/azure`, read leniently by `parseTenantsFile`) | Azure tenants added in Jig (D-282): `{ version: 1, default, tenants: [{ key, label, requested?, addedAt, user?, tenantId?, displayName?, domain?, status, problem?, checkedAt? }] }`. `default` is your own az login: what the last check found, plus `label?`, the name you gave it (missing = "Your az login"; D-301). Its key stays `default`, it never gets an `AZURE_CONFIG_DIR` and can't be removed. `status`: `unknown`, `ok`, `signedOut`, `expired`. No tokens: only who and which tenant |
| `azure/<key>/` | the Azure CLI's own folder | one tenant's Azure CLI sign-in (`AZURE_CONFIG_DIR`): the CLI writes and refreshes its tokens there; Jig never reads them and deletes the folder when you remove the tenant |
| `themes/openvsx/<namespace>.<name>/` | extension subset | themes installed from Open VSX: `package.json`, `package.nls.json` and JSON files only (file icon themes: also their icons and fonts) |

Outside `~/.jig`:
- **Browser** keeps its cookies and storage in Electron's session `persist:jig-browser`, under
  Electron's user data folder (`docs/reference/browser.md`).
- **Claude Code** keeps its own conversations and settings in `~/.claude`. Jig reads no credentials
  there. It only appends to `CLAUDE.md` when you choose Remember (`#`), and lists your skills.

A new state file is documented here in the same commit that adds it.

## `config.json`

| Key | Default | Meaning |
|---|---|---|
| `appearance.themeId` | `jig-dark` | theme when not following the system |
| `appearance.followSystem` | `false` | switch between `lightThemeId` / `darkThemeId` with the OS |
| `appearance.lightThemeId` / `darkThemeId` | `jig-light` / `jig-dark` | |
| `appearance.density` | `comfortable` | `compact` or `comfortable` (spacing scale) |
| `appearance.radius` | `soft` | `sharp`, `soft` or `round` corners |
| `appearance.uiFont` / `monoFont` | Inter / JetBrains Mono | font families |
| `appearance.fontSize` | `13` | base UI font size in px (11–18) |
| `engine.claudePath` | `""` | your own `claude` binary; empty = the one shipped with the Agent SDK |
| `engine.provider` | `"claude"` | who runs new chats (D-309): `claude` (Claude Code) or `codex` (OpenAI's Codex, signed in with ChatGPT); a project's `provider` overrides it, and a chat keeps the one it started with until a limit or you hand it over (D-338, D-339). Protected |
| `engine.onLimit` | `"ask"` | when a chat hits its plan's limit (D-338): `ask` (the limit card's choices), `switch` (the same chat carries on with the other provider when its plan has room, else waits for the reset), `wait` (resumes on the same provider at the reset). A project's `onLimit` overrides it; queued tasks follow it too. Protected |
| `engine.codexPath` | `""` | your own `codex` binary; empty = the one on PATH. Protected |
| `engine.codexModel` | `"sol"` | model for new Codex chats: a ChatGPT family (`sol`, `terra`, `luna`: always the newest of it, D-310) or an exact slug |
| `engine.codexEffort` | `""` | reasoning effort for new Codex chats: `low` … `ultra`, `""` = the model's default (D-314) |
| `engine.codexSearchModel` | `"luna"` | model of Codex chats' search helper (`jig_search_code`, D-337): a ChatGPT family or an exact slug; `""` = the helper fallback model. Protected |
| `engine.codexTesterModel` | `"luna"` | model of Codex chats' tester helper (`jig_test_page`, D-337); `""` = the helper fallback model. Protected |
| `engine.codexHelperFallbackModel` | `"terra"` | model for a Codex helper without one of its own (D-337); `""` = Codex's default model. Protected |
| `engine.codexSkills` | `"claude"` | Claude Code's skills in Codex chats (D-315): `claude` = the project's `.claude/skills` (its folder up to the repository root), `~/.claude/skills` and Jig's built-in skills, added as extra skill roots of the chat's app-server besides Codex's own `.agents/skills` (nothing copied; a name Codex already has is skipped); `off` = only Codex's own |
| `engine.codexInstructions` | `"claude"` | your personal instructions in Codex chats (D-312): `claude` = Claude Code's `CLAUDE.md` with its `@imports`, as developer instructions; `off` = only Codex's own `AGENTS.md` |
| `engine.codexAllowApiKey` | `false` | keep `OPENAI_API_KEY` / `CODEX_API_KEY` in Codex chats' environment (pay-as-you-go). Protected |
| `engine.allowApiKey` | `false` | keep `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` in sessions (pay-as-you-go!) |
| `engine.defaultModel` | `"opus"` | new chats (D-207); `opusplan` = Opus only in Plan mode, Sonnet otherwise; empty follows Claude Code; an explicit project model overrides it |
| `engine.subagentModel` | `"sonnet"` | Claude Code subagent fallback; explicit invocation/agent models win; empty respects existing Claude settings/environment |
| `engine.helperModel` | `"sonnet"` | the Claude model AI features that need thought fall back to (check, release notes, add-ons' other questions) when `ai.<feature>.model` is empty |
| `engine.quickModel` | `"haiku"` | the Claude model short answers fall back to (commit message, chat names, add-ons' short answers) when `ai.<feature>.model` is empty |
| `ai.<feature>` | `{ provider: "claude", model: "" }` | provider (`claude` \| `chatgpt`) and model for each one-shot AI feature (`shared/aiFeatures.ts`: commitMessage, commitCheck, releaseNotes, tour, attemptsJudge, standup, chatTitles, chatSuggestions (default `chatgpt`: the next message after a ChatGPT chat's turn, D-315), learning, meetingTranslation, addonQuick, addonHelper). `model: ""` = the model the feature used before (Claude) or the feature's ChatGPT family (`luna`, `terra` or `sol`, matching its Claude tier). On ChatGPT the model is a family alias (the newest of that family when the feature runs, D-310) or an exact slug (pinned). Protected; Settings → AI features (D-297) |
| `engine.claudeAiConnectors` | `false` | load your claude.ai account's connectors (Asana, Notion, Linear…) into new chats; off sets `ENABLE_CLAUDEAI_MCP_SERVERS=false`, so none is flagged as needing sign-in; the MCP servers in your Claude Code settings are unaffected (D-160) |
| `engine.defaultPermissionMode` | `plan` | `default`, `acceptEdits`, `plan`, `bypassPermissions` |
| `engine.dontAskWaitSeconds` | `60` | Don't ask mode: seconds a request Claude Code still asks (its own safety checks, e.g. `rm -rf` on a critical path) shows its permission card with a countdown before Jig declines it; 0–600, 0 = declined at once. It only ever declines, never approves, so it isn't protected (D-336) |
| `engine.testerModel` | `"haiku"` | model for testing in the browser: the `jig-tester` subagent every chat gets, and Search → Test something… (D-124) |
| `engine.searchModel` | `"haiku"` | model of the `jig-search` subagent every chat gets and is asked to hand code searches to; empty = no search subagent (D-207) |
| `engine.promptSuggestions` | `true` | Claude Code suggests your next message after a turn (shown above the composer) |
| `engine.aiTitles` | `true` | the quick model (`engine.quickModel`) names each new chat from its first message, in a few words; until it answers the chat is called by the message's first words, and a name you give meanwhile is kept (D-288). Protected: Settings → Chats only |
| `engine.fileCheckpoints` | `true` | Claude Code keeps copies of files before editing, so a chat can restore files to before a message |
| `chat.overview` | `true` | the small overview card at the top right of each chat: turns, tool calls, files changed, commands, skills, subagents, add-ons, MCP calls, tokens; **Show details** opens the full breakdown in a modal (D-184). The chart button in the chat's top bar turns it on or off |
| `chat.times` | `false` | a time beside every message and step of a chat, in a fixed column at its left (24-hour, the day when it changes; D-306). The clock button in the chat's top bar turns it on or off. Off, a message's time shows in its hover toolbar and a steps line's in its tooltip |
| `chat.view` | `"compact"` | how chats show Claude's work: `compact` folds each run of steps (commands, reads, edits, thinking) into one line you can open; `detailed` shows every step as its card (D-159). The switch is in each chat's top bar |
| `meetings.aiTranslation` | `true` | when Teams can't translate live captions (Teams Premium), Claude translates each finished caption into the language picked in the meeting (D-277); protected |
| `meetings.translationModel` | `"haiku"` | the model that translates captions; protected |
| `meetings.localTranscription` | `true` | when Teams captions aren't available in a meeting or call, the call window transcribes it on this computer with Whisper (`speech.model`; D-321): the call's audio and your microphone, in pieces of 5–10 s, kept in memory only until transcribed. Lines are marked Local. Also in the transcript panel's ⋯ menu |
| `meetings.noiseSuppression` | `true` | noise suppression on your microphone in meetings and calls (D-322): Azure Communication Services' deep noise suppression (`@azure/communication-calling-effects`, removes typing and background noise), or the browser's own where that isn't supported. Also in the call's ⋯ menu (with its state: On, Basic, Unavailable, Off) and in Devices…; a call in progress follows at once |
| `azure.activeTenant` | `""` | the Azure tenant every `az` Jig runs uses (add-on `exec`/`spawn`, project links, setup checks; D-282): a key from `azure/tenants.json`, empty (or a key that's gone) = your own az login, no override. Protected: it decides which credentials programs run with |
| `chatList.view` | `"project"` | how the Chats list groups chats: `project` (a group per project, then "No project"), `status` (Pinned, Needs you, Working, Error, Idle), `recent` (Pinned, Today, Yesterday, Last 7 days, Older) or `all` (one list). The switch is in the Chats header |
| `chatList.pinnedOrder` | `[]` | ids of pinned chats in the order you dragged them; pinned chats not listed follow, newest first |
| `editor.wordWrap` | `false` | long lines wrap in the file editor (Preview), continuation rows keep the line's indentation |
| `editor.showWhitespace` | `false` | spaces and tabs show as faint dots and arrows in the editor |
| `editor.closeBrackets` | `true` | typing `(` `[` `{` `"` `'` adds the closing one |
| `editor.tabSize` | `4` | indentation for a file that doesn't show its own; otherwise the editor follows the file |
| `editor.claudeCompletion` | `false` | code completion with Claude instead of GitHub Copilot (D-255); protected, it spends plan usage |
| `editor.languageServers` | `true` | run the language servers found on PATH for files in the editor (D-259) |
| `editor.claudeCompletionModel` | `"haiku"` | the model Claude completes with (from Claude Code's model list); protected |
| `notifications.desktop` | `true` | a system notification when a chat needs you or finishes while Jig is in the background |
| `phone.enabled` | `false` | Jig on your phone (D-348): message your paired Telegram bot and read your replies; turned on by pairing; protected |
| `phone.when` | `"away"` | `away`: only while this computer is idle for `phone.awayMinutes` or locked; `always`; protected |
| `phone.awayMinutes` | `5` | 1–60; protected |
| `phone.finished` | `true` | also when a chat finishes or stops with an error (requests and questions are always sent); protected |
| `phone.keepAwake` | `true` | while a chat works or waits for you and the phone is connected, the computer doesn't sleep (`powerSaveBlocker`, the screen may still turn off); protected |
| `phone.screenshots` | `true` | a finished turn that used Claude's browser comes with a screenshot of its page; protected |
| `speech.model` | `"base"` | dictation's Whisper model: `tiny` (~45 MB, fastest), `base` (~80 MB) or `small` (~250 MB, most accurate) (D-208) |
| `speech.language` | `""` | the language you dictate in (`en`, `sv`, …); empty = Whisper recognises it |
| `speech.engine` | `"natural"` | what reads aloud: `natural` (Kokoro on this computer, ~330 MB downloaded once; D-243) or `system` (the system's voices) |
| `speech.naturalVoice` | `"af_heart"` | the natural voice: a Kokoro voice id (`NATURAL_VOICES` in `shared/speech.ts`: American/British English and Spanish, women and men) |
| `speech.voice` | `""` | the system voice when `speech.engine` is `system`; empty = the system's default |
| `speech.gpu` | `true` | run Whisper on the graphics card (WebGPU) when there is one (D-209) |
| `speech.live` | `true` | show the words while you speak (Whisper reads again every ~250 ms) |
| `speech.pause` | `1000` | talking with Claude: ms of silence that end your turn (400–4000) |
| `speech.inputDevice` | `""` | the microphone dictation and talking listen to (a media device id); empty or unplugged = the system's default |
| `speech.outputDevice` | `""` | the speaker the natural voice and talking sounds play on (a media device id); empty or unplugged = the system's default; system voices always use the system's output |
| `speech.noiseFilter` | `"strong"` | talking with Claude: `strong`, `light` or `off`; how strictly noise that isn't a voice is ignored (Silero voice detector on this computer, D-275; `off` = loudness alone) |
| `speech.rate` | `1` | speed of the voice (0.5–2) |
| `speech.workSound` | `true` | a soft note while Claude thinks during talking; a chime when work you handed over by voice finishes or needs you (D-210; no working motif after talking ends) |
| `speech.wake` | `false` | listen for "Hey Jig" voice commands while Jig runs, also minimized or behind other windows (D-278); commands run on this computer, without Claude; protected (only Settings → Speech turns it on) |
| `speech.announce` | `true` | with `speech.wake`: say out loud when a chat finishes or needs you |
| `browser.showWhenUsed` | `true` | open Claude’s browser view by itself when Claude starts browsing (off: it stays closed until you open it) |
| `browser.pageSessions` | `"shared"` | each chat has its own page in Claude’s browser (D-320); `shared`: the pages share the `persist:jig-browser` session (cookies, logins, storage), so a logout in one chat logs out the others; `separate`: each page gets an in-memory session of its own that ends with the page. Applies to pages opened afterwards |
| `terminal.shell` | `""` | shell; empty = PowerShell on Windows, `$SHELL` elsewhere. Picked in Settings → Terminal from the detected shells (the full path is stored) or a custom path. Protected: Settings only (it runs programs) |
| `learning.recording` | `true` | record activity locally |
| `learning.retentionDays` | `90` | delete activity older than this |
| `learning.exclusions` | `[]` | activity containing any of these strings is not recorded |
| `learning.schedule` | Monday 10:00, enabled | weekly pattern run (`day` 0=Sunday) |
| `learning.model` | `haiku` | the Claude model the reflection step falls back to when `ai.learning.model` is empty |
| `learning.checkIn` | `off` | weekly or biweekly check-in chat about how you work (offered once after two weeks) |
| `appearance.fileIconTheme` | `"vscode"` | file icons: `vscode` (same as VS Code), `jig`, or a theme id (`docs/reference/file-icons.md`) |
| `projects.repoScanDepth` | `3` | how many folder levels a workspace project is searched for repositories (1–5) |
| `setup.firstRunDone` | `false` | Get started was closed (an installed Jig opens it until then) |
| `updates.sourcePath` | `""` | Jig's git clone for "Pull, build and restart"; empty = the repo Jig runs from |
| `updates.buildCommand` / `installCommand` | `npm run build` / `npm install` | commands an update runs (`docs/reference/setup.md`) |
| `addonGallery.sources` | `[]` | add-on gallery sources: git URLs (https/ssh) or folders (D-179); protected, Settings and the gallery only |

Settings → Chats edits the model strings through pickers populated by Claude Code. Use recommended defaults is a primary action. Appearance offers bundled/system font choices, an optional custom font field and per-font Reset to the schema defaults.

Chat transcript assistant/thinking/tool items may include optional `model` (the SDK-reported calling
assistant model). This stays with the historical call across model changes and restarts. Existing
cache files without it remain readable and display Not reported; no current-model backfill is made.

Regular chats start with optional `SessionMeta.draft: true` in memory only. The first sent prompt
(including attachment-only messages) clears it to false and enables session-file persistence.
Unsent drafts are hidden from history/search and omitted from disk layouts; startup ignores legacy
empty regular chats without deleting files. Imported/forked/builder chats retain persistence (D-199).

### Project notes (D-202, D-289)

Part of the project's knowledge: `knowledge/<projectId>/notes.json` holds `{ notes: [...] }`, each
`{ id, kind: "wait" | "note" | "link", text, url?, done?, by: "you" | "claude", createdAt }`.
Every chat in the project shares them; projectless chats do not read them. The Notes add-on kept
them in `addon-data/notes.json` (`@project(<projectId>) notes`); Jig moves those once at startup
and renames that file `notes.json.migrated` (legacy `chat:<id>` entries stay only there).

### Bundled skill controls (D-205)

`config.json`: `skills.overrides` defaults to `{}`. Each known skill id may hold
`{ enabled: boolean = true, excludedProjects: string[] = [] }`. Missing entries include the skill
in every project and projectless chat. Global off wins; project exclusions are retained for later
re-enabling. New projects are included automatically. Selections affect the next message, using
the chat's project even if another project is selected in the UI. Catalogue/instructions are
read-only application resources, not user state. Personal/project Claude skills remain independent.

## Phone (D-348)

`phone.json`: `{ token, bot, owner?, replies?, targets?, topics? }`. `token` is the Telegram bot token encrypted with the OS
(Electron safeStorage, base64); without OS encryption (Linux without a keyring) nothing is written
and the token lives only until Jig closes. `bot` is its username; `owner` (`{ chatId, name }`) the
Telegram account it is paired with. `replies` maps the last 300 Telegram messages to their chats and `targets` (per topic, 0 without
topics) the chat plain text written there goes to, so replies keep working after Jig restarts.
`topics` `{ jig?, projects? }` are the topics Jig made in the bot's chat (Jig's own, per project id). Disconnect deletes the file.

## Meetings (D-217)

Global addon-data/meetings.json contains settings {tenantId, clientId, endpoint}, an optional room layout
(`shared/meetingLayout.ts`: panels {people, transcript, notes, chat} → {slot, hidden?} and sizes in px, D-221) and records
{id, title, joinUrl, startedAt, endedAt?, status, capture, captions, gaps, notes, actions, call?, chat?, folder?},
and `folders` [{id, name}]: your meeting history folders (D-295). A record's `folder` is the folder you put it in,
`null` when you took it out of every folder, or missing to let it go to its recurring meeting's folder (meetings
whose join links name the same Teams meeting thread, two or more of them; worked out, not stored).
`chat` is the meeting's Teams chat read while you were in it ({id, from, fromId?, at, text, mine?}, D-270). A record
has no project id; actions may have one. Captions carry id/speakerId/speaker/timestamp/text/final, `source: "local"` when Whisper transcribed them on this computer (D-321); gap reasons include Teams' error message and codes;
actions carry id/title/prompt/owner/projectId?/evidence/queued?. Writes use state/jsonStore atomically
and are serialized across captions, notes and queue acknowledgements. Active records become interrupted
with a gap on restart. Immutable question snapshots live in addon-data/meeting-snapshots/<sha256>.json.
The lobby's `lobbyView` is `agenda` or `week` (default `agenda`), independent of the live room layout.
`devices` {microphone?, speaker?, camera?: {id, name}} are the devices picked for meetings (calling SDK ids); a
missing kind means System default, Windows' default device (D-323).
`chatPins` are the Teams chat ids pinned in the lobby's Chats, in pin order (at most 50, D-332): Jig's own,
since Graph doesn't expose Teams' pinned chats; changed only through `meetings.chatPin`.
No audio/video file is created. MSAL sign-in persists as safeStorage-encrypted base64 ciphertext in
`cache/microsoft/<sha256(tenantId:clientId)>.cache`. Windows uses DPAPI; Linux's `basic_text` backend
is refused. Disconnect or changing connection settings deletes the cache. Calling tokens stay in
memory; az retains its own login.
Source builds may import ignored .azure-local/meetings.json once when normal default-home settings are
empty. The script's setup metadata contains no secret. Connection settings are edited in Meetings →
Connection, and are not exposed as AI-editable ConfigSchema fields because they govern paid calling.

## Project knowledge (D-256)

`knowledge/<projectId>/index.json` lists a project's documents (`id`, `name`, `chars`, `addedAt`,
`source`); `knowledge/<projectId>/docs/<id>.txt` holds each one's text (cut at 1,000,000 characters).
`knowledge/<projectId>/notes.json` holds its notes (above). Removing the project removes its folder. `cache/copilot/<version>/` holds Copilot's language server
(D-255) and `cache/copilot/current.json` names the version in use.

**Renderer-only:** the footer remembers in `localStorage` whether it showed ChatGPT's usage last time
(`jig.usage.chatgptShown`, `"1"` / `"0"`), so it reserves that group's space at startup (D-298).
Plan usage itself is never stored: it is asked again each run (`docs/reference/usage.md`).
