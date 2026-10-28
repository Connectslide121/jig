# Add-on API reference

Types: `packages/sdk/src/api.ts` (`@jig/sdk`), components: `@jig/sdk/ui`
(`apps/desktop/src/renderer/addons/uiKit.ts`). Runtime: `apps/desktop/src/main/addons/` (host) and
`apps/desktop/src/renderer/addons/` (UI). How to write one: `docs/guides/writing-addons.md`.

## Folder

```
my-addon/
├── addon.json   manifest (schema: packages/sdk/addon.schema.json)
├── ui.tsx       optional — React components and handlers named in the manifest
├── host.ts      optional — Node code: methods the UI calls, watchers
└── README.md    what it does and why (the builder reads it before changing anything)
```

Built-in add-ons: `addons/` in Jig's repository. Yours: `~/.jig/addons/<folder>/` — a git repository;
every change Jig accepts is a commit (Settings → Add-ons → History → Roll back). A folder of yours with
the same `id` as a built-in add-on replaces it.

## Manifest (`addon.json`)

```jsonc
{
  "$schema": "../../packages/sdk/addon.schema.json",
  "id": "pipelines",                 // lower-case, digits, dashes
  "name": "Pipelines",
  "description": "Azure DevOps pipelines of your projects",
  "version": "1.0.0",
  "icon": "rocket",
  "permissions": ["exec:az", "net"],
  "contributes": { "views": [ … ], "actions": [ … ], "watchers": [ … ] }   // docs/reference/slots.md
}
```

Problems (invalid manifest, a missing export, a build error) are shown in Settings → Add-ons; the
add-on isn't loaded until they are fixed. Hard-coded colours or arbitrary Tailwind values show as
design-token warnings (the builder must fix them; the add-on still loads).

## UI (`ui.tsx`)

- Allowed imports: `react`, `react-dom`, `lucide-react`, `@jig/sdk`, `@jig/sdk/ui` and relative files.
  They are the app's own instances (shared through `globalThis.__jigShared`), so an add-on is a few
  KB and looks native.
- Styling: Tailwind token utilities only (`bg-surface`, `text-muted`, `p-2`, `rounded-md`, …;
  `docs/reference/design-tokens.md`). Jig generates the CSS for an add-on's classes when it loads.
- Every component gets `ctx: AddonUiContext` as a prop (also `useAddon()`), and renders inside an
  error boundary: a crash shows "Turn off" / "Fix with AI" in its place.
- Handlers (`actions[].run`, `menus[].run`) are exported functions `(ctx, target?) => void | Promise`.

## Icons

Jig's icons are [Lucide](https://lucide.dev/icons) (`lucide-react`, the same copy Jig uses), and so
are add-ons':
- **In `addon.json`:** every `icon` is a Lucide name in kebab case, e.g. `"git-branch"`, `"rocket"`,
  `"calendar-clock"`. A name Lucide doesn't have shows a puzzle piece, and Settings → Add-ons lists it
  as a warning.
- **In `ui.tsx`:** import icons directly, `import { Rocket } from "lucide-react"`. They follow the
  theme through `currentColor`; size them with `size-4` and friends. Jig's `Button` and `IconButton`
  take one as `icon={Rocket}`.
- **An icon chosen at runtime** (from settings or data): `import { Icon } from "@jig/sdk/ui"` and
  `<Icon name="rocket" className="size-4" />`, or `iconByName(name)` for the component itself.

`AddonUiContext`:

| Member | What |
|---|---|
| `addon` | `{ id, name }` |
| `host.call(method, args)` | calls an export of `host.ts` |
| `on(topic, listener)` | events from `api.emit` in host code |
| `projects.active()` / `projects.list()` / `projects.setActive(id)` | `{ id, name, path, isGitRepo, exists, repos, focusRepo? }`: a project (a group of chats the user manages, D-101). `path` and the facts are about its default workspace; `repos` lists the repositories inside it (`[{ path, name }]`, empty for a single repository) |
| `projects.setFocusRepo(id, repoPath)` / `projects.rescanRepos(id)` | the project's default Git repository (Git panel, status bar, Git actions); look for repositories again |
| `workspaces.list()` | `{ id, name, path, isGitRepo, exists, repos }[]`: every folder the user added, whatever the projects (for views covering all repositories, like Repos) |
| `openChat({ projectId?, cwd?, draft? })` | starts a new chat and opens it; `cwd` must be inside the project (e.g. one repository); `draft` is put in the message box, not sent |
| `ai.ask(prompt, { cwd? })` → `string` | asks Claude a one-shot question through your Claude Code: no tools, one turn, so it can only answer (summaries, commit messages, explanations). Uses your plan; needs `ai`; prompts up to 200 000 characters; 3-minute limit |
| `ai.tour(cwd, { focus? })` | opens a guided tour of the uncommitted changes of the repository `cwd` is in (Claude orders them and explains each step); needs `ai` |
| `openPreview(path)` | opens a file in Jig's Preview tab (Markdown, HTML, PDF, tables, notebooks…; `docs/reference/preview.md`) |
| `openTab(type, params)` | this add-on's tab types (short ids); `params.title` sets the tab title |
| `openImage(path)` | opens an image file (absolute path) in Jig's image tab |
| `showView(id)` | a view of this add-on (short id) or any view by full id (`addon.git.git`, `jig.terminals`) |
| `openSettings()` | this add-on's settings page |
| `scripts.list/run/stop/restart/runGroup(projectId, …)`, `scripts.running()`, `scripts.show(terminalId)`, `scripts.onChange(listener)` (scripts or groups of a project changed; returns unsubscribe) | discovered scripts and their terminals (`docs/reference/terminals.md`) |
| `runInTerminal(command, { cwd?, title?, projectId? })` | needs `terminal` |
| `sendToChat(text, { sessionId?, send? })` | new session in the active project unless `sessionId`; needs `chat` |
| `notify({ title, message?, tone? })` | toast |
| `storage.get/set(key, value)` | per-add-on JSON (`~/.jig/addon-data/<id>.json`), shared with host code |
| `openExternal(url)`, `openPath(path)`, `copy(text)` | |
| `menu(items, eventOrElement, target?)` | a Jig menu; with `target`, other add-ons' `context.*` entries are added |
| `confirm({…})`, `prompt({…})` | Jig dialogs |

