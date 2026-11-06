# IPC reference

Source of truth: `apps/desktop/src/shared/ipc.ts`. The renderer calls `call(method, args)` from
`renderer/lib/host.ts` (typed; rejects with `HostError { code, message }`) and subscribes with
`useHostEvent(topic, listener)`.

Errors: handlers throw `JigError(code, message)`; unknown methods return `unknown_method`; unexpected
exceptions return `internal` (and are logged).

## Checks at the boundary

Every call is checked in `main/ipc/router.ts` before its handler runs (`main/ipc/validate.ts`):
- **Sender:** it comes from Jig's own page, `jig-app://` (or the dev server), in its main frame. A
  previewed page or any frame can't call the host.
- **Arguments:** they are an object (or nothing).
- **Exact shapes:** the methods that touch paths, programs, URLs, prompts, terminal input or add-on
  storage have zod schemas (`SCHEMAS`).

Refused calls return `forbidden` or `invalid_args`. `app.openPath` shows executables and scripts in
their folder instead of running them. Handlers still check what they own: preview grants, protected
settings, add-on permissions.

## Methods

| Method | Args | Result | Notes |
|---|---|---|---|
| `app.info` | — | `AppInfo` | version, platform, `jigHome`, dev flag, engine kind, `packaged`, `updated` (started again by the installer after an in-app update), `safeMode`, `startedAfterFailure` (set by the launcher after a failed update) |
| `fake.release` | `{ match? }` | `number` | fake engine only (`JIG_ENGINE=fake`, e2e): lets the turns held by "hold until released" finish (those whose message contains `match`, or all); how many it let go. Fails with `not_fake` otherwise |
| `iconThemes.list` / `iconThemes.rescan` | — | `{ themes, vscodeSetting?, vscodeMatch? }` | file icon themes found, VS Code's `workbench.iconTheme` and the matching theme (`docs/reference/file-icons.md`) |
| `iconThemes.get` | `{ id }` | `{ id, label, theme }` | a file icon theme with `jig-icons:` URLs |
| `iconThemes.active` | — | `{ id, label, theme } \| null` | the theme chosen in Settings (`null` = Jig's icons) |
| `files.image` | `{ path }` | `{ dataUrl, bytes, mime }` | an image file for a preview (png, jpg, gif, webp, avif, bmp, ico, svg; ≤ 25 MB); `not_image`, `not_found`, `too_large` |
| `sessions.undoChange` | `{ sessionId, itemId }` | — | undoes a change Claude made to Jig's configuration (a `change` card; `docs/reference/configure.md`) |
| `about.skills` | — | `SkillInfo[]` | Claude Code skills in `~/.claude/skills` and the active project's `.claude/skills` (front matter only; `docs/reference/about.md`) |
| `tour.create` / `tour.get` | `{ cwd, focus? }` / `{ id }` | `Tour` | a guided tour of the uncommitted changes (`docs/reference/ai-features.md`) |
| `digest.standup` | `{ period: "workday" \| "week" }` | `{ text, since, repos, chats }` | Claude's standup from your commits, uncommitted work and chats |
| `attempts.start` | `{ projectId, repo, task, hints }` | `AttemptRun` | 2–4 chats on the same task, each in its own git worktree (`docs/reference/attempts.md`) |
| `attempts.list` / `attempts.get` | — / `{ id }` | `AttemptRun[]` / `AttemptRun` | runs |
| `worktrees.list` | — | `WorktreeChat[]` | chats that work in their own git worktree |
| `worktrees.start` | `{ repo, name, projectId? }` | `WorktreeChat` | a worktree on branch `jig/<name>-<id>` from HEAD, and a chat in it (schema) |
| `worktrees.apply` / `worktrees.remove` | `{ sessionId }` | — | bring its changes into the repository's working copy (uncommitted) / stop and archive the chat, then delete the worktree and branch |
| `attempts.changes` / `attempts.diff` | `{ id }` / `{ id, index, path? }` | `AttemptChanges[]` / `string` | what each attempt changed |
| `attempts.judge` | `{ id }` | `AttemptVerdict` | Claude compares the attempts (one-shot, no tools) |
| `attempts.keep` / `attempts.discard` / `attempts.repoDirty` | `{ id, index }` / `{ id }` / `{ id }` | `AttemptRun` / `AttemptRun` / `boolean` | apply one to the working copy and clean up / only clean up / whether the working copy has changes |
| `files.preview` | `{ path }` | `FilePreview` | a file for the Preview tab: kind, text or extracted content, `jig-file:` addresses (`docs/reference/preview.md`) |
| `files.locate` | `{ cwd, path }` | `{ path, kind } \| null` | a path Claude wrote, resolved from the chat's folder (`~` = home): file, folder or nothing (D-261) |
| `files.stat` | `{ path }` | `{ size, mtimeMs } \| null` | the Preview tab polls it to follow edits |
| `lsp.open` | `{ path }` | `LanguageServerStatus` | the language server for a file (D-259): ready (id, root, language id), missing (install command), none or off |
| `lsp.send` | `{ id, message }` | — | a JSON-RPC message (string) to that server; answers come as event `lsp.message`, `lsp.exited` when it stops |
| `lsp.release` | `{ id }` | — | an editor closed; the server stops 3 minutes after its last one |
| `lsp.restart` | `{ id }` | — | stop it (the next editor starts it again) |
| `lsp.servers` | — | `LanguageServerInfo[]` | the known servers, found on PATH or not (Settings → Editor) |
| `knowledge.list` | `{ projectId }` | `KnowledgeDoc[]` | a project's knowledge (D-256); event `knowledge.changed` |
| `knowledge.read` | `{ projectId, id }` | `{ name, text }` | one document's text |
| `knowledge.addFiles` | `{ projectId, paths? }` | `{ added, skipped }` | add files (a picker without `paths`): text, code, Word, Excel, PowerPoint |
| `knowledge.remove` | `{ projectId, id }` | — | remove a document |
| `notes.list` | `{ projectId }` | `Note[]` | a project's notes (D-289); changes emit `knowledge.changed` |
| `notes.add` | `{ projectId, kind, text, url? }` | `Note[]` | add a note as you |
| `notes.update` | `{ projectId, id, text?, url?, done? }` | `Note[]` | change a note (`url: ""` clears it) |
| `notes.remove` | `{ projectId, id }` | `Note[]` | remove a note |
| `claudeImport.open` | `{ path? }` | `ClaudeExportSummary \| undefined` | read `projects.json` from claude.ai's export zip (a picker without `path`) |
| `claudeImport.apply` | `{ token, uuids, path }` | `{ projectIds }` | make Jig projects (default workspace `path`) with instructions and knowledge |
| `claudeImport.openSettings` | — | — | claude.ai's settings in the system browser |
| `completion.state` | — | `CompletionState` | who completes code (copilot, claude, chatgpt, off) and the Claude and ChatGPT models, Copilot's setup (D-255); event `completion.changed` |
| `completion.request` | `{ path, text, offset, tabSize, insertSpaces }` | `CompletionSuggestion \| null` | one inline suggestion at the caret; a newer request drops an older one |
| `completion.accepted` | `{ id }` | — | Tab took a Copilot suggestion (its acceptance command) |
| `completion.closeFile` | `{ path }` | — | the editor closed a file (Copilot forgets it) |
| `completion.copilotSetup` | — | — | download Copilot's language server from npm (checksum checked) and start it |
| `completion.copilotSignIn` | — | `{ userCode, url }` | GitHub device sign-in; the server opens github.com and keeps the sign-in |
| `completion.copilotSignOut` | — | — | sign out of Copilot |
| `files.write` | `{ path, text, expectedMtimeMs? }` | `{ size, mtimeMs }` | the Preview editor saves: only inside a workspace or a file opened in Preview this run; with `expectedMtimeMs`, `changed` when the file changed on disk since; written next to the file and renamed over it. Errors `not_allowed`, `not_a_file`, `changed`, `write_failed` |
| `ai.models` | `{ provider: "claude" \| "chatgpt" }` | `ModelInfo[]` | the models a provider offers for one-shot features: Claude Code's, or the Codex CLI's (`codex debug models`, else a short built-in list), D-294 (schema) |
| `ai.ask` | `{ addonId, prompt, cwd?, quick?, feature? }` | `{ text, provider, model }` | an add-on with the `ai` permission asks a one-shot question (no tools) on the provider and model picked in Settings → AI features (`main/ai`), and gets the answer with the provider and model that gave it: `feature` (`commitMessage` \| `commitCheck` \| `releaseNotes` \| `taskRunReport` (10-minute limit), the built-in add-ons) picks that row, else "Add-ons: short answers" for `quick` or "Add-ons: other questions" (D-297, schema) |
| `ai.providers` | — | `ProviderStatus[]` | whether Claude and ChatGPT can answer now: ChatGPT is ready when the Codex CLI is installed and `codex login status` says signed in (only yes/no and the method), D-297 |
| `sessions.fork` | `{ id }` | `SessionMeta` | a new chat continuing this one as a branch (Claude Code's fork; transcript copied) |
| `sessions.saved` | — | `SavedClaudeSession[]` | the conversations Claude Code and Codex saved on this computer, newest first (`provider: "codex"` for Codex threads, D-315); `chatId` when one is already a Jig chat (D-150) |
| `sessions.openSaved` | `{ sessionId }` | `SessionMeta` | opens one as a chat in No project with its history, on the provider that saved it; its first message continues it as a copy (validated id; folder and title from the saved list) |
| `sessions.rewindFiles` | `{ id, itemId, dryRun }` | `RewindResult` | restore files Claude changed since a user message (file checkpoints); `dryRun` only reports |
| `usage.get` / `usage.refresh` | — | `UsageByProvider` | your plans' usage per provider: `claude` (5-hour and weekly windows from Claude Code) and `chatgpt` (from the Codex CLI's app-server, D-298; `docs/reference/usage.md`) |
| `setup.check` | — | `SetupCheck[]` | first-run checks (`docs/reference/setup.md`) |
| `updates.check` | — | `UpdateInfo` | git clone: commits behind upstream; installed: latest GitHub release |
| `updates.apply` | — | `{ restarting }` | Windows: start the download when none is ready, else install the downloaded update with the installer's window shown and restart (D-236; `updates.state` says `download: "installing"` 2 s before Jig closes, D-252); source: pull/build/restart; other platforms: release page. Refuses working chats; asks the quit guards first (D-343: `restarting: false` while the quit modal asks, the install runs on its choice); progress via `updates.state` |
| `quit.decide` | `{ quit, reason?, action? }` | — | the answer to `quit.ask` (D-343): `quit: false` keeps Jig open; `quit: true` runs the reason's action first (a failing action rejects and the question stays open), then quits or installs the update |
| `app.openExternal` | `{ url }` | — | http(s)/mailto only, opens the default browser |
| `app.showItemInFolder` | `{ path }` | — | reveals a file in Explorer/Finder |
| `app.openPath` | `{ path }` | — | opens a folder in Explorer/Finder or a file with its default app; `open_failed` |
| `app.pickFolder` | `{ title? }` | `string \| undefined` | native folder picker |
| `app.pickFiles` | `{ title?, defaultPath? }` | `string[]` | native file picker (multi-select); `[]` when cancelled |
| `app.toggleDevTools` / `app.reload` | — | — | developer tools / reload the window |
| `config.get` | — | `JigConfig` | |
| `config.update` | `DeepPartial<JigConfig>` | `JigConfig` | validated, saved atomically, emits `config.changed` |
| `themes.list` | — | `ThemeSummary[]` | every theme from every source; unreadable ones are skipped (and logged) |
| `themes.get` | `{ id }` | `JigTheme` | `not_found`, `invalid_theme` (message says why) |
| `themes.rescan` | — | `ThemeSummary[]` | forget the cache and rescan (after installing a VS Code theme) |
| `themes.searchOpenVsx` | `{ query }` | `OpenVsxExtension[]` | theme extensions on open-vsx.org; `network` when offline |
| `themes.installOpenVsx` | `{ namespace, name }` | `ThemeSummary[]` | the themes it added; `not_a_theme` if it has none |
| `themes.remove` | `{ id }` | — | user files and Open VSX installs only (`not_removable` otherwise) |
| `window.setTitleBarColors` | `{ symbolColor }` | — | colour of the Windows/Linux window controls |
| `window.minimize` / `window.toggleMaximize` / `window.close` | — | — | for custom window controls |
| `layout.get` | — | `Layout` | `~/.jig/layout.json` (see `docs/reference/layout.md`) |
| `layout.set` | `Layout` | `Layout` | saves the renderer's layout (no event back to the renderer) |
| `projects.list` | — | `ProjectsState` | `{ workspaces: WorkspaceInfo[], projects: ProjectInfo[], activeId }` (D-101). A workspace is a folder you added; `WorkspaceInfo` adds `name`, `exists`, `isGitRepo`, `repos`. A project is a group of chats you manage; `ProjectInfo` adds the same facts about its default workspace (`path`) |
| `projects.add` | `{ path? }` | `Project \| undefined` | quick "a folder as a project": the folder becomes a workspace and, unless a project has it as default, a project named after it; that project becomes active. Without `path`: folder picker; `not_a_folder` |
| `projects.create` | `{ name, path, color?, model?, effort?, permissionMode?, instructions?, starters?, azureTenant? }` | `Project` | a new project with `path` as its default workspace (added if new); it becomes active |
| `projects.update` | `{ id, name?, color?, path?, model?, effort?, permissionMode?, instructions?, starters?, azureTenant? }` | `ProjectsState` | an empty string or list clears a preference; `azureTenant` is a tenant key (`""` = Default) and switches the active tenant when it is the active project's (D-286); a new `path` is added as a workspace and clears the default repository. Colour is a token name (`accent`, `info`, `success`, `warning`, `danger`, `muted`) |
| `projects.remove` | `{ id }` | `ProjectsState` | forgets the project; its chats move to "No project"; folders are never touched |
| `workspaces.add` | `{ path? }` | `Workspace \| undefined` | adds a folder (folder picker without `path`); an added folder is returned as it is |
| `workspaces.remove` | `{ id }` | `ProjectsState` | forgets a folder; `in_use` while a project has it as its default workspace |
| `projects.setActive` | `{ id }` | `ProjectsState` | |
| `projects.reorder` | `{ ids }` | `ProjectsState` | |
| `projects.rescanRepos` | `{ id }` | `ProjectsState` | a project's or workspace's (by id) folder: look for the repositories inside again (the list is cached) |
| `projects.setFocusRepo` | `{ id, repo? }` | `ProjectsState` | the project's default Git repository (status bar, Git actions, Git panel); `not_found` if it isn't one of its workspace's |
| `sessions.list` | — | `SessionMeta[]` | newest first (see `docs/reference/engine.md`) |
| `sessions.get` | `{ id }` | `SessionSnapshot` | `{ meta, items, queue }` |
| `sessions.create` | `{ projectId?, title?, cwd?, provider? }` | `SessionMeta` | a chat in a project or none. Runs in `cwd` (any folder) or the project's default workspace; without a project `cwd` is required. Model, effort and permission mode: the project's defaults, else Jig's. `provider` (`claude` \| `codex`, D-309): default the project's, else `engine.provider`; the project's model and effort apply only to its own provider's chats; a provider without plan mode (Codex) gets Ask before changes instead of Plan only |
| `sessions.setProject` | `{ id, projectId? }` | — | puts a chat in a project, moves it, or takes it out |
| `sessions.switchProject` | `{ id, projectId }` | `SessionMeta` | a chat nobody has written in yet moves to another project as if started there: its default workspace, provider, model, effort and permission mode (D-341); `not_allowed` once its first message is sent |
| `sessions.setPinned` | `{ id, pinned }` | — | pinned chats stay at the top of their project |
| `links.azure` | `{ group?, subscription? }` | `{ items: AzureItem[], problems: string[], tenant: { label, isDefault } }` | the resource groups of every enabled subscription of the active tenant (D-282; your own az login: every directory it sees, `az account list --all`; a tenant added in Jig: only subscriptions of its Entra tenant id), then `az group list --subscription`, 4 at a time (each item names its subscription), or one group's resources in its subscription (`az resource list -g`), as portal links with a guessed type; a subscription that can't be read is a line in `problems`. Runs through the shared `runAz` (D-284): `az_missing`, `az_login` (signed out or expired), `az_failed`, messages naming an added tenant |
| `sessions.addAttachment` | `{ id, data?, mime?, name?, path? }` | `ChatAttachment { path, mime, name, kind }` | keeps pasted/dropped bytes (base64) or copies a file into `attachments/<session>/`: images, PDFs, .docx/.xlsx/.pptx, text files (`docs/reference/engine.md` → Attachments); `not_supported`, `too_large`, `not_found`, `unreadable` |
| `sessions.interrupt` | `{ id }` | — | stops the current turn |
| `sessions.answerPermission` | `{ id, requestId, decision }` | — | `{ behavior: "allow", always?, updatedInput? }` or `{ behavior: "deny", message? }` |
| `sessions.removeQueued` | `{ id, queuedId }` | — | a queued or parked message (D-365) |
| `sessions.editQueued` | `{ id, queuedId, text, attachments? }` | — | changes a queued or parked message (D-365) in the same place in its list: its text, and with `attachments` (files kept by `sessions.addAttachment`; left out, it keeps its own) its files; text may be empty only when files remain; `invalid_args` when both are empty, `not_found` once it has been sent (schema: prompt text, attachments) |
| `sessions.setModel` / `sessions.setPermissionMode` | `{ id, model }` / `{ id, mode }` | — | applied live |
| `sessions.setProvider` | `{ id, provider }` | `SessionMeta` | who runs a chat that hasn't sent anything yet (the composer's provider picker, D-314): it takes that provider's default model, effort and permission mode (Plan only becomes Ask before changes on Codex). `not_allowed` once the chat has a turn, a queued message or anything in its transcript: after that it changes only through a handover (`sessions.handOver`, D-339, or a limit, D-338) |
| `sessions.handOverPlan` | `{ id, provider }` | `HandoverPlan` | what handing the chat over to `provider` would do (D-339), for the confirmation dialog: model/effort/mode before and after, the other plan's room, messages and edited files to carry over, `blocked` while a turn runs or for chats that stay on Claude Code |
| `sessions.handOver` | `{ id, provider }` | `SessionMeta` | hands a chat over to the other provider between turns (D-339): a divider, the model tier, effort and mode mapped, the next message brings the handoff; `invalid_args` while a turn runs, `not_allowed` for builder/attempt/worktree chats |
| `sessions.limitAction` | `{ id, itemId, action: "continue" \| "wait" \| "cancel" \| "dismiss" }` | `void` | your choice on a limit card (D-338): `continue` with the other provider (`unavailable` when its plan has no room; refused for builder chats), `wait` and resume at the reset (`invalid_args` when the reset isn't known), `cancel` the wait (the card asks again), `dismiss` the card. `not_found` when the card is no longer the chat's current limit |
| `sessions.setVoice` | `{ id, voice }` | — | you are talking with Claude in this chat: each turn tells it to answer briefly for reading aloud (D-209) |
| `sessions.rename` / `sessions.archive` | `{ id, title }` / `{ id, archived }` | — | |
| `sessions.stop` | `{ id }` | — | ends the Claude Code process (resumes on the next message) |
| `sessions.delete` | `{ id }` | — | removes Jig's record; Claude Code's own transcript stays |
| `sessions.send` | `{ id, text, attachments?, now? }` | — | sends, or queues while Claude works; `now` joins the running turn instead |
| `sessions.park` | `{ id, text?, attachments?, queuedId? }` | — | parks a message (D-365): saved with the chat, never sent by itself; with `queuedId` a queued message moves to the parked ones; `invalid_args` when empty, `not_found` when the queued one has gone (schema: prompt text, attachments) |
| `sessions.sendParked` | `{ id, parkedId, now? }` | — | sends a parked message as `sessions.send` would (now, queued while busy, or into the turn with `now`); it stays parked if sending fails; `not_found` once it has gone |
| `sessions.rewind` | `{ id, itemId, files }` | `{ text, files? }` | rewinds the chat to before your message (and with `files`, restores the files); returns the message for the box |
| `sessions.runShell` | `{ id, command }` | — | a `!` command in the chat's folder; output goes with the next message |
| `sessions.remember` | `{ id, text, scope: project \| user }` | `{ path }` | appends `- text` to CLAUDE.md |
| `sessions.commands` / `sessions.models` | `{ id }` | `SlashCommandInfo[]` / `ModelInfo[]` | from Claude Code (starts it for the chat if needed) |
| `sessions.setEffort` | `{ id, effort? }` | — | `low` … `max`; empty = the model's default |
| `sessions.setDirs` | `{ id, dirs }` | — | extra folders (restarts Claude Code at the next message) |
| `sessions.mcpStatus` / `sessions.mcpReconnect` / `sessions.mcpToggle` | `{ id }` / `{ id, name }` / `{ id, name, enabled }` | `McpServerInfo[]` / — / — | the chat's MCP servers |
| `sessions.background` / `sessions.stopTask` | `{ id, toolUseId? }` / `{ id, taskId }` | `boolean` / — | move running work to the background; stop a background task |
| `sessions.export` | `{ id }` | `string \| undefined` | saves the chat as Markdown (asks where) |
| `files.search` | `{ root, query, limit? }` | `string[]` | fuzzy file/folder search inside a project (`@` mentions) |
| `routines.list` | `{ refresh? }` | `{ at, routines: Routine[] }` | Claude Code routines via its RemoteTrigger tool (cached 5 min; `docs/reference/routines.md`) |
| `routines.run` / `routines.setEnabled` | `{ id }` / `{ id, enabled }` | — | run now; switch on or off |
| `routines.runs` / `routines.runLog` | `{ id }` / `{ sessionId }` | `RoutineRun[]` / `RoutineLogEntry[]` | a routine's runs; a run's messages |
| `terminals.list` | — | `TerminalInfo[]` | see `docs/reference/terminals.md` |
| `terminals.create` | `{ projectId?, cwd?, command?, shell?, title?, cols?, rows? }` | `TerminalInfo` | a shell in the project folder (or `cwd`), or a shell running `command`; `shell` runs that shell once instead of the default, accepted only when it is a detected shell or the configured one (D-241) |
| `terminals.shells` | — | `ShellChoices` | shells installed on this machine (`{ name, path }`) and the one an empty `terminal.shell` starts (D-240) |
| `terminals.write` / `terminals.resize` | `{ id, data }` / `{ id, cols, rows }` | — | input / size |
| `terminals.buffer` | `{ id }` | `string` | scrollback so far |
| `terminals.rename` / `terminals.kill` / `terminals.close` | `{ id, title }` / `{ id }` / `{ id }` | — | kill stops the process and keeps the output; close removes the terminal |
| `terminals.watching` | `{ id? }` | — | the terminal on screen in the Terminals view (none: the view is out of sight); finished Claude terminals never close under you (D-373) |
| `terminals.codexLogin` | `{ projectId? }` | `TerminalInfo` | private terminal running the Codex CLI's ChatGPT sign-in (`codex login`, no OpenAI API key in its environment); when it ends, `codex.signIn` (D-294) |
| `terminals.claudeLogin` | `{ projectId? }` | `TerminalInfo` | private terminal running Claude Code's sign-in (`claude auth login`); when it ends, `claude.signIn` |
| `userBrowser.state` | — | `UserBrowserState` | current window's native user page; separate from Claude |
| `userBrowser.present` | `{ bounds: { x, y, width, height }, visible }` | — | native slot in CSS pixels; hidden for menus, dialogs and inactive tabs |
| `userBrowser.navigate` | `{ url?, action? }` | — | http(s)/file URL or back/forward/reload/stop; starts without awaiting page load |
| `userBrowser.devtools` | — | — | detached native page developer tools |
| `browser.pages` | — | `BrowserPageInfo[]` | Claude's browser, one page per chat (D-320): each page's `chatId`, `state`, `driving` (a tool call runs or ended < 5 s ago) and `lastUsedAt` (`docs/reference/browser.md`) |
| `browser.state` | `{ chatId }` | `BrowserState` | the chat's page: open, url, title, loading, back/forward, size, error count (`open: false` without a page) |
| `browser.watch` | `{ chatId, on }` | — | start/stop `browser.frame` events of the chat's page for a view |
| `browser.navigate` | `{ chatId, url? , action? }` | `BrowserState` | open a URL (http, https, file) in the chat's page (made if it has none), or `back` / `forward` / `reload` |
| `browser.input` | `{ chatId, input: BrowserInput }` | — | mouse, wheel, key or text from the live view, in page pixels |
| `browser.resize` | `{ chatId, width, height }` | `BrowserState` | 200–4000 px |
| `browser.console` | `{ chatId, clear? }` | `ConsoleEntry[]` | the chat's page's console messages and load errors |
| `browser.network` | `{ chatId, clear? }` | `NetworkEntry[]` | the chat's page's requests, credentials redacted |
| `browser.networkDetail` | `{ chatId, id }` | `NetworkEntry & { body?, bodyNote? }` | one request with its response body |
| `browser.close` | `{ chatId }` | — | closes the chat's page (Close page in its tab's ⋯) |
| `scripts.list` | `{ projectId }` | `ProjectScripts` | discovered scripts + saved groups |
| `scripts.run` / `scripts.stop` / `scripts.restart` | `{ projectId, scriptId }` | `TerminalInfo` / — / `TerminalInfo` | |
| `scripts.saveGroup` | `{ projectId, group: { id?, name, scriptIds } }` | `ProjectScripts` | create or update |
| `scripts.deleteGroup` / `scripts.runGroup` | `{ projectId, groupId }` | `ProjectScripts` / `TerminalInfo[]` | |
| `addons.list` | — | `AddonInfo[]` | every add-on with manifest, errors, warnings, UI/CSS urls (`docs/reference/addon-api.md`) |
| `addons.setEnabled` | `{ id, enabled }` | — | remembered in `addons-state.json` |
| `addons.call` | `{ id, method, args? }` | `unknown` | calls a `host.ts` export; `disabled`, `no_host`, `addon_error` |
| `addons.callShared` | `{ from, id, method, args? }` | `unknown` | add-on `from` calls another's shared host method (its manifest's `exports`; `not_shared` otherwise), D-215 |
| `addons.badges` | — | `Record<string, string>` | the add-on views' badges by full view id (`addon.<id>.<view>`) |
| `addons.setBadge` | `{ id, view, value? }` | — | a badge on one of the add-on's own views (count → `99+` above 99, text → 4 characters; 0/nothing clears); `invalid_args` for another add-on's view |
| `addons.systemNotify` | `{ id, title, message? }` | `boolean` | a system notification for an add-on's toast, only when no Jig window is in front and desktop notifications are on; click brings Jig forward |
| `addons.search` | `{ query, projectId?, cwd? }` | `AddonSearchGroup[]` | asks every search provider (`contributes.search`) at once: 1.5 s each, up to 8 checked results; `{ addonId, provider, title, icon?, results }` |
| `addons.addAttachment` | `{ id, data?, mime?, name?, path? }` | `ChatAttachment` | `ctx.attachments.add/pick`: keeps a file for a message the add-on's host sends later, in `attachments/addon-<id>/` (same types and limits as `sessions.addAttachment`); `api.chats.send({ attachments })` copies them into the chat |
| `addons.saveCopy` | `{ id, from, name?, title? }` | `string \| undefined` | `ctx.saveCopy`: a Save dialog (file) or folder picker (folder) and a copy of something in the add-on's own `addon-data/<id>/` folder; anything else is refused; never over an existing folder (D-405) |
| `addons.storageGet` / `addons.storageSet` | `{ id, key }` / `{ id, key, value }` | `unknown` / — | per-add-on JSON |
| `addons.reload` | `{ id? }` | — | rebuild one add-on, or all |
| `builds.list` | — | `BuildJob[]` | newest first (`docs/reference/builder.md`) |
| `builds.start` | `{ goal, origin, targetAddonId?, originSessionId? }` | `BuildJob` | starts a builder session |
| `builds.accept` | `{ id }` | `BuildJob` | `not_ready`, `accept_failed` |
| `builds.discard` | `{ id }` | `BuildJob` | |
| `builds.diff` | `{ id, path }` | `string` | patch of one changed file |
| `devRequests.create` | `{ buildId }` | `DevRequestInfo` | writes the development request of a build that needs a change in Jig (D-119): `~/.jig/dev-requests/<build id>/files/` (README.md, SPEC.md, PROMPT.md, mockup.html, context.json) and the zip beside it |
| `devRequests.email` | `{ buildId }` | `{ info, savedTo, to }` | makes the package, copies the zip to your Downloads folder (`savedTo`, shown in Explorer/Finder) and opens a `mailto:` email to Jig's developers (`DEV_REQUEST_EMAIL`, fixed in the code) whose first line says to attach it (D-123). Refused (`not_approved`) until you confirmed the current version. `JIG_MAIL_OUT` (tests): the zip and `mailto.txt` go there and nothing opens |
| `devRequests.prompt` | `{ buildId }` | `string` | PROMPT.md, to paste into Claude Code in Jig's repository |
| `devRequests.status` | `{ buildId }` | `DevRequestStatus` | `{ approved, emailedAt?, to }`: `approved` is true when you confirmed this exact version (a revision needs confirming again) |
| `devRequests.approve` | `{ buildId }` | `DevRequestStatus` | **This is what I want**: confirms the current version |
| `builds.reviseRequest` | `{ id, feedback }` | `BuildJob` | your feedback on a development request after trying its demo: sent to the builder session, which writes a new version (`revision` + 1) |
| `learning.state` | — | `LearningState` | suggestions, recent runs, last/next run, activity stats (`docs/reference/learning.md`) |
| `learning.runNow` | — | `PatternRun` | look for patterns now; no AI call when nothing repeats; `busy` |
| `learning.answer` | `{ id, answer: "build" \| "act" \| "snooze" \| "dismiss" \| "never" }` | — | `act`: the kind's own action was taken (a profile one is written here) |
| `learning.clearActivity` | — | — | deletes the activity log |
| `learning.record` | `{ kind: "addon.action" \| "ui", text, projectId?, detail? }` | — | activity from the renderer |
| `learning.knowledge` | — | `{ profile, profileExists, profileEmpty, notes, activity }` | What Jig knows about me |
| `learning.interview` | — | `{ prompt }` | the first message of the profile interview chat (D-169) |
| `learning.setProfile` | `{ text }` | — | writes `profile.md` (schema) |
| `learning.removeNote` / `learning.clearNotes` | `{ id }` / — | — | notes from chats |
| `learning.worked` | `{ refresh? }` | `WorkedState` | "How you worked", cached an hour |
| `learning.usage` | — | `UsageSummary` | "How Claude worked for you": tools, skills, subagents, add-ons and MCP servers over 4 weeks (D-185) |
| `learning.checkIn` | `{ action: "enable" \| "decline" \| "start" \| "skip" }` | `{ prompt? }` | `start` returns the chat's first message (schema) |
| `addons.history` / `addons.rollback` | `{ id }` / `{ id, commit }` | `AddonCommit[]` / — | your add-ons only (git history of `~/.jig/addons`) |
| `addons.remove` | `{ id }` | — | your add-ons only: deletes the folder as a commit (stays in the history), keeps its stored data; a built-in it replaced comes back (schema, D-122) |
| `addons.export` | `{ id, copy?: { name }, gallerySource? }` | `string \| undefined` | shares the add-on: a `.zip` (save dialog) or, with `gallerySource`, into a folder gallery source from Settings (never a git one); with `copy`, a separate add-on with that name and an id made from it (an edited built-in must go as a copy); without `.git` and `node_modules` (schema, D-249) |
| `addons.originals` | — | `Record<id, AddonOriginInfo>` | your add-ons installed from a gallery or a `.zip`: where they came from and whether their files changed since (`modified`) (D-249) |
| `addons.restoreOriginal` | `{ id }` | — | puts one of your add-ons back as it came (from its kept original, as a commit); an edited built-in without one is removed so the built-in comes back (schema, D-249) |
| `addons.inspectPackage` | `{ path? }` | package info `\| undefined` | reads a `.zip` (open dialog without `path`): id, name, version, permissions, files, problems, `exists` (schema) |
| `addons.importPackage` | `{ path, replace? }` | `{ id, name }` | installs into `~/.jig/addons/<id>`, records it in the history, reloads (schema) |
| `addons.gallery` | `{ refresh? }` | `GallerySource[]` | the add-on gallery (D-179): each source in `addonGallery.sources` with its add-ons (id, name, version, permissions, problems, the one you have) or its error; `refresh` fetches git sources again |
| `addons.galleryInstall` | `{ source, id, replace? }` | `{ id, name }` | installs an add-on from a source in Settings (no other), like `addons.importPackage` (schema) |
| `azure.tenants` | `{ check? }` | `TenantsState` | your az login first, then the tenants added in Jig, and `active` (D-282). `check`: asks each tenant's Azure CLI (`az account show`, ARM `/tenants`) who is signed in, without a prompt, and records `signedOut` / `expired` (schema) |
| `azure.addTenant` | `{ tenant, label?, method? }` | `TenantsState` | `az login --tenant <tenant> --allow-no-subscriptions` with `AZURE_CONFIG_DIR=~/.jig/azure/<key>` and `LOGIN_ENV` (D-316): `method` `browser` (default) opens the system browser, never Windows' account window; `code` adds `--use-device-code` and the page and code arrive as a progress line (`deviceCodePrompt`). Empty `tenant` = pick when signing in. Then a check. Output as `azure.signInProgress`; one sign-in at a time. `busy`, `cancelled`, `az_missing`, `az_login_failed`; a sign-in that didn't finish leaves no folder (schema: a GUID or a domain) |
| `azure.signInAgain` | `{ key, method? }` | `TenantsState` | `az login` again in that tenant's folder (`default`: your own az login, without `--tenant`), in the browser or with a code as `azure.addTenant`; same errors (schema) |
| `azure.cancelSignIn` | — | — | stops the running `az login` (its process tree); the waiting call rejects with `cancelled` |
| `azure.renameTenant` | `{ key, label? }` | `TenantsState` | any tenant, `default` (your az login) too: it keeps its key and behaviour, only its name is stored (D-301). No `label` goes back to the first name ("Your az login", an added tenant's display name); `not_found` for an unknown key (schema) |
| `azure.removeTenant` | `{ key }` | `TenantsState` | forgets the tenant and deletes its folder (its sign-in); the active one falls back to your az login (schema) |
| `phone.state` | — | `PhoneState` | Jig on your phone (D-350): `off` / `pairing` (with `code`) / `connected` (with `owner`), the bot's name, whether the token is `remembered` (encrypted) and a connection `error`; once paired, whether it has places (`topics`: Telegram's topics on, Teams' bot in a team) and `topicsNote` saying what limits them (Teams: no team yet, or threads in General without the channel grant, D-380) |
| `phone.connect` | `{ token }` | `PhoneState` | the picked channel's credential: a @BotFather token checked with Telegram (`getMe`), or the Teams relay's `https://<relay>#<key>` checked with its `/api/health` (D-379); keeps it (encrypted) and starts pairing with a new code; `invalid_token`, `unreachable`, `unavailable` (schema: either shape) |
| `phone.test` | — | — | sends the paired phone a test message; `not_connected` |
| `phone.disconnect` | — | `PhoneState` | tells the phone, forgets the token and pairing (deletes `phone.json`); on Teams also forgets setup's record (`phone-teams-setup.json`) after Settings listed the Azure resources to delete (D-381) |
| `phone.teamsSetup` | `{ load?, installs? }` | `TeamsSetupView` | the "Set up Teams" modal's state (D-381): where the Azure pieces go, each Create step with its listed commands and status, the package's path, what the relay saw (`installs`), what to delete (`resources`); `load` reads the active tenant, its subscriptions and Flex Consumption regions with `az` (read-only), `installs` asks the relay's health. Never a secret or the key |
| `phone.teamsSetupWhere` | `{ subscription?, region?, group? }` | `TeamsSetupView` | picks where things go, before Create started (`started`); only the active tenant's subscriptions (schema: GUID, a region id, ≤ 90 characters) |
| `phone.teamsSetupCreate` | — | `TeamsSetupView` | runs the listed `az` commands in order with Jig's az for the active tenant, from the first not done; answers at once, progress as `phone.teamsSetupChanged`; a failure stops there (calling it again retries); ends by connecting the relay (pairing); `not_ready` |
| `phone.teamsSetupManual` | `{ appId, credential }` | `TeamsSetupView` | a bot and relay made in the Azure portal (`docs/guides/teams-phone.md`): the app id and `https://<host>#<key>`, connected like `phone.connect`; `invalid_token`, `unreachable` (schema) |
| `phone.teamsPackage` | — | `TeamsSetupView` | writes the Teams app package (`~/.jig/teams/jig-teams-app.zip`) and shows it in the file manager; `not_ready` before Create |
| `phone.teamsSetupForget` | — | `TeamsSetupView` | Start over: forgets setup's record (Azure is never deleted); `busy` while Create runs |
| `phone.voiceDone` | `{ id, text?, data?, error? }` | — | the window's answer to a `phone.voiceJob`: the transcript, the Ogg voice message (base64) or the error |
| `phone.open` | `{ sessionId }` | — | opens a chat as a room on the phone: a topic of its own, mirrored live, where you write to it (D-350); on Teams the chat's thread in its project's channel starts following it (D-380); `not_connected`, `no_topics`, `unavailable` |
| `azure.setActiveTenant` | `{ key }` | `TenantsState` | sets `azure.activeTenant` (`default` → empty); the renderer may also change the setting directly (schema) |
| `speech.models` | — | `SpeechModelStatus[]` | the dictation models (tiny, base, small): downloaded or not, for which `variants` (`gpu`, `cpu`), bytes on disk (D-208, D-209) |
| `speech.removeModel` | `{ model }` | — | deletes a downloaded model from `~/.jig/models` (schema: one of Jig's models) |
| `speech.voiceModel` | — | `VoiceModelStatus` | the natural voice's model: `downloaded`, bytes on disk (D-243) |
| `speech.prepareVoice` | `{ voice }` | — | downloads what the voice lacks (model, the voice's style file) and loads it in the voice process (schema: a known voice) |
| `speech.say` | `{ text, voice, speed }` | `Float32Array` | `text` read by a natural voice: 24 kHz mono audio (schema: known voice, text ≤ 20 000, speed 0.5–2) |
| `speech.sayParts` | `{ id, text, voice, speed }` | `{ parts }` | the same piece by piece (D-411): each piece as a `speech.part` event with the caller's `id`, to the calling window only, as soon as it is made; resolves with the number of pieces once all are made (schema as `speech.say`, `id` a whole number ≥ 0) |
| `speech.removeVoiceModel` | — | — | stops the voice process and deletes its model |
| `speech.microphone` | — | `MicrophoneAccess` | `granted`, `denied` or `unknown`; asks macOS for access the first time, reads Windows' privacy switch |

## Events

| Topic | Payload | When |
|---|---|---|
| `config.changed` | `JigConfig` | after any settings change |
| `themes.changed` | — | a theme was installed/removed or a file in `~/.jig/themes` changed |
| `layout.changed` | `Layout` | the host changed the layout (e.g. an accepted level-1 build) |
| `projects.changed` | `ProjectsState` | after any project change |
| `quit.ask` | `{ purpose: "quit" \| "update", reasons: QuitReason[] }` | Jig was about to quit and a quit guard asks first (D-343); only the workbench window gets it. `QuitReason` is `{ key, source, icon?, message, detail?, actions: [{ id, label }] }` (`shared/quit.ts`) |
| `notify` | `{ title, message?, tone?, timeout?, addonId?, actions? }` | a host notification, shown as a toast; from an add-on's host code, `actions` (`{ label } & AddonTarget`) become buttons that open that add-on's view/tab, call its host, open a URL or preview a file |
| `sessions.update` | `{ sessionId, updates: ChatUpdate[] }` | transcript/metadata/queue changes of a session |
| `attempts.changed` | `AttemptRun` | a run started, was judged, kept or discarded |
| `sessions.reveal` | `{ sessionId }` | show this chat (its desktop notification was clicked) |
| `terminals.data` | `{ id, data }` | terminal output (batched) |
| `terminals.changed` | `TerminalInfo[]` | a terminal was created, renamed, exited or closed |
| `terminals.reveal` | `{ id }` | show this terminal (Claude started it from a chat) |
| `codex.signIn` | `{ loggedIn, method? }` | the Codex sign-in terminal ended: whether Codex is signed in now and how (never who or a key); its terminal was closed if so (D-294) |
| `claude.signIn` | `{ loggedIn, method? }` | the sign-in terminal ended: whether Claude Code is signed in now and how (never who); its terminal was closed if so (D-126) |
| `routines.changed` | — | routines changed (from the tab or a chat): reload when shown |
| `userBrowser.state` | `UserBrowserState` | owner window only: URL, title, loading, history and load error |
| `userBrowser.address` | — | owner window only: native Ctrl/Cmd+L focuses its address field |
| `browser.pages` | `BrowserPageInfo[]` | a page opened, closed, loaded, navigated, was resized, logged an error or started/stopped being driven |
| `browser.frame` | `{ chatId, data, width, height }` | a JPEG of a chat's page (base64), only while a view watches that page |
| `browser.reveal` | `{ chatId }` | a chat opened a new page (not on later calls on it, D-410): show the browser view |
| `scripts.changed` | `ProjectScripts` | a project's script groups changed, or its scripts did (files added, removed, renamed; watched from the first `scripts.list`, D-238) |
| `addons.changed` | `AddonInfo[]` | an add-on was added, changed, switched on/off or failed to build |
| `addons.event` | `{ id, topic, payload }` | an add-on's host code called `api.emit` |
| `addons.badges` | `Record<string, string>` | the add-on views' badges changed |
| `addons.jigEvent` | `{ name, payload }` | something happened that add-ons follow (`JIG_EVENTS`: chat finished/needs you/failed, commit, branch switch, active project, Azure tenant; D-215) |
| `phone.voiceJob` | `{ id, kind, data }` | a voice message needs the window: `transcribe` (Ogg, base64) with Whisper or `speak` a text with the natural voice into Ogg Opus; answered with `phone.voiceDone` |
| `phone.changed` | `PhoneState` | pairing finished, a new code, connected/disconnected, the channel (Telegram or the Teams relay) became (un)reachable, or anything else in `PhoneState` changed (Teams: the team or its channel grant, `topics` / `topicsNote`) |
| `phone.teamsSetupChanged` | `TeamsSetupView` | the "Set up Teams" modal's state changed while Create runs (a step started, finished or failed) or the relay saw the app added (D-381); never a secret or the key |
| `azure.tenantChanged` | `TenantsState` | a tenant was added, checked, renamed or removed, or another became active (then add-ons also get `azure.tenant`, D-282) |
| `azure.signInProgress` | `{ key, text, done? }` | a line of `az login`'s output (WARNING lines left out; never tokens: `--output none`), then `done` |
| `usage.changed` | `UsageByProvider` | either provider's usage refreshed, or Claude Code reported a rate limit |
| `speech.progress` | `{ model, loaded, total }` | a dictation model, or the natural voice (`model: "voice"`), is downloading (bytes; at most every 150 ms) |
| `speech.part` | `{ id, index, audio }` | a piece of `speech.sayParts`' audio (24 kHz mono `Float32Array`, `index` from 0) was made; sent only to the window that asked (D-411) |
| `builds.changed` | `BuildJob[]` | a build started, changed status or was accepted/discarded |
| `worktrees.changed` | `WorktreeChat[]` | a worktree chat was started or removed |
| `learning.changed` | `LearningState` | a run started/finished, a suggestion was answered, activity deleted, the check-in setting changed |
| `learning.knowledgeChanged` | — | the profile or the notes changed |

`engine.models` (no arguments) returns `ModelInfo[]` from a short-lived, prompt-free Claude Code SDK `supportedModels` control request. It creates no chat and sends no AI prompt. Settings uses it for model pickers.

### Skills library (D-205)

| Method | Arguments | Result |
|---|---|---|
| `skills.list` | — | `LibrarySkill[]`: id, title, category, description, native skill name, source, author, revision, licence |
| `skills.details` | `{ id }` | `SkillDetails`: catalog metadata and entrypoint instructions; unknown ids rejected |

Controls use `config.update` / `config.changed` with skills.overrides; no arbitrary paths or code
can be installed through these methods. The details id is validated at the IPC boundary.

## Meetings (D-217)

Production media uses an ephemeral loopback origin (D-222), because ACS rejects `jig-app:`.
The IPC router grants that origin only to the registered meeting window's main frame and entry
page, not arbitrary localhost pages/windows. Closing the room revokes this grant and its server.

All methods are typed in shared/ipc.ts; argument-bearing methods have validate.ts schemas.

| Method | Purpose |
|---|---|
| meetings.open | `{tab?: calendar\|chats\|meetings, select?}` or nothing: open/focus the Meetings window (on that tab, and meeting), with the call window waiting hidden beside it (D-292, D-403) |
| meetings.startChat | `{projectId, draft}`: from a Meetings window; the main window opens a chat with `draft` in its composer (D-403) |
| meetings.start | Lobby or call window: `{kind: "join", url, title}` (empty url asks for a link) / `{kind: "call", peerId, peerName, camera}` / `{kind: "show"}`: reveal the call window and have it check devices and join, place the call, or only come forward (D-292) |
| meetings.takeStart | Call window only: what `meetings.start` asked for, once (null when nothing) |
| meetings.callIdle | Call window only: nothing to show (no call, prejoin or ringing); main hides it unless a call is active or a start waits |
| meetings.overview | Global nonsecret settings/account, active id and saved meeting records |
| meetings.configure | Save tenant/client/ACS endpoint; lobby or room, no active call |
| meetings.delete | Delete a saved meeting and its frozen question/notes snapshots; room or main window (meeting history, D-250), never the live one |
| meetings.history | Past meetings newest first, without the live one (the Meetings window's Meetings tab, D-250, D-403) |
| meetings.folders | Your meeting history folders [{id, name}] (D-295); series folders are worked out from the meetings |
| meetings.saveFolder | `{id?, name}`: makes a folder, or renames one; names are unique ignoring case. Jig's windows |
| meetings.deleteFolder | `{id}`: deletes a folder; its meetings go back to their series' folder or to none. Jig's windows |
| meetings.moveToFolder | `{ids, place}`: `place` is a folder id, `none` (out of every folder) or `auto` (back to its series). Jig's windows |
| meetings.mentions | Meetings matching `{query}` for the chat's `@` picker, each with its `@meeting:<name>-<8 hex>` mention |
| meetings.chatMentions | Teams chats matching `{query}` (after `chat:` / `chat `) for the chat's `@` picker, from the list main read last: `[{id (8 hex), name, kind, peerId?, at, mention}]`, `mention` = `@chat:<name>-<8 hex>`; empty while Meetings is off or Microsoft/Chat.Read isn't there (D-333) |
| meetings.rename | `{id, title}`: rename a meeting; room or main window |
| meetings.markdown / meetings.export | A meeting as Markdown (notes, actions, transcript by speaker) / saved through a save dialog (returns the file or nothing) |
| meetings.layout | Save where the live room's People, Transcript and Notes sit (left/right/bottom, hidden), the remembered sizes and whether the history shows its transcript; lobby or room (D-221, D-292, D-406) |
| meetings.lobbyView | Save Agenda/Week preference; lobby or room |
| meetings.signIn / meetings.signOut | External browser sign-in / clear protected MSAL cache; lobby or room |
| meetings.calendar | Next 14 days of default calendar; separate delegated consent |
| meetings.join | Validate Teams link, create global record; room only, one active call |
| meetings.credential | Memory-only renewable calling token, plus `self` (your Teams id and name, to name your own captions, D-383); owned room sender only |
| meetings.aiTranslation | Claude translates the meeting's finished captions into `language` (`""` stops), when Teams can't (no Teams Premium; D-277), in batches, skipping lines that waited too long (D-384); needs `meetings.aiTranslation` on; room only |
| meetings.devices | The microphone, speakers and camera picked for meetings ({kind?: {id, name}}, a missing kind = System default), remembered for the next one (D-323); room only |
| meetings.captionLanguage | The language live captions are shown in (`""` = as spoken), remembered; Teams translates (D-260); room only |
| meetings.chat | Room only: reads the active meeting's or call's Teams chat (Graph Chat.Read) into its record; `{state: ok/consent/unavailable, error?}` (D-270) |
| meetings.chatSend | Room only: writes in that chat as you (Graph ChatMessage.Send) |
| meetings.chatConnect | Lobby or room: asks Microsoft for the chat permissions (browser sign-in) |
| meetings.chats | Lobby or room: your 50 newest Teams chats (`TeamsChatSummary`: id, kind, name, peerId?, members?, preview?, at, unread) with `{state, error?}`, plus pinned chats outside them (up to 10, D-332); Chat.Read, no new consent (D-296) |
| meetings.chatThread | `{chatId}` (a Teams chat id, `TEAMS_CHAT_ID`): the chat's newest 50 messages, not kept; marks it read in Jig; lobby or room |
| meetings.chatThreadSend | `{chatId, text}`: write in that chat as you (ChatMessage.Send); returns the sent message; lobby or room |
| meetings.chatWith | `{peerId}`: your one-to-one chat id with someone, if you have one (starting one is `meetings.chatCreate`); `{state, chatId?}`; lobby or room |
| meetings.chatPin | `{chatId, pinned}`: pins (added last) or unpins a chat in Jig's Chats; returns the pins; kept in meetings.json, not synced with Teams; emits `meetings.changed`; lobby or room (D-332) |
| meetings.chatSearch | `{query}` (2–200 characters): messages in your chats found by Microsoft Search (`POST /search/query`, chatMessage, 25 hits) with Chat.Read: `{state, hits: [{chatId, messageId, from, at, text}], error?}`; channel posts left out; lobby or room (D-332) |
| meetings.chatCreateReady | Whether Jig may start chats (a Chat.ReadWrite or Chat.Create token, silently): `{state: ok/consent/unavailable}`; lobby or room (D-332) |
| meetings.chatCreateConnect | Asks Microsoft to let Jig start chats (Chat.Create; opens the browser); lobby or room (D-332) |
| meetings.chatCreate | `{people: [{id, name}] (1–50), topic?, text}`: opens your one-to-one chat with one person if you have one, else starts the chat (`POST /chats`, oneOnOne or group with its name) and sends `text` (ChatMessage.Send); `{chat: {id, name, kind, peerId?}, existed}`; `meeting_chat_create_consent` until approved; lobby or room (D-332) |
| meetings.chatImage | `{chatId, messageId, contentId}`: a picture in a Teams message, read by main from Graph's hosted content (Chat.Read) and returned as a data URL (PNG/JPEG/GIF/WebP, ≤ 10 MB, cached in memory up to 64 MB) or null; lobby or room (D-328) |
| meetings.presence | `{ids}` (Entra object ids, ≤ 650): people's Teams status `{state: ok/consent/unavailable, presence: {id: {availability, activity}}}`, read by main with Presence.Read.All silently (30 s reuse); refused or failed = no presence, not an error; lobby or room (D-329) |
| meetings.presenceConnect | Asks Microsoft to let Jig read people's Teams status (Presence.Read.All; opens the browser); lobby or room (D-329) |
| meetings.openChatFile | `{url}` (https only): opens a file or link shared in a Teams chat in the browser; lobby or room (D-328) |
| meetings.photo | Someone's Microsoft profile picture (48×48 data URL) or null, by Teams id, object id or `local`; silent sign-in only, cached per run (D-263) |
| people.photo | The same by e-mail / user principal name `{ email }`, for add-ons (`ctx.people.photo`, `PersonAvatar`; D-291); null without Meetings on or its sign-in (no request then), after a refused people token for 10 minutes, or for anything not e-mail-shaped; cached per run |
| meetings.people | People to call (D-254): `/me/people` suggestions or a directory search (Graph User.ReadBasic.All, People.Read); lobby or room |
| meetings.startCall | Create the global record of a one-to-one Teams call (`{ peerId, peerName, direction }`); room only, one active call |
| meetings.setRinging | Turn ringing for Teams calls in Jig on or off; lobby or room |
| meetings.incoming | A call rings (`name`) or stopped ringing: brings the room to the front with a system notification; room only |
| meetings.caption / meetings.status | Persist live caption revisions/lifecycle/gaps; owned active room only. A caption may carry `source: "local"` (transcribed on this computer, D-321); main logs each status change to `main.log`, with `detail` (the caption capability and try, D-382) that only the log gets |
| meetings.shareSources / meetings.selectShare | Room-only screen/window picker; one-use 30-second source grant; the granted source gets a frame (D-266) |
| meetings.shareStopped | Room-only: sharing ended, remove the frame around the shared screen/window |
| meetings.ask / meetings.notes | Frozen transcript + normal Plan-mode Claude Code question/notes chat; ask from the lobby or room, notes also from the main window |
| meetings.revealChat | Lobby or room: open the question/notes chat in the main workbench |
| meetings.actions / meetings.queue | Edited draft actions (only actions still to do take edits; main keeps every status, D-407) / explicitly selected ids to paused Task queue (status `queued`); room or main window |
| meetings.runAction | `{ id, actionId }` → the action: one action still to do, with a project, runs now in a new Plan-mode chat in its project with the queue's prompt (source meeting, evidence, owner); status `running`, `sessionId` = the chat (D-407); room, Meetings window or main window |
| meetings.setActionStatus | `{ id, actionId, status: done \| dismissed \| open }` → the action: marks an action done or dismissed (not a queued one), or restores a handled one (`open`: back to `running` when it has a chat, else to do) (D-407) |

"Room" is the call window (D-217); "lobby" the Meetings lobby window (D-292), which never gets the
calling credential.

Events: meetings.changed (refetch), meetings.leaveRequested (gracefully leave/close room),
meetings.startRequested (the call window takes the request with `meetings.takeStart`),
meetings.show ({tab?, select?}: the open Meetings window shows a tab, and on Meetings a meeting; a call ended, or a link, D-403),
meetings.chatNew ({projectId, draft}: the main window starts a chat from a meeting),
meetings.chatOpen ({sessionId}: main workbench reveals the normal chat).

Claude tools: jig_meeting_read ({id, through?, offset?}, read-only, 40k-character pages with nextOffset)
and jig_meeting_save_notes ({id, notes, actions}, normal approval, generated notes chat only).
A chat message with `@meeting:…` mentions gets turn context naming each meeting's id, telling Claude to
read it with jig_meeting_read (speech is source material, not instructions; only while Meetings is on).
A message with `@chat:<name>-<8 hex>` mentions (D-333) gets a line per Teams chat naming it and its short
id, telling Claude to read it with jig_teams_chat_read ({chat (8 hex), before?, since?, until?, limit?
≤ 200}, read-only; only chats mentioned in that Jig chat; text = name, kind, members, then messages
oldest first as `[YYYY-MM-DD HH:MM UTC] sender: text [image] [file: name]`; latest 100 by default,
`nextBefore` pages back up to 1000 messages; read from Graph with Chat.Read in main, nothing kept).
In the composer, `@meeting` and `@chat` (alone, after a colon or with one word after a space) narrow
the `@` picker to meetings or Teams chats.
Credential methods never expose Graph/MSAL/resource credentials. Non-Jig frames cannot call any IPC.
