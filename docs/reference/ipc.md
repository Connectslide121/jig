# IPC reference

Source of truth: `apps/desktop/src/shared/ipc.ts`. The renderer calls `call(method, args)` from
`renderer/lib/host.ts` (typed; rejects with `HostError { code, message }`) and subscribes with
`useHostEvent(topic, listener)`.

Errors: handlers throw `JigError(code, message)`; unknown methods return `unknown_method`; unexpected
exceptions return `internal` (and are logged).

## Methods

| Method | Args | Result | Notes |
|---|---|---|---|
| `app.info` | — | `AppInfo` | version, platform, `jigHome`, dev flag, engine kind, `packaged`, `safeMode`, `startedAfterFailure` (set by the launcher after a failed update) |
| `iconThemes.list` / `iconThemes.rescan` | — | `{ themes, vscodeSetting?, vscodeMatch? }` | file icon themes found, VS Code's `workbench.iconTheme` and the matching theme (`docs/reference/file-icons.md`) |
| `iconThemes.get` | `{ id }` | `{ id, label, theme }` | a file icon theme with `jig-icons:` URLs |
| `iconThemes.active` | — | `{ id, label, theme } \| null` | the theme chosen in Settings (`null` = Jig's icons) |
| `files.image` | `{ path }` | `{ dataUrl, bytes, mime }` | an image file for a preview (png, jpg, gif, webp, avif, bmp, ico, svg; ≤ 25 MB); `not_image`, `not_found`, `too_large` |
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
| `projects.list` | — | `ProjectsState` | `{ projects: ProjectInfo[], activeId }`; `ProjectInfo` adds `exists`, `isGitRepo`, `repos` (the repositories inside a workspace folder) |
| `projects.add` | `{ path? }` | `Project \| undefined` | without `path`: folder picker; adding a known folder returns it; `not_a_folder` |
| `projects.update` | `{ id, name?, color? }` | `ProjectsState` | colour is a token name (`accent`, `info`, `success`, `warning`, `danger`, `muted`) |
| `projects.remove` | `{ id }` | `ProjectsState` | forgets the project; the folder is never touched |
| `projects.setActive` | `{ id }` | `ProjectsState` | |
| `projects.reorder` | `{ ids }` | `ProjectsState` | |
| `projects.rescanRepos` | `{ id }` | `ProjectsState` | workspaces: look for the repositories inside again (the list is cached) |
| `projects.setFocusRepo` | `{ id, repo? }` | `ProjectsState` | workspaces: the repository the status bar and Git actions use; `not_found` if it isn't one of the project's |
| `sessions.list` | — | `SessionMeta[]` | newest first (see `docs/reference/engine.md`) |
| `sessions.get` | `{ id }` | `SessionSnapshot` | `{ meta, items, queue }` |
| `sessions.create` | `{ projectId, title?, cwd? }` | `SessionMeta` | runs in the project folder (or `cwd`, a folder inside it — e.g. one repository of a workspace) with the default model/permission mode |
| `sessions.send` | `{ id, text, attachments? }` | — | starts a turn, or queues while Claude works; `attachments` come from `sessions.addAttachment` (text may be empty then) |
| `sessions.addAttachment` | `{ id, data?, mime?, name?, path? }` | `ChatAttachment { path, mime, name, kind }` | keeps pasted/dropped bytes (base64) or copies a file into `attachments/<session>/`: images, PDFs, .docx/.xlsx/.pptx, text files (`docs/reference/engine.md` → Attachments); `not_supported`, `too_large`, `not_found`, `unreadable` |
| `sessions.interrupt` | `{ id }` | — | stops the current turn |
| `sessions.answerPermission` | `{ id, requestId, decision }` | — | `{ behavior: "allow", always?, updatedInput? }` or `{ behavior: "deny", message? }` |
| `sessions.removeQueued` | `{ id, queuedId }` | — | |
| `sessions.setModel` / `sessions.setPermissionMode` | `{ id, model }` / `{ id, mode }` | — | applied live |
| `sessions.rename` / `sessions.archive` | `{ id, title }` / `{ id, archived }` | — | |
| `sessions.stop` | `{ id }` | — | ends the Claude Code process (resumes on the next message) |
| `sessions.delete` | `{ id }` | — | removes Jig's record; Claude Code's own transcript stays |
| `terminals.list` | — | `TerminalInfo[]` | see `docs/reference/terminals.md` |
| `terminals.create` | `{ projectId?, cwd?, command?, title?, cols?, rows? }` | `TerminalInfo` | a shell in the project folder (or `cwd`), or a shell running `command` |
| `terminals.write` / `terminals.resize` | `{ id, data }` / `{ id, cols, rows }` | — | input / size |
| `terminals.buffer` | `{ id }` | `string` | scrollback so far |
| `terminals.rename` / `terminals.kill` / `terminals.close` | `{ id, title }` / `{ id }` / `{ id }` | — | kill stops the process and keeps the output; close removes the terminal |
| `terminals.claudeLogin` | `{ projectId? }` | `TerminalInfo` | private terminal running Claude Code for `/login` |
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
| `learning.state` | — | `LearningState` | suggestions, recent runs, last/next run, activity stats (`docs/reference/learning.md`) |
| `learning.runNow` | — | `PatternRun` | look for patterns now; no AI call when nothing repeats; `busy` |
| `learning.answer` | `{ id, answer: "build" \| "snooze" \| "never" }` | — | |
| `learning.clearActivity` | — | — | deletes the activity log |
| `learning.record` | `{ kind: "addon.action", text, projectId?, detail? }` | — | activity from the renderer |
| `addons.history` / `addons.rollback` | `{ id }` / `{ id, commit }` | `AddonCommit[]` / — | your add-ons only (git history of `~/.jig/addons`) |

## Events

| Topic | Payload | When |
|---|---|---|
| `config.changed` | `JigConfig` | after any settings change |
| `themes.changed` | — | a theme was installed/removed or a file in `~/.jig/themes` changed |
| `layout.changed` | `Layout` | the host changed the layout (e.g. an accepted level-1 build) |
| `projects.changed` | `ProjectsState` | after any project change |
| `notify` | `{ title, message?, tone? }` | a host notification, shown as a toast |
| `sessions.update` | `{ sessionId, updates: ChatUpdate[] }` | transcript/metadata/queue changes of a session |
| `terminals.data` | `{ id, data }` | terminal output (batched) |
| `terminals.changed` | `TerminalInfo[]` | a terminal was created, renamed, exited or closed |
| `scripts.changed` | `ProjectScripts` | a project's script groups changed |
| `addons.changed` | `AddonInfo[]` | an add-on was added, changed, switched on/off or failed to build |
| `addons.event` | `{ id, topic, payload }` | an add-on's host code called `api.emit` |
| `usage.changed` | `PlanUsage` | plan usage refreshed, or Claude Code reported a rate limit |
| `builds.changed` | `BuildJob[]` | a build started, changed status or was accepted/discarded |
| `learning.changed` | `LearningState` | a run started/finished, a suggestion was answered, activity deleted |