`@jig/sdk/ui` exports: `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Switch`, `Card`, `Badge`,
`CountBadge`, `Kbd`, `Empty`, `SectionTitle`, `ListRow`, `Tabs`, `Dialog`, `Tooltip`, `Spinner`,
`Markdown`, `CodeBlock` (theme-highlighted), `ErrorBoundary`, `cn`, `iconByName`, and the hooks
`useAddon()`, `useActiveProject()`, `useProjectList()`, `useRunningScripts()`, `useHostCall(method, args, { skip? })`
→ `{ data, error, loading, reload }`, `useAddonEvent(topic, listener)`, plus `VirtualList` (long lists),
`useHighlightedLines(code, lang)` (theme-highlighted HTML per line, for diffs),
`languageForPath(path)`, and for resizable layouts `Pane` (`<Pane id edge defaultSize min? max?>`: a flex
child with a drag handle on `edge`; the size is remembered in `layout.json` under `id` — use
`addon.<your id>.<name>`), `useSplitRatio(id, fallback?)` → `[ratio, setRatio, reset]` for two columns,
and the bare `ResizeHandle`. `FileIcon` (`<FileIcon path folder? expanded?>`) draws a file's icon in
the user's file icon theme (`docs/reference/file-icons.md`); `fileIcon: <path>` in `openTab` params gives
the tab that icon. For images: `ImagePreview` (`<ImagePreview src bytes? compact?>`: fitted on a
checkerboard, 100% toggle, pixel and file size), `useImageFile(path)` → `{ data?: { dataUrl, bytes, mime }, error? }`
(reads through the host), `isImagePath(path)` and `formatBytes(n)`. `@jig/sdk` also exports
`isImagePath`, `imageMime`, `IMAGE_TYPES` and `MAX_IMAGE_BYTES` for host code.

## Host (`host.ts`)

Runs in its own process (an Electron `utilityProcess`, D-017): a hang or crash never freezes Jig; it
restarts on the next call (up to 3 times a minute). Every named export is a method:

```ts
import type { AddonHostApi } from "@jig/sdk";
export async function status(args: { projectId: string }, api: AddonHostApi) { … }
export function activate(api: AddonHostApi) { … }   // optional, runs once at start
```

`AddonHostApi`:

| Member | Permission | What |
|---|---|---|
| `exec(command, args, { cwd?, timeoutMs?, env?, input?, encoding? })` → `{ code, stdout, stderr }` (`encoding: "base64"` for binary output) | `exec` or `exec:<name>` | runs a program without a shell (default timeout 120 s; `code` 127 = not found). On Windows, PATH/PATHEXT are searched and `.cmd`/`.bat` programs (`az`, `code`, `npm`) run through `cmd.exe` with safe quoting |
| `fs.readFile(path, encoding?)` (`"base64"` for binary files), `fs.readdir/exists`, `fs.writeFile` | `fs:read`, `fs:write` | |
| `fetch(url, init)` | `net` | |
| `storage.get/set` | — | same store as the UI |
| `notify({…})`, `emit(topic, payload)` | — | toast; event to the UI |
| `projects()` | — | the user's projects |
| `workspaces()` | — | every folder the user added, with its repositories |
| `log(message, detail?)` | — | to `~/.jig/logs/main.log` |
| `addon` | — | `{ id, dir, dataDir }` (`dataDir` = `~/.jig/addon-data/<id>/`) |

Permissions are shown to you (Settings → Add-ons, and in the builder's preview) and enforced by this
API. `ai` lets an add-on ask Claude (`ctx.ai.ask`); the host checks it again (`ai.ask` IPC), so an
add-on without it gets an error even if its UI calls the method directly. Host code is code you accepted, not a sandbox (D-007): it could import Node modules directly.

## Lifecycle

- Discovery at start and on every file change (folders are watched; saving a file reloads that add-on
  only — UI, CSS and host process).
- Switching an add-on off (Settings → Add-ons, or "Turn off" after a crash) unloads it and is
  remembered in `~/.jig/addons-state.json`.
- `jig_list_addons` (the chat tool) and the builder read the catalog: manifest, contributions,
  permissions and README of every add-on.

## IPC

`addons.list`, `addons.setEnabled`, `addons.call`, `addons.storageGet/Set`, `addons.reload`,
`addons.history`, `addons.rollback`; events `addons.changed`, `addons.event` (`docs/reference/ipc.md`).
The UI bundle is served at `jig-addon://<id>/ui.js`, its CSS at `jig-addon://<id>/ui.css`, other files
of the folder (images) at `jig-addon://<id>/<path>`.
