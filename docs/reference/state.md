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
| `layout.json` | JSON, `LayoutSchema` (`shared/layout.ts`) | regions, views, hidden views, how far the bottom panel reaches (`bottomSpan`), main-area tabs, named layouts (`saved`) — see `docs/reference/layout.md` |
| `dev-requests/<build id>/` | `files/` (README.md, SPEC.md, PROMPT.md, mockup.html, context.json), `jig-request-<title>-<id>.zip`, `request.json` (`DevRequestInfo` and `approvedHash`, the version you confirmed) | development requests (D-119), written again from the build each time |
| `worktree-chats.json`, `worktrees/<id>/` | `{ chats: WorktreeChat[] }`; git worktrees | chats in their own worktree (New chat in a worktree…), removed from the chat's ⋯ menu |
| `attempts/<run>.json`, `attempts/<run>/<n>/` | JSON `AttemptRun`; git worktrees | "Try several ways" runs and the attempts' worktrees (removed on Keep or Discard) |
| `sessions/<id>.json` | JSON `{ meta, items, queue }` | chat session metadata and transcript cache (`shared/engine.ts`). Besides title, model, mode, usage and Claude Code's session id, `meta` keeps the chat's `effort`, extra folders (`addDirs`), background tasks, MCP status, the context window, and after a rewind the point to resume at (`resumeAt`, or `resetPending` to start over). `provider` (`claude` \| `codex`, D-309): who runs the chat now; chats saved before it have none and run on Claude. After a limit handoff (D-338): `providers` (`[{ provider, engineSessionId?, model, until, reason }]`, the providers it ran on before), `handoffPending` (`{ from, reason }` until the next message brings the handoff) and, while a limit holds it, `limit` (`{ itemId, provider, state: ask \| waiting \| continuing, resetsAt?, auto? }`; a waiting chat resumes at `resetsAt`, also after a restart or a sleep; `auto`: waiting because nobody answered the card, D-376). Items of kind `limit` (the limit card) and `handoff` (the divider) |
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
| `addon-data/pages/<id>/v<n>/` | files | the Pages add-on's pages: each version's HTML and the files it loads (the list is `addon-data/pages.json`, D-405) |
| `cache/artifacts/<id>.html` | HTML | leftover from the removed claude.ai artifacts loader (D-404; safe to delete) |
| `builds.json` | JSON `{ jobs: BuildJob[] }` | build jobs (last 200) |
| `work/<job>/` | git worktree | a build's workspace (branch `build/<job>` of `addons/`), removed on Accept/Discard |
| `app-builds/previous/` | build snapshot | the build that ran before the last "Pull, build and restart" (launcher fallback) |
| `launcher/` | `status.json`, `launcher.log`, `ready-*` | the launcher's result, log and ready heartbeats (`docs/reference/setup.md`) |
| `evidence.json` | `{ notes: [{ id, at, category, text, projectId?, sessionId? }] }` | notes Jig saved from chats for suggestions (`jig_note_evidence`) |
| `profile.md` | Markdown | how you work, read by every reflection; edit it on "What Jig knows about me" |
| `activity/YYYY-MM-DD.jsonl` | JSON lines `{ at, kind, text, projectId?, detail? }` | the local activity log; prompt detail includes `imageAttachments` / `fileAttachments` string counts, not source method (`docs/reference/learning.md`) |
| `suggestions.json` | JSON `{ suggestions, blocked, runs, lastRun }` | the suggestion inbox, your answers, blocked patterns, pattern runs |
| `projects.json` | JSON, `ProjectsFileSchema` (`shared/projects.ts`) | `{ workspaces: [{ id, path, addedAt }], projects: [{ id, name, path, color, addedAt, focusRepo?, provider?, model?, effort?, permissionMode?, instructions?, starters?, links?, azureTenant? }], activeId }` (D-101). `azureTenant`: the Azure tenant key the project pins (`default` = your own az login; missing = Default, the tenant in use stays); making the project active switches to it, a key whose tenant was removed counts as Default (D-286). `links`: `[{ id, title, links: [{ id, url, label?, type }] }]`, the project's link groups (`shared/links.ts`). Workspaces are the folders you added; a project is a group of chats with `path` = its default workspace, `focusRepo` = its default Git repository and defaults for its chats. `provider` (`claude` \| `codex`; missing = `engine.provider`) runs its new chats; its `model` and `effort` apply to chats on that provider only (D-309); one it leaves empty falls back to `engine.defaultModel`/`engine.effort` (Claude) or `engine.codexModel`/`engine.codexEffort` (ChatGPT) (D-390). `onLimit` (`ask` \| `switch` \| `wait`; missing = `engine.onLimit`): what its chats do when their plan's limit stops them (D-338). A project's folder missing from `workspaces` is added on load |
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
| `engine.onLimit` | `"ask"` | when a chat hits its plan's limit (D-338): `ask` (the limit card's choices; unanswered, the chat resumes at the reset, D-376), `switch` (the same chat carries on with the other provider when its plan has room, else waits for the reset), `wait` (resumes on the same provider at the reset). A project's `onLimit` overrides it; queued tasks follow it too. Protected |
| `engine.codexPath` | `""` | your own `codex` binary; empty = the one on PATH. Protected |
| `engine.codexModel` | `"sol"` | model for new Codex chats: a ChatGPT family (`sol`, `terra`, `luna`: always the newest of it, D-310) or an exact slug |
| `engine.codexEffort` | `""` | reasoning effort for new Codex chats whose project sets none: `low` … `ultra`, `""` = the model's default (D-314, D-390) |
| `engine.codexSearchModel` | `"luna"` | model of Codex chats' search helper (`jig_search_code`, D-337): a ChatGPT family or an exact slug; `""` = the helper fallback model. Protected |
| `engine.codexTesterModel` | `"luna"` | model of Codex chats' tester helper (`jig_test_page`, D-337); `""` = the helper fallback model. Protected |
| `engine.codexHelperFallbackModel` | `"terra"` | model for a Codex helper without one of its own (D-337); `""` = Codex's default model. Protected |
| `engine.codexSkills` | `"claude"` | Claude Code's skills in Codex chats (D-315): `claude` = the project's `.claude/skills` (its folder up to the repository root), `~/.claude/skills` and Jig's built-in skills, added as extra skill roots of the chat's app-server besides Codex's own `.agents/skills` (nothing copied; a name Codex already has is skipped); `off` = only Codex's own |
| `engine.codexInstructions` | `"claude"` | your personal instructions in Codex chats (D-312): `claude` = Claude Code's `CLAUDE.md` with its `@imports`, as developer instructions; `off` = only Codex's own `AGENTS.md` |
| `engine.codexAllowApiKey` | `false` | keep `OPENAI_API_KEY` / `CODEX_API_KEY` in Codex chats' environment (pay-as-you-go). Protected |
| `engine.allowApiKey` | `false` | keep `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` in sessions (pay-as-you-go!) |
| `engine.defaultModel` | `"opus"` | new chats (D-207); `opusplan` = Opus only in Plan mode, Sonnet otherwise; empty follows Claude Code; an explicit project model overrides it |
| `engine.effort` | `""` | reasoning effort for new Claude chats whose project sets none: `low` … `max`, `""` = the model's default; a model without effort levels ignores it (D-390) |
| `engine.subagentModel` | `"sonnet"` | Settings → Chats → Claude chats → Helper fallback model (was "Subagent fallback model"): Claude Code subagent fallback; explicit invocation/agent models win; empty respects existing Claude settings/environment |
| `engine.helperModel` | `"sonnet"` | the Claude model AI features that need thought fall back to (check, release notes, add-ons' other questions) when `ai.<feature>.model` is empty |
| `engine.quickModel` | `"haiku"` | the Claude model short answers fall back to (commit message, chat names, add-ons' short answers) when `ai.<feature>.model` is empty |
| `ai.<feature>` | `{ provider: "claude", model: "" }` | provider (`claude` \| `chatgpt` \| `default`: follows `engine.provider`, Codex chats → ChatGPT, on the feature's default model there and ignoring `model`, D-424) and model for each one-shot AI feature (`shared/aiFeatures.ts`: commitMessage, commitCheck, releaseNotes, tour, attemptsJudge, standup, taskRunReport (Tasks → History run reports, D-355), chatTitles, chatSuggestions (default `chatgpt`: the next message after a ChatGPT chat's turn, D-315), learning, meetingTranslation, meetingNotes (default `default`: Meetings → Generate notes, Sonnet via `engine.helperModel` on Claude, `terra` on ChatGPT, D-424), taskQueueReorganize (Tasks → Reorganize, D-397), addonQuick, addonHelper). `model: ""` = the model the feature used before (Claude) or the feature's ChatGPT family (`luna`, `terra` or `sol`, matching its Claude tier). On ChatGPT the model is a family alias (the newest of that family when the feature runs, D-310) or an exact slug (pinned). Protected; Settings → AI features (D-297) |
| `engine.claudeAiConnectors` | `false` | load your claude.ai account's connectors (Asana, Notion, Linear…) into new chats; off sets `ENABLE_CLAUDEAI_MCP_SERVERS=false`, so none is flagged as needing sign-in; the MCP servers in your Claude Code settings are unaffected (D-160) |
| `engine.defaultPermissionMode` | `plan` | `default`, `acceptEdits`, `plan`, `bypassPermissions` |
| `engine.dontAskWaitSeconds` | `60` | Don't ask mode: seconds a request Claude Code still asks (its own safety checks, e.g. `rm -rf` on a critical path) shows its permission card with a countdown before Jig declines it; 0–600, 0 = declined at once. It only ever declines, never approves, so it isn't protected (D-336) |
| `engine.idleStopMinutes` | `20` | Minutes an idle chat keeps its Claude Code or Codex process; then Jig stops it quietly (no turn end, the status stays) and the next message or anything that needs the process resumes the same conversation. Idle: no turn running or starting, nothing waiting for you, no background task, no queued message, no queued task running in or about to continue the chat. 0–1440, 0 = keep it until the chat closes (D-367) |
| `engine.testerModel` | `"haiku"` | model for testing in the browser: the `jig-tester` subagent every chat gets, and Search → Test something… (D-124) |
| `engine.searchModel` | `"haiku"` | model of the `jig-search` subagent every chat gets and is asked to hand code searches to; empty = no search subagent (D-207) |
| `engine.promptSuggestions` | `true` | Claude Code suggests your next message after a turn (shown above the composer) |
| `engine.aiTitles` | `true` | the quick model (`engine.quickModel`) names each new chat from its first message, in a few words; until it answers the chat is called by the message's first words, and a name you give meanwhile is kept (D-288). Protected: Settings → Chats only |
| `engine.fileCheckpoints` | `true` | Claude Code keeps copies of files before editing, so a chat can restore files to before a message |
| `chat.overview` | `true` | the small overview card at the top right of each chat: turns, tool calls, files changed, commands, skills, subagents, add-ons, MCP calls, tokens; **Show details** opens the full breakdown in a modal (D-184). The chart button in the chat's top bar turns it on or off |
| `chat.times` | `false` | a time beside every message and step of a chat, in a fixed column at its left (24-hour, the day when it changes; D-306). The clock button in the chat's top bar turns it on or off. Off, a message's time shows in its hover toolbar and a steps line's in its tooltip |
| `chat.view` | `"compact"` | how chats show Jig's work: `compact` folds each run of steps (commands, reads, edits, thinking) into one line you can open; `detailed` shows every step as its card (D-159). The switch is in each chat's top bar |
| `meetings.aiTranslation` | `true` | when Teams can't translate live captions (Teams Premium), Jig translates the finished captions into the language picked in the meeting, in batches, skipping lines that waited over 20 s (D-277, D-384); protected |
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
| `editor.completionProvider` | `"copilot"` | who completes code: `copilot` (when signed in), `claude` or `chatgpt` (D-255, D-401); protected, the last two spend plan usage. An older `claudeCompletion: true` loads as `claude` |
| `editor.languageServers` | `true` | run the language servers found on PATH for files in the editor (D-259) |
| `editor.claudeCompletionModel` | `"haiku"` | the model Claude completes with (from Claude Code's model list); protected |
| `editor.chatgptCompletionModel` | `"luna"` | the model ChatGPT completes with: a family (sol, terra, luna: its newest version) or an exact version (D-401); protected |
| `notifications.desktop` | `true` | a system notification when a chat needs you or finishes while Jig is in the background |
| `phone.channel` | `"telegram"` | where Jig reaches your phone (D-377): `telegram` (your own Telegram bot, D-350) or `teams` (your own Teams bot through a relay in your Azure, D-370, D-379; set up in Settings → Phone → Set up Teams, D-381). One at a time: switching parks the other (polling stops) and keeps its saved state, so switching back is connected again (D-399); protected |
| `phone.enabled` | `false` | Jig on your phone (D-350): message your paired bot and read your replies; turned on by pairing; protected |
| `phone.when` | `"away"` | `away`: only while this computer is idle for `phone.awayMinutes` or locked; `always`; protected |
| `phone.awayMinutes` | `5` | 1–60; protected |
| `phone.finished` | `true` | also when a chat finishes or stops with an error (requests and questions are always sent); protected |
| `phone.keepAwake` | `true` | while a chat works or waits for you and the phone is connected, the computer doesn't sleep (`powerSaveBlocker`, the screen may still turn off); protected |
| `phone.screenshots` | `true` | a finished turn that used Jig's browser comes with a screenshot of its page; protected |
| `speech.model` | `"base"` | dictation's Whisper model: `tiny` (~45 MB, fastest), `base` (~80 MB) or `small` (~250 MB, most accurate) (D-208) |
| `speech.language` | `""` | the language you dictate in (`en`, `sv`, …); empty = Whisper recognises it |
| `speech.engine` | `"natural"` | what reads aloud: `natural` (Kokoro on this computer, ~330 MB downloaded once; D-243) or `system` (the system's voices) |
| `speech.naturalVoice` | `"af_heart"` | the natural voice: a Kokoro voice id (`NATURAL_VOICES` in `shared/speech.ts`: American/British English and Spanish, women and men) |
| `speech.voice` | `""` | the system voice when `speech.engine` is `system`; empty = the system's default |
| `speech.gpu` | `true` | run Whisper on the graphics card (WebGPU) when there is one (D-209) |
| `speech.live` | `true` | show the words while you speak (Whisper reads again every ~250 ms) |
| `speech.pause` | `1000` | talking with Jig: ms of silence that end your turn (400–4000) |
| `speech.inputDevice` | `""` | the microphone dictation and talking listen to (a media device id); empty or unplugged = the system's default |
| `speech.outputDevice` | `""` | the speaker the natural voice and talking sounds play on (a media device id); empty or unplugged = the system's default; system voices always use the system's output |
| `speech.noiseFilter` | `"strong"` | talking with Jig: `strong`, `light` or `off`; how strictly noise that isn't a voice is ignored (Silero voice detector on this computer, D-275; `off` = loudness alone) |
| `speech.rate` | `1` | speed of the voice (0.5–2) |
| `speech.workSound` | `true` | a soft note while Jig thinks during talking; a chime when work you handed over by voice finishes or needs you (D-210; no working motif after talking ends) |
| `speech.wake` | `false` | listen for "Hey Jig" voice commands while Jig runs, also minimized or behind other windows (D-278); commands run on this computer, without Jig; protected (only you turn it on: Settings → Speech or a click on the status bar item, D-387) |
| `speech.wakeProfile` | `null` | what Train Hey Jig learned (D-389): `trainedAt`, `heard` (Whisper's text for each of the 5 takes), `variants` (starts the defaults missed, now heard as "Hey Jig"), `level` and `voice` (median loudness and voice-detector score, which lower the listening thresholds); text and numbers only, never audio; protected |
| `speech.announce` | `true` | with `speech.wake`: say out loud when a chat finishes or needs you |
| `browser.showWhenUsed` | `true` | open Jig’s browser view by itself when a chat opens a new page, not on later calls on it (D-410; off: it stays closed until you open it) |
| `browser.pageSessions` | `"shared"` | each chat has its own page in Jig’s browser (D-320); `shared`: the pages share the `persist:jig-browser` session (cookies, logins, storage), so a logout in one chat logs out the others; `separate`: each page gets an in-memory session of its own that ends with the page. Applies to pages opened afterwards |
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
| `factory.demoKitPath` | `""` | the demo kit's folder Jig factory builds and checks demos with (`npm run build`/`check` in it, D-431, D-443); empty = not set (Jig factory asks for it before its first demo). Protected (it runs programs) |
| `factory.designSources` | `[]` | `DESIGN.md` libraries (repository addresses or folders) new brands' directions are made "in the spirit of", offered as "Feels like?" in the interview and read by the critic (D-444, D-462); addresses only |
| `factory.elearning` | `{ server: "", tools: "" }` | the e-learning platform's MCP server (its name in Claude Code's MCP list) and the tools the course stages use to create unpublished courses; empty = the courses stay Markdown (D-467) |
| `factory.concurrency` | `3` | how many stage chats Jig factory runs at once, across all runs (1–6); the Conductor reads it through `api.config()` (D-450) |
| `motion.ffmpegPath` | `""` | the folder of the FFmpeg Motion renders with; empty = look on PATH, else offer to install a pinned build into Motion's data folder (D-454, D-463). Protected (it runs programs) |
| `motion.musicFolder` | `""` | the folder of music tracks Motion's videos may use (M2, D-456) |
| `motion.defaultAspect` | `"16:9"` | the format a new video starts in: `16:9`, `9:16` or `1:1` |
| `motion.defaultVoice` | `""` | the natural voice new videos speak their scripts with (M2, D-455); empty = no voice |
| `updates.sourcePath` | `""` | Jig's git clone for "Pull, build and restart"; empty = the repo Jig runs from |
| `updates.buildCommand` / `installCommand` | `npm run build` / `npm install` | commands an update runs (`docs/reference/setup.md`) |
| `addonGallery.sources` | `[]` | add-on gallery sources: git URLs (https/ssh) or folders (D-179); protected, Settings and the gallery only |

Settings → Chats edits the model strings through pickers populated by Claude Code. Use recommended defaults is a primary action. Appearance offers bundled/system font choices, an optional custom font field and per-font Reset to the schema defaults.

Chat transcript assistant/thinking/tool items may include optional `model` (the SDK-reported calling
assistant model). This stays with the historical call across model changes and restarts. Existing
cache files without it remain readable and display Not reported; no current-model backfill is made.

Tool items also get optional `endedAt` (ISO) and `durationMs` when their result arrives (D-423): Claude's
`tool_result` and Codex's completed item go through the same `tool_result` event in `shared/chat.ts`;
a failed turn ends the calls still running. A second result for the same call keeps the first end.
Items from before D-423, running ones and those of chats opened from a saved conversation (whose replay
times mean nothing) have neither; readers fall back to `at` alone.

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
read-only application resources, not user state. Personal/project Jig skills remain independent.

## Phone (D-350)

`phone.json`: `{ telegram?, teams? }`, each channel's saved state apart (D-377), each
`{ token, bot, owner?, replies?, targets?, topics?, rooms?, cards? }`. A file from before D-377 (those fields
at the top level) is read as Telegram's and rewritten in the new shape on the next save. `token` is
the channel's credential (the Telegram bot token; the Teams relay's address and key, `https://<relay>#<key>`, D-379) encrypted with the OS
(Electron safeStorage, base64); without OS encryption (Linux without a keyring) nothing is written
and the credential lives only until Jig closes. `bot` is the bot's name; `owner` (`{ chatId, name }`) the
account it is paired with (Telegram: the private chat's id; Teams: the Entra object id). `replies` maps the last 300 messages to their chats and `targets` (per place, 0 for the main chat)
the chat plain text written there goes to, so replies keep working after Jig restarts. Message and
place ids are the channel's own (numbers on Telegram, strings on Teams). `cards` (D-468): add-ons'
phone cards by their key (`{ key, addonId, ref, place?, buttons }`, the last 100), so a tap after a
restart still reaches the add-on that sent it.

`phone-teams-setup.json` (D-381): Teams setup's record, no secrets: `choice` (`tenantId`,
`subscription`, `region`, `group`, `suffix` of the resource names), `outputs` (`appId`, `host`), `done`
(the ids of the commands Create finished), `manual` (made in the portal), `packagePath`. The bot's
secret and the relay key are only in memory while Create runs. Forgotten by Disconnect (Teams) and
Start over. The app package goes to `teams/jig-teams-app.zip`.
`topics` `{ jig?, projects? }` are the places Jig made (Telegram: topics in the bot's chat; Jig's own, per project id);
`rooms` maps chats open as rooms on the phone to their places. Teams (D-380) adds `threads`
(chat id → `{ place, parent }`: each chat's thread and the channel it is in; Jig's place there is the
team's General channel) and both channels keep `names` (project id → the name its place was made or
last renamed with, so a renamed project renames its topic or channel). Disconnect removes that
channel's entry; the file goes with the last one. Switching `phone.channel` only parks the old
channel and keeps its entry (D-399).

Outside `JIG_HOME`, Teams' relay (D-378) keeps its own state in Azure, in a table of the Function's
storage account: what the paired account wrote (up to 24 hours, deleted once Jig has read it), the
pairing, the 1:1 chats, the team and its channels; no logs of message text. Its app settings hold
the bot's id, tenant and client secret and `JIG_RELAY_KEY`; the secret never comes back to Jig.
Disconnect forgets the pairing and waiting updates there (`DELETE /api/pairing`); the Azure
resources stay until you delete them.

## Meetings (D-217)

Global addon-data/meetings.json contains settings {tenantId, clientId, endpoint}, an optional room layout
(`shared/meetingLayout.ts`: panels {people, transcript, notes, chat} → {slot, hidden?}, sizes in px, D-221, and `historyTranscript: true` when the history shows its transcript, D-406) and records
{id, title, joinUrl, startedAt, endedAt?, status, capture, captions, gaps, notes, notesDoc?, notesJob?, actions, call?, chat?, folder?},
and `folders` [{id, name}]: your meeting history folders (D-295). A record's `folder` is the folder you put it in,
`null` when you took it out of every folder, or missing to let it go to its recurring meeting's folder (meetings
whose join links name the same Teams meeting thread, two or more of them; worked out, not stored).
`chat` is the meeting's Teams chat read while you were in it ({id, from, fromId?, at, text, mine?}, D-270). Generated notes (D-424): `notesDoc` {tldr, decisions [{what, by, at[]}], questions [{kind: question | risk, text, raisedBy, at[]}], topics [{title, points[]}], participants[], generatedAt, through, provider, model, trimmed?} (`at` are caption timestamps; `through` the frozen transcript's end; `trimmed` lines left out of a too-long transcript), with a Markdown copy in `notes` (older meetings have only `notes`); `notesJob` {state: running | failed, startedAt, error?} while notes are written or after a failed try (a running one loads as failed after a restart). A record
has no project id; actions may have one. An action is {id, title, prompt, owner, mine?, projectId?, evidence, status?, sessionId?, due?, at?}: `due` only when someone said it, `at` the caption timestamps it was said at (D-424); `status` `queued` \| `running` \| `done` \| `dismissed` (missing = still to do), `sessionId` the chat Run in a new chat started (D-407). Records from before D-407 with `queued: true` load as `status: "queued"`; the old field is dropped on the next save. Captions carry id/speakerId/speaker/timestamp/text/final, `source: "local"` when Whisper transcribed them on this computer (D-321); gap reasons include Teams' error message and codes;
Writes use state/jsonStore atomically
and are serialized across captions, notes and queue acknowledgements. Active records become interrupted
with a gap on restart. Immutable question and notes snapshots live in addon-data/meeting-snapshots/<sha256>.json.
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
