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
| `app.info` | — | `AppInfo` | version, platform, `jigHome`, dev flag, engine kind, `packaged`, `safeMode`, `startedAfterFailure` (set by the launcher after a failed update) |
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
| `files.stat` | `{ path }` | `{ size, mtimeMs } \| null` | the Preview tab polls it to follow edits |
| `files.write` | `{ path, text, expectedMtimeMs? }` | `{ size, mtimeMs }` | the Preview editor saves: only inside a workspace or a file opened in Preview this run; with `expectedMtimeMs`, `changed` when the file changed on disk since; written next to the file and renamed over it. Errors `not_allowed`, `not_a_file`, `changed`, `write_failed` |
| `ai.ask` | `{ addonId, prompt, cwd? }` | `string` | an add-on with the `ai` permission asks Claude a one-shot question (no tools) through Claude Code (`main/ai`) |
| `sessions.fork` | `{ id }` | `SessionMeta` | a new chat continuing this one as a branch (Claude Code's fork; transcript copied) |
| `sessions.saved` | — | `SavedClaudeSession[]` | the conversations Claude Code saved on this computer, newest first; `chatId` when one is already a Jig chat (D-150) |
| `sessions.openSaved` | `{ sessionId }` | `SessionMeta` | opens one as a chat in No project with its history; its first message continues it as a copy (validated id; folder and title from Claude Code's list) |
| `sessions.rewindFiles` | `{ id, itemId, dryRun }` | `RewindResult` | restore files Claude changed since a user message (file checkpoints); `dryRun` only reports |
| `usage.get` / `usage.refresh` | — | `PlanUsage` | your Claude plan usage (5-hour and weekly windows) from Claude Code (`docs/reference/usage.md`) |
| `setup.check` | — | `SetupCheck[]` | first-run checks (`docs/reference/setup.md`) |
| `updates.check` | — | `UpdateInfo` | git clone: commits behind upstream; installed: latest GitHub release |
| `updates.apply` | — | `{ restarting }` | pull + build + restart, or open the release page; `update_failed`, `no_source` |
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
| `projects.create` | `{ name, path, color?, model?, effort?, permissionMode?, instructions?, starters? }` | `Project` | a new project with `path` as its default workspace (added if new); it becomes active |
| `projects.update` | `{ id, name?, color?, path?, model?, effort?, permissionMode?, instructions?, starters? }` | `ProjectsState` | an empty string or list clears a preference; a new `path` is added as a workspace and clears the default repository. Colour is a token name (`accent`, `info`, `success`, `warning`, `danger`, `muted`) |
| `projects.remove` | `{ id }` | `ProjectsState` | forgets the project; its chats move to "No project"; folders are never touched |
| `workspaces.add` | `{ path? }` | `Workspace \| undefined` | adds a folder (folder picker without `path`); an added folder is returned as it is |
| `workspaces.remove` | `{ id }` | `ProjectsState` | forgets a folder; `in_use` while a project has it as its default workspace |
| `projects.setActive` | `{ id }` | `ProjectsState` | |
| `projects.reorder` | `{ ids }` | `ProjectsState` | |
| `projects.rescanRepos` | `{ id }` | `ProjectsState` | a project's or workspace's (by id) folder: look for the repositories inside again (the list is cached) |
| `projects.setFocusRepo` | `{ id, repo? }` | `ProjectsState` | the project's default Git repository (status bar, Git actions, Git panel); `not_found` if it isn't one of its workspace's |
| `sessions.list` | — | `SessionMeta[]` | newest first (see `docs/reference/engine.md`) |
| `sessions.get` | `{ id }` | `SessionSnapshot` | `{ meta, items, queue }` |
| `sessions.create` | `{ projectId?, title?, cwd? }` | `SessionMeta` | a chat in a project or none. Runs in `cwd` (any folder) or the project's default workspace; without a project `cwd` is required. Model, effort and permission mode: the project's defaults, else Jig's |
| `sessions.setProject` | `{ id, projectId? }` | — | puts a chat in a project, moves it, or takes it out |
| `sessions.setPinned` | `{ id, pinned }` | — | pinned chats stay at the top of their project |
| `links.azure` | `{ group?, subscription? }` | `{ items: AzureItem[], problems: string[] }` | the resource groups of every enabled subscription the user's own `az` login sees, in every tenant (`az account list --all`, then `az group list --subscription`, 4 at a time; each item names its subscription), or one group's resources in its subscription (`az resource list -g`), as portal links with a guessed type; a subscription that can't be read is a line in `problems`; `az_missing`, `az_login`, `az_failed` |
| `sessions.addAttachment` | `{ id, data?, mime?, name?, path? }` | `ChatAttachment { path, mime, name, kind }` | keeps pasted/dropped bytes (base64) or copies a file into `attachments/<session>/`: images, PDFs, .docx/.xlsx/.pptx, text files (`docs/reference/engine.md` → Attachments); `not_supported`, `too_large`, `not_found`, `unreadable` |
| `sessions.interrupt` | `{ id }` | — | stops the current turn |
| `sessions.answerPermission` | `{ id, requestId, decision }` | — | `{ behavior: "allow", always?, updatedInput? }` or `{ behavior: "deny", message? }` |
| `sessions.removeQueued` | `{ id, queuedId }` | — | |
| `sessions.setModel` / `sessions.setPermissionMode` | `{ id, model }` / `{ id, mode }` | — | applied live |
| `sessions.rename` / `sessions.archive` | `{ id, title }` / `{ id, archived }` | — | |
| `sessions.stop` | `{ id }` | — | ends the Claude Code process (resumes on the next message) |
| `sessions.delete` | `{ id }` | — | removes Jig's record; Claude Code's own transcript stays |
| `sessions.send` | `{ id, text, attachments?, now? }` | — | sends, or queues while Claude works; `now` joins the running turn instead |
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
| `artifacts.fromChats` | — | `ChatArtifact[]` | artifacts your chats published, from the transcripts (`docs/reference/artifacts.md`) |
| `artifacts.list` | `{ refresh? }` | `{ at, artifacts: RemoteArtifact[] }` | your claude.ai artifacts via Claude Code's Artifact tool (cached 5 min) |
| `artifacts.fetch` | `{ url }` | `{ path }` | reads a claude.ai artifact through Claude Code into `~/.jig/cache/artifacts/` for Preview |
| `terminals.list` | — | `TerminalInfo[]` | see `docs/reference/terminals.md` |
| `terminals.create` | `{ projectId?, cwd?, command?, title?, cols?, rows? }` | `TerminalInfo` | a shell in the project folder (or `cwd`), or a shell running `command` |
| `terminals.write` / `terminals.resize` | `{ id, data }` / `{ id, cols, rows }` | — | input / size |
| `terminals.buffer` | `{ id }` | `string` | scrollback so far |
| `terminals.rename` / `terminals.kill` / `terminals.close` | `{ id, title }` / `{ id }` / `{ id }` | — | kill stops the process and keeps the output; close removes the terminal |
| `terminals.claudeLogin` | `{ projectId? }` | `TerminalInfo` | private terminal running Claude Code's sign-in (`claude auth login`); when it ends, `claude.signIn` |
| `browser.state` | — | `BrowserState` | Claude's browser: open, url, title, loading, back/forward, size, error count (`docs/reference/browser.md`) |
| `browser.watch` | `{ on }` | — | start/stop `browser.frame` events for a view |
| `browser.navigate` | `{ url? , action? }` | `BrowserState` | open a URL (http, https, file), or `back` / `forward` / `reload` |
| `browser.input` | `BrowserInput` | — | mouse, wheel, key or text from the live view, in page pixels |
| `browser.resize` | `{ width, height }` | `BrowserState` | 200–4000 px |
| `browser.console` | `{ clear? }` | `ConsoleEntry[]` | console messages and load errors |
| `browser.network` | `{ clear? }` | `NetworkEntry[]` | the page's requests, credentials redacted |
| `browser.networkDetail` | `{ id }` | `NetworkEntry & { body?, bodyNote? }` | one request with its response body |
| `browser.close` | — | — | closes the page |
| `scripts.list` | `{ projectId }` | `ProjectScripts` | discovered scripts + saved groups |
| `scripts.run` / `scripts.stop` / `scripts.restart` | `{ projectId, scriptId }` | `TerminalInfo` / — / `TerminalInfo` | |
| `scripts.saveGroup` | `{ projectId, group: { id?, name, scriptIds } }` | `ProjectScripts` | create or update |
| `scripts.deleteGroup` / `scripts.runGroup` | `{ projectId, groupId }` | `ProjectScripts` / `TerminalInfo[]` | |
| `addons.list` | — | `AddonInfo[]` | every add-on with manifest, errors, warnings, UI/CSS urls (`docs/reference/addon-api.md`) |
| `addons.setEnabled` | `{ id, enabled }` | — | remembered in `addons-state.json` |
| `addons.call` | `{ id, method, args? }` | `unknown` | calls a `host.ts` export; `disabled`, `no_host`, `addon_error` |
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
| `learning.record` | `{ kind: "addon.action", text, projectId?, detail? }` | — | activity from the renderer |
| `learning.knowledge` | — | `{ profile, profileExists, notes, activity }` | What Jig knows about me |
| `learning.setProfile` | `{ text }` | — | writes `profile.md` (schema) |
| `learning.removeNote` / `learning.clearNotes` | `{ id }` / — | — | notes from chats |
| `learning.worked` | `{ refresh? }` | `WorkedState` | "How you worked", cached an hour |
| `learning.checkIn` | `{ action: "enable" \| "decline" \| "start" \| "skip" }` | `{ prompt? }` | `start` returns the chat's first message (schema) |
| `addons.history` / `addons.rollback` | `{ id }` / `{ id, commit }` | `AddonCommit[]` / — | your add-ons only (git history of `~/.jig/addons`) |
| `addons.remove` | `{ id }` | — | your add-ons only: deletes the folder as a commit (stays in the history), keeps its stored data; a built-in it replaced comes back (schema, D-122) |
| `addons.export` | `{ id }` | `string \| undefined` | saves the add-on as a `.zip` (save dialog); without `.git` and `node_modules` |
| `addons.inspectPackage` | `{ path? }` | package info `\| undefined` | reads a `.zip` (open dialog without `path`): id, name, version, permissions, files, problems, `exists` (schema) |
| `addons.importPackage` | `{ path, replace? }` | `{ id, name }` | installs into `~/.jig/addons/<id>`, records it in the history, reloads (schema) |

## Events

| Topic | Payload | When |
|---|---|---|
| `config.changed` | `JigConfig` | after any settings change |
| `themes.changed` | — | a theme was installed/removed or a file in `~/.jig/themes` changed |
| `layout.changed` | `Layout` | the host changed the layout (e.g. an accepted level-1 build) |
| `projects.changed` | `ProjectsState` | after any project change |
| `notify` | `{ title, message?, tone? }` | a host notification, shown as a toast |
| `sessions.update` | `{ sessionId, updates: ChatUpdate[] }` | transcript/metadata/queue changes of a session |
| `attempts.changed` | `AttemptRun` | a run started, was judged, kept or discarded |
| `sessions.reveal` | `{ sessionId }` | show this chat (its desktop notification was clicked) |
| `terminals.data` | `{ id, data }` | terminal output (batched) |
| `terminals.changed` | `TerminalInfo[]` | a terminal was created, renamed, exited or closed |
| `terminals.reveal` | `{ id }` | show this terminal (Claude started it from a chat) |
| `claude.signIn` | `{ loggedIn, method? }` | the sign-in terminal ended: whether Claude Code is signed in now and how (never who); its terminal was closed if so (D-126) |
| `routines.changed` | — | routines changed (from the tab or a chat): reload when shown |
| `browser.state` | `BrowserState` | Claude's browser loaded, navigated, resized or logged an error |
| `browser.frame` | `{ data, width, height }` | a JPEG of the page (base64), only while a view watches |
| `browser.reveal` | — | Claude opened a page: show the Claude's browser view |
| `scripts.changed` | `ProjectScripts` | a project's script groups changed |
| `addons.changed` | `AddonInfo[]` | an add-on was added, changed, switched on/off or failed to build |
| `addons.event` | `{ id, topic, payload }` | an add-on's host code called `api.emit` |
| `usage.changed` | `PlanUsage` | plan usage refreshed, or Claude Code reported a rate limit |
| `builds.changed` | `BuildJob[]` | a build started, changed status or was accepted/discarded |
| `worktrees.changed` | `WorktreeChat[]` | a worktree chat was started or removed |
| `learning.changed` | `LearningState` | a run started/finished, a suggestion was answered, activity deleted, the check-in setting changed |
| `learning.knowledgeChanged` | — | the profile or the notes changed |

`engine.models` (no arguments) returns `ModelInfo[]` from a short-lived, prompt-free Claude Code SDK `supportedModels` control request. It creates no chat and sends no AI prompt. Settings uses it for model pickers.
