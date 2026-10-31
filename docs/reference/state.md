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
| `sessions/<id>.json` | JSON `{ meta, items, queue }` | chat session metadata and transcript cache (`shared/engine.ts`). Besides title, model, mode, usage and Claude Code's session id, `meta` keeps the chat's `effort`, extra folders (`addDirs`), background tasks, MCP status, the context window, and after a rewind the point to resume at (`resumeAt`, or `resetPending` to start over) |
| `attachments/<session>/<uuid>.<ext>` | files | images and documents pasted, dropped or attached in a chat; deleted with the session |
| `attachments/<session>/tool-<toolUseId>-<n>.png` | files | images a tool returned (a browser screenshot), shown in its tool card |
| `attachments/addon-<id>/<uuid>.<ext>` | files | files an add-on kept for messages it sends later (`ctx.attachments`; the Tasks add-on's task files), copied into the chat when sent; the add-on deletes them (`api.attachments.remove`) |
| `scripts.json` | JSON `{ groups: { <projectId>: [{ id, name, scriptIds }] } }` | script groups per project |
| `addons/` | git repository | your add-ons, one folder each; every accepted change is a commit |
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
| `activity/YYYY-MM-DD.jsonl` | JSON lines `{ at, kind, text, projectId?, detail? }` | the local activity log (`docs/reference/learning.md`) |
| `suggestions.json` | JSON `{ suggestions, blocked, runs, lastRun }` | the suggestion inbox, your answers, blocked patterns, pattern runs |
| `projects.json` | JSON, `ProjectsFileSchema` (`shared/projects.ts`) | `{ workspaces: [{ id, path, addedAt }], projects: [{ id, name, path, color, addedAt, focusRepo?, model?, effort?, permissionMode?, instructions?, starters?, links? }], activeId }` (D-101). `links`: `[{ id, title, links: [{ id, url, label?, type }] }]`, the project's link groups (`shared/links.ts`). Workspaces are the folders you added; a project is a group of chats with `path` = its default workspace, `focusRepo` = its default Git repository and defaults for its chats. A project's folder missing from `workspaces` is added on load |
| `themes/*.json` / `*.jsonc` | Jig or VS Code theme | your own themes; watched — saving re-applies (see `docs/guides/themes.md`) |
| `themes/openvsx/<namespace>.<name>/` | extension subset | themes installed from Open VSX: `package.json`, `package.nls.json` and JSON files only (file icon themes: also their icons and fonts) |

Outside `~/.jig`:
- **Claude's browser** keeps its cookies and storage in Electron's session `persist:jig-browser`, under
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
| `engine.allowApiKey` | `false` | keep `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` in sessions (pay-as-you-go!) |
| `engine.defaultModel` | `"opusplan"` | new chats: Opus in Plan mode, Sonnet for execution; empty follows Claude Code |
| `engine.subagentModel` | `"sonnet"` | Claude Code subagent fallback; explicit invocation/agent models win; empty respects existing Claude settings/environment |
| `engine.helperModel` | `"sonnet"` | add-on one-turn AI questions that need thought (reviews, explanations) |
| `engine.quickModel` | `"haiku"` | add-on questions asked with `quick` (commit messages): short, simple answers |
| `engine.claudeAiConnectors` | `false` | load your claude.ai account's connectors (Asana, Notion, Linear…) into new chats; off sets `ENABLE_CLAUDEAI_MCP_SERVERS=false`, so none is flagged as needing sign-in; the MCP servers in your Claude Code settings are unaffected (D-160) |
| `engine.defaultPermissionMode` | `plan` | `default`, `acceptEdits`, `plan`, `bypassPermissions` |
| `engine.testerModel` | `"haiku"` | model for testing in Claude's browser: the `jig-tester` subagent every chat gets, and Search → Test something… (D-124) |
| `engine.promptSuggestions` | `true` | Claude Code suggests your next message after a turn (shown above the composer) |
| `engine.fileCheckpoints` | `true` | Claude Code keeps copies of files before editing, so a chat can restore files to before a message |
| `chat.overview` | `true` | the small overview card at the top right of each chat: turns, tool calls, files changed, commands, skills, subagents, add-ons, MCP calls, tokens; **Show details** opens the full breakdown in a modal (D-184). The chart button in the chat's top bar turns it on or off |
| `chat.view` | `"compact"` | how chats show Claude's work: `compact` folds each run of steps (commands, reads, edits, thinking) into one line you can open; `detailed` shows every step as its card (D-159). The switch is in each chat's top bar |
| `chatList.view` | `"project"` | how the Chats list groups chats: `project` (a group per project, then "No project"), `status` (Pinned, Needs you, Working, Error, Idle), `recent` (Pinned, Today, Yesterday, Last 7 days, Older) or `all` (one list). The switch is in the Chats header |
| `chatList.pinnedOrder` | `[]` | ids of pinned chats in the order you dragged them; pinned chats not listed follow, newest first |
| `editor.wordWrap` | `false` | long lines wrap in the file editor (Preview) |
| `editor.showWhitespace` | `false` | spaces and tabs show as faint dots and arrows in the editor |
| `editor.closeBrackets` | `true` | typing `(` `[` `{` `"` `'` adds the closing one |
| `editor.tabSize` | `4` | indentation for a file that doesn't show its own; otherwise the editor follows the file |
| `notifications.desktop` | `true` | a system notification when a chat needs you or finishes while Jig is in the background |
| `browser.showWhenUsed` | `true` | open the Claude's browser view by itself when Claude starts browsing (off: it stays closed until you open it) |
| `terminal.shell` | `""` | shell; empty = PowerShell on Windows, `$SHELL` elsewhere. Protected: Settings only (it runs programs) |
| `learning.recording` | `true` | record activity locally |
| `learning.retentionDays` | `90` | delete activity older than this |
| `learning.exclusions` | `[]` | activity containing any of these strings is not recorded |
| `learning.schedule` | Monday 10:00, enabled | weekly pattern run (`day` 0=Sunday) |
| `learning.model` | `haiku` | model for the reflection step |
| `learning.checkIn` | `off` | weekly or biweekly check-in chat about how you work (offered once after two weeks) |
| `appearance.fileIconTheme` | `"vscode"` | file icons: `vscode` (same as VS Code), `jig`, or a theme id (`docs/reference/file-icons.md`) |
| `projects.repoScanDepth` | `3` | how many folder levels a workspace project is searched for repositories (1–5) |
| `setup.firstRunDone` | `false` | Get started was closed (an installed Jig opens it until then) |
| `updates.sourcePath` | `""` | Jig's git clone for "Pull, build and restart"; empty = the repo Jig runs from |
| `updates.buildCommand` / `installCommand` | `npm run build` / `npm install` | commands an update runs (`docs/reference/setup.md`) |
| `addonGallery.sources` | `[]` | add-on gallery sources: git URLs (https/ssh) or folders (D-179); protected, Settings and the gallery only |

Settings → Claude Code edits the model strings through pickers populated by Claude Code. Use recommended defaults is a primary action. Appearance offers bundled/system font choices, an optional custom font field and per-font Reset to the schema defaults.
