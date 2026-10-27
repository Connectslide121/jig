# IPC reference

Source of truth: `apps/desktop/src/shared/ipc.ts`. The renderer calls `call(method, args)` from
`renderer/lib/host.ts` (typed; rejects with `HostError { code, message }`) and subscribes with
`useHostEvent(topic, listener)`.

Errors: handlers throw `JigError(code, message)`; unknown methods return `unknown_method`; unexpected
exceptions return `internal` (and are logged).

## Methods

| Method | Args | Result | Notes |
|---|---|---|---|
| `app.info` | — | `AppInfo` | version, platform, `jigHome`, dev flag, engine kind |
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
| `projects.list` | — | `ProjectsState` | `{ projects: ProjectInfo[], activeId }`; `ProjectInfo` adds `exists`, `isGitRepo` |
| `projects.add` | `{ path? }` | `Project \| undefined` | without `path`: folder picker; adding a known folder returns it; `not_a_folder` |
| `projects.update` | `{ id, name?, color? }` | `ProjectsState` | colour is a token name (`accent`, `info`, `success`, `warning`, `danger`, `muted`) |
| `projects.remove` | `{ id }` | `ProjectsState` | forgets the project; the folder is never touched |
| `projects.setActive` | `{ id }` | `ProjectsState` | |
| `projects.reorder` | `{ ids }` | `ProjectsState` | |
| `sessions.list` | — | `SessionMeta[]` | newest first (see `docs/reference/engine.md`) |
| `sessions.get` | `{ id }` | `SessionSnapshot` | `{ meta, items, queue }` |
| `sessions.create` | `{ projectId, title? }` | `SessionMeta` | runs in the project folder with the default model/permission mode |
| `sessions.send` | `{ id, text }` | — | starts a turn, or queues while Claude works |
| `sessions.interrupt` | `{ id }` | — | stops the current turn |
| `sessions.answerPermission` | `{ id, requestId, decision }` | — | `{ behavior: "allow", always?, updatedInput? }` or `{ behavior: "deny", message? }` |
| `sessions.removeQueued` | `{ id, queuedId }` | — | |
| `sessions.setModel` / `sessions.setPermissionMode` | `{ id, model }` / `{ id, mode }` | — | applied live |
| `sessions.rename` / `sessions.archive` | `{ id, title }` / `{ id, archived }` | — | |
| `sessions.stop` | `{ id }` | — | ends the Claude Code process (resumes on the next message) |
| `sessions.delete` | `{ id }` | — | removes Jig's record; Claude Code's own transcript stays |

## Events

| Topic | Payload | When |
|---|---|---|
| `config.changed` | `JigConfig` | after any settings change |
| `themes.changed` | — | a theme was installed/removed or a file in `~/.jig/themes` changed |
| `layout.changed` | `Layout` | the host changed the layout (e.g. an accepted level-1 build) |
| `projects.changed` | `ProjectsState` | after any project change |
| `notify` | `{ title, message?, tone? }` | a host notification, shown as a toast |
| `sessions.update` | `{ sessionId, updates: ChatUpdate[] }` | transcript/metadata/queue changes of a session |
