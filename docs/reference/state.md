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
| `layout.json` | JSON, `LayoutSchema` (`shared/layout.ts`) | regions, views, hidden views, main-area tabs — see `docs/reference/layout.md` |
| `sessions/<id>.json` | JSON `{ meta, items, queue }` | chat session metadata and transcript cache (`shared/engine.ts`) |
| `attachments/<session>/<uuid>.<ext>` | images | images pasted, dropped or attached in a chat; deleted with the session |
| `scripts.json` | JSON `{ groups: { <projectId>: [{ id, name, scriptIds }] } }` | script groups per project |
| `addons/` | git repository | your add-ons, one folder each; every accepted change is a commit |
| `addons-state.json` | JSON `{ disabled: [ids] }` | add-ons you switched off |
| `addon-data/<id>.json`, `addon-data/<id>/` | JSON / files | per-add-on storage and data folder |
| `cache/addons/` | bundles | bundled add-on host code (safe to delete) |
| `builds.json` | JSON `{ jobs: BuildJob[] }` | build jobs (last 200) |
| `work/<job>/` | git worktree | a build's workspace (branch `build/<job>` of `addons/`), removed on Accept/Discard |
| `work/<job>-app/`, `work/<job>-home/` | git worktree / copy | level 3: worktree of Jig's repository (branch `jig-build/<job>`) and the preview instance's Jig home |
| `app-builds/previous/` | build snapshot | the build that ran before the last accepted level-3 change (launcher fallback) |
| `app-builds/last.json` | JSON `{ repo, mergeCommit, goal, at }` | the last accepted level-3 change (for Undo) |
| `launcher/` | `status.json`, `launcher.log`, `ready-*` | the launcher's result, log and ready heartbeats (`docs/reference/self-modification.md`) |
| `activity/YYYY-MM-DD.jsonl` | JSON lines `{ at, kind, text, projectId?, detail? }` | the local activity log (`docs/reference/learning.md`) |
| `suggestions.json` | JSON `{ suggestions, blocked, runs, lastRun }` | the suggestion inbox, your answers, blocked patterns, pattern runs |
| `projects.json` | JSON, `ProjectsFileSchema` (`shared/projects.ts`) | `{ projects: [{ id, name, path, color, addedAt }], activeId }` |
| `themes/*.json` / `*.jsonc` | Jig or VS Code theme | your own themes; watched — saving re-applies (see `docs/guides/themes.md`) |
| `themes/openvsx/<namespace>.<name>/` | extension subset | themes installed from Open VSX: `package.json`, `package.nls.json` and JSON files only (file icon themes: also their icons and fonts) |

_More files are added by later phases (layout, projects, sessions, themes, add-ons, activity,
suggestions); each is documented here when it lands._

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
| `engine.allowApiKey` | `false` | keep `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` in sessions (pay-as-you-go!) |
| `engine.defaultModel` | `""` | model for new sessions; empty = Claude Code's default |
| `engine.defaultPermissionMode` | `default` | `default`, `acceptEdits`, `plan`, `bypassPermissions` |
| `terminal.shell` | `""` | shell; empty = PowerShell on Windows, `$SHELL` elsewhere |
| `learning.recording` | `true` | record activity locally |
| `learning.retentionDays` | `90` | delete activity older than this |
| `learning.exclusions` | `[]` | activity containing any of these strings is not recorded |
| `learning.schedule` | Monday 10:00, enabled | weekly pattern run (`day` 0=Sunday) |
| `learning.model` | `haiku` | model for the reflection step |
| `appearance.fileIconTheme` | `"vscode"` | file icons: `vscode` (same as VS Code), `jig`, or a theme id (`docs/reference/file-icons.md`) |
| `setup.firstRunDone` | `false` | Get started was closed (an installed Jig opens it until then) |
| `builder.sourcePath` | `""` | Jig's source repository for level 3; empty = the repo Jig runs from |
| `builder.checkCommand` / `buildCommand` / `installCommand` | `npm run check` / `npm run build` / `npm install` | level-3 commands (`docs/reference/self-modification.md`) |
