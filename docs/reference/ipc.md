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
| `config.get` | — | `JigConfig` | |
| `config.update` | `DeepPartial<JigConfig>` | `JigConfig` | validated, saved atomically, emits `config.changed` |
| `themes.list` | — | `ThemeSummary[]` | every theme from every source; unreadable ones are skipped (and logged) |
| `themes.get` | `{ id }` | `JigTheme` | `not_found`, `invalid_theme` (message says why) |
| `themes.rescan` | — | `ThemeSummary[]` | forget the cache and rescan (after installing a VS Code theme) |
| `themes.searchOpenVsx` | `{ query }` | `OpenVsxExtension[]` | theme extensions on open-vsx.org; `network` when offline |
| `themes.installOpenVsx` | `{ namespace, name }` | `ThemeSummary[]` | the themes it added; `not_a_theme` if it has none |
| `themes.remove` | `{ id }` | — | user files and Open VSX installs only (`not_removable` otherwise) |
| `window.setTitleBarColors` | `{ symbolColor }` | — | colour of the Windows/Linux window controls |

## Events

| Topic | Payload | When |
|---|---|---|
| `config.changed` | `JigConfig` | after any settings change |
| `themes.changed` | — | a theme was installed/removed or a file in `~/.jig/themes` changed |
