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
the same `id` as a built-in add-on replaces it. **Delete** (the bin on one of yours) removes its folder
as a commit and keeps its stored data; deleting your copy of a built-in brings the built-in back
(D-122). Built-in add-ons can only be turned off.

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
  "storage": { "scope": "project" },   // where its data lives: global (default) | project | repo
  "contributes": { "views": [ … ], "actions": [ … ], "watchers": [ … ] },  // docs/reference/slots.md
  "exports": ["cards"]                 // host.ts functions other add-ons may call (D-215)
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
- `export const activate: AddonUiActivate = (ctx) => () => { … }` (optional, D-344) runs once when
  the add-on's UI loads, before any of its views is shown: warm a cache, keep a watch, listen with
  `ctx.on` / `ctx.onJigEvent`. The function it returns runs when the add-on unloads or reloads (undo
  your listeners there). Views unmount when they are hidden (another tab in the sidebar, the sidebar
  collapsed), so keep data that should survive that in a module-level store seeded from here, like
  Files (`addons/files/store.ts`) and Repos do; `VirtualList` takes `initialScrollTop` and
  `onScrollTop` to keep its position.

### Top bar: placement and live menu entries (D-305)

A `topbar` item sits on the right of the top bar, after Jig's own items (Suggestions, Claude's
browser). With `"placement": "right-start"` it is the first item of the right-hand group instead,
before Suggestions. Items with the same placement are ordered by `order` (default 50, lower first).

An action group's top bar menu (the add-on's name, or an `actions[].group`) can show entries that
change with state, through `menuGroups`:

```jsonc
"topbar": [{ "id": "timer", "component": "TimerBar", "placement": "right-start" }],
"actions": [{ "id": "open", "title": "Open Time", "group": "Time", "run": "openTime" }],
"menuGroups": [{ "group": "Time", "items": "timeMenu" }]
```

```tsx
import type { MenuGroupItems } from "@jig/sdk";
export const timeMenu: MenuGroupItems = async (ctx) => {
  const running = await ctx.host.call<{ project?: string } | null>("running");
  return [
    running ? { label: "Stop", icon: "square", onSelect: () => void ctx.host.call("stop") }
            : { label: "Start", icon: "play", onSelect: () => void ctx.host.call("start") },
    { heading: "Start for a project" },
    ...ctx.projects.list().map((p) => ({
      label: p.name, project: p.id, badge: "1:15", checked: running?.project === p.id,
      onSelect: () => void ctx.host.call("start", { project: p.id }),
    })),
  ];
};
```

`items(ctx)` is called each time the menu opens and returns `MenuInput[]` (or a Promise of them):
the same entries as `ctx.menu` (`project`, `person`, `badge`, `checked`, `disabled`, `danger`,
submenus), separators (`{ separator: true }`) and headings (`{ heading }`). They show above the
group's actions, a line between; a group with live entries gets its menu even without actions. The
menu waits at most 0.5 s: if the export throws, rejects, returns something else than a list or takes
longer, the menu opens with the actions alone and a toast says so (once per load). Call the same
export from your top bar item's own `ctx.menu` to keep both menus in step.

## Where the data lives (`storage.scope`, D-116)

An add-on declares whether its data is **global** (one copy, the default), **per project** or **per
repository** (the active project's default repository, else its folder):
- `useStorage(key, initial)` from `@jig/sdk/ui` → `[value, set]`, following the active project or
  repository (switching shows that one's copy) and reloading when the data changes from outside.
- `ctx.storage.get/set(key, value, { scope?, id? })` uses the declared scope and the active
  project/repository unless told otherwise (`{ scope: "global" }` for an exception, `id` for another
  project or repository). `ctx.storage.scope` and `ctx.storage.scopeId()` say which.
- Host code doesn't know the active project: `api.storage.get/set` read the global part unless given
  `{ scope, id }` (a tool's args carry `chat.projectId`).
- It is one JSON file per add-on; scoped keys are stored as `@project(<id>) <key>` and
  `@repo(<path>) <key>` (what Claude's `jig_get_addon_data` shows). Settings → Add-ons shows the scope.

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
| `onJigEvent(name, listener)` | what happens in Jig while the view is open (see Jig events below); returns unsubscribe. `useJigEvent(name, listener)` from `@jig/sdk/ui` is the hook |
| `setBadge(viewId, value)` | a badge on one of this add-on's views (its icon in a sidebar and on its tab): a count (above 99 shows `99+`) or up to 4 characters such as `!`; `0` or `undefined` clears it |
| `people.photo(email)` → data URL or null | someone's Microsoft profile picture by e-mail / user principal name (D-291), from the meeting sign-in, silently; cached per window and per run; null when they have none or the sign-in isn't there (no request is made then). `PersonAvatar` uses it |
| `azure.tenant()` / `azure.tenants()` / `azure.switchTo(key)` | the Azure tenant picked in the top bar (D-282) and all of them (your az login first), as `api.azure.tenant()` describes them; `switchTo` makes another one active (a view's "Switch" for something that lives in another tenant, like a Boards board). Follow switches with `useJigEvent("azure.tenant", …)` |
| `addons.list()` / `addons.call(addonId, method, args)` | other add-ons (`{ id, name, enabled, exports }`) and calling a host method one shares (its `exports`) |
| `projects.active()` / `projects.list()` / `projects.setActive(id)` | `{ id, name, path, isGitRepo, exists, repos, focusRepo?, color?, provider }`: a project (a group of chats the user manages, D-101). `path` and the facts are about its default workspace; `repos` lists the repositories inside it (`[{ path, name }]`, empty for a single repository); `provider` (`"claude"` or `"chatgpt"`, D-330) is who runs its new chats: the project's choice, else Jig's default |
| `projects.setFocusRepo(id, repoPath)` / `projects.rescanRepos(id)` | the project's default Git repository (Git panel, status bar, Git actions); look for repositories again in a project or workspace by id (Repos uses workspace ids on manual Refresh) |
| `useWorkspaceList()` (from `@jig/sdk/ui`) | the same, re-rendering when folders change |
| `workspaces.list()` | `{ id, name, path, isGitRepo, exists, repos }[]`: every folder the user added, whatever the projects (for views covering all repositories, like Repos) |
| `openChat({ projectId?, cwd?, draft?, sessionId? })` | starts a new chat and opens it; `cwd` must be inside the project (e.g. one repository); `draft` is put in the message box, not sent. With `sessionId`, opens that existing chat |
| `ai.ask(prompt, { cwd?, quick?, feature? })` → `string` | a one-shot question: no tools, one turn, so it can only answer (summaries, commit messages, explanations). Who answers (Claude through Claude Code, or ChatGPT through the Codex CLI) and on which model is the user's choice in Settings → AI features: "Add-ons: short answers" for `quick`, else "Add-ons: other questions"; `feature` is for the built-in Git, Releases and Tasks add-ons' own rows. Uses the user's plan; needs `ai`; prompts up to 200 000 characters; 3-minute limit |
| `ai.answer(prompt, options)` → `{ text, provider, model }` | like `ai.ask`, with the provider and model that answered, to show beside an AI-made result (the Tasks run report, D-355) |
| `ai.tour(cwd, { focus? })` | opens a guided tour of the uncommitted changes of the repository `cwd` is in (Claude orders them and explains each step); needs `ai` |
| `openPreview(path)` | opens a file in Jig's Preview tab (Markdown, HTML, PDF, tables, notebooks…; `docs/reference/preview.md`) |
| `openTab(type, params)` | this add-on's tab types (short ids); `params.title` sets the tab title |
| `updateTab(tabId, params)` | changes an open tab of this add-on: params merged, `title` renames it, `undefined` drops one |
| `openImage(path)` | opens an image file (absolute path) in Jig's image tab |
| `showView(id)` | a view of this add-on (short id) or any view by full id (`addon.git.git`, `jig.terminals`) |
| `openSettings()` | this add-on's settings page |
| `openGetStarted()` | Get Started, where the user signs in to ChatGPT (Codex) or checks Claude Code (D-330): for a "Sign in" entry beside a greyed-out ChatGPT choice |
| `scripts.list/run/stop/restart/runGroup(projectId, …)`, `scripts.running()`, `scripts.show(terminalId)`, `scripts.onChange(listener)` (scripts or groups of a project changed; returns unsubscribe) | discovered scripts and their terminals (`docs/reference/terminals.md`) |
| `runInTerminal(command, { cwd?, title?, projectId? })` | needs `terminal` |
| `attachments.add(files)`, `attachments.pick({ title?, defaultPath? })` → `AddonAttachment[]` | keeps pasted/dropped files (`clipboardData.files`, `dataTransfer.files`) or files the user picks, like the chat's message box: images ≤ 5 MB, PDFs, Word/Excel/PowerPoint and text files, in `~/.jig/attachments/addon-<id>/`. A file Claude can't take is reported in a toast and left out. Send them with `api.chats.send({ attachments })`; show them with `<Attachments files onRemove?>` from `@jig/sdk/ui` (thumbnails and chips that open the file) |
| `sendToChat(text, { sessionId?, send? })` | new session in the active project unless `sessionId`; needs `chat` |
| `notify({ title, message?, tone?, timeout?, system?, actions? })` | toast (`timeout` ms, 0 = until closed); `actions: [{ label, run }]` adds up to 3 buttons; `system: true` also shows a system notification when Jig isn't in front (if notifications are on in Settings), and the toast then waits until closed. Returns a function that closes it |
| `storage.get/set(key, value)` | per-add-on JSON (`~/.jig/addon-data/<id>.json`), shared with host code. Claude can read and change it from a chat (`jig_set_addon_data`…); then the add-on gets the event `storage` (`{ key }`): `useHostCall` reloads by itself, other views listen with `ctx.on("storage", …)` |
| `openExternal(url)`, `openPath(path)`, `copy(text)` | |
| `menu(items, eventOrElement, target?)` | a Jig menu (`MenuInput[]`: items, `{ separator: true }`, `{ heading }`); with `target`, other add-ons' `context.*` entries are added. An item may have `project` (shows its `ProjectSwatch` in front), `person` (`{ name, email }`: their avatar in front), `provider` (`"claude"` or `"chatgpt"`: the provider's mark in front, D-330), `detail` (muted text after the label, in its own column), `badge` (short text at the right edge, in a one-line slot every row keeps, about ten characters wide; longer ones truncate), `shortcut` (keys shown at the right, such as `Alt+↑`), `keepOpen` (a multi-select row: a checkbox, and choosing it toggles it and runs `onSelect` without closing the menu) and `testId` |
| `confirm({…})`, `prompt({…})` | Jig dialogs |

`@jig/sdk/ui` exports: `ProjectSwatch` (a project's square, `color` from `AddonProject.color`), `ProviderMark` (`{ provider: "claude" | "chatgpt", iconOnly? }`: who runs a chat, the same mark as the usage footer and the chat pickers; D-330), `useChatGptReady()` (whether ChatGPT can run chats now: `{ ready, detail }`, undefined while Jig asks; asked again after a sign-in), `PERMISSION_MODE_LABELS` (the chats' names of the permission modes, e.g. "Don't ask"; D-363), `PersonAvatar` (`{ name?, email?, size?: "sm" | "md" }`: a person's round avatar in a fixed-size slot, their picture through `ctx.people.photo` over their initials, an empty slot when there's nobody, name and e-mail on hover; D-291) and `personInitials`, `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Switch`, `Card`, `Badge`,
`CountBadge`, `Kbd`, `Empty`, `SectionTitle`, `ListRow`, `Tabs`, `Dialog`, `Collapse`, `Tooltip`, `Spinner`,
`Markdown`, `CodeBlock` (theme-highlighted), `ErrorBoundary`, `cn`, `iconByName`, and the hooks
`useAddon()`, `useActiveProject()`, `useActiveChat()` (the chat in front, or the last one: `{ sessionId, title, projectId }`), `useProjectList()`, `useRunningScripts()`, `useHostCall(method, args, { skip? })`
→ `{ data, error, loading, reload }`, `useAddonEvent(topic, listener)`, `useJigEvent(name, listener)`, plus `VirtualList` (long lists), `ArrangeList` (a list the user can arrange: hide items, drag them into an order, group them with dividers, each row offering a divider above it; keep its `Arrangement` in `ctx.storage`, with the pure helpers `arrange`, `moveKey`, `toggleHidden`, `addDivider`, `renameDivider`, `removeDivider` from `@jig/sdk`),
`usePointerDrag({ onMove, onDrop, onEnd?, scroller? })` (drag to reorder inside one view with pointer
events, so the wheel and trackpad keep scrolling the list during a drag; `onMove(point, payload)` also
runs after every scroll, with the element under the pointer; put `start(e, payload)` on the item's
`onPointerDown`, render `ghost(label)` for the label at the pointer; D-351),
`useHighlightedLines(code, lang)` (theme-highlighted HTML per line, for diffs),
`languageForPath(path)`, and for resizable layouts `Pane` (`<Pane id edge defaultSize min? max?>`: a flex
child with a drag handle on `edge`; the size is remembered in `layout.json` under `id` — use
`addon.<your id>.<name>`), `useSplitRatio(id, fallback?)` → `[ratio, setRatio, reset]` for two columns,
and the bare `ResizeHandle`. `FileIcon` (`<FileIcon path folder? expanded?>`) draws a file's icon in
the user's file icon theme (`docs/reference/file-icons.md`); `fileIcon: <path>` in `openTab` params gives
the tab that icon. For images: `ImagePreview` (`<ImagePreview src bytes? compact?>`: fitted on a
checkerboard, zoom buttons/presets (10–800%), Fit/100%, Ctrl/Cmd + wheel zoom, pixel and file size), `useImageFile(path)` → `{ data?: { dataUrl, bytes, mime }, error? }`
(reads through the host), `isImagePath(path)` and `formatBytes(n)`. `Attachments` (`<Attachments files onRemove? className?>`)
shows a message's files as in the chat: image thumbnails and document chips that open them. `@jig/sdk` also exports
`isImagePath`, `imageMime`, `IMAGE_TYPES` and `MAX_IMAGE_BYTES` for host code.
`sanitizeHtml(html)` makes HTML from elsewhere safe for the DOM (DOMPurify: no scripts, handlers,
`javascript:` links, frames or forms; inline styles kept); show it inside `jig-rich jig-markdown`,
which draws its colours and fonts in the theme's and makes images fit (D-342).

`ArrangeList` accepts `showFooter={false}` to omit its trailing Add divider/help row in nested
lists while retaining each row's side button for inserting a divider above it (used in pipeline cards).

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
| `azure.az(args, { timeoutMs?, tenant? })` → parsed JSON | `exec:az` (or `exec`) | Azure and Azure DevOps through the user's own `az` (D-284): runs `az <args> -o json --only-show-errors` with the tenant picked in the top bar (D-282), or with `tenant` (a key from `azure.tenant()`) the tenant that was active when an operation started: read `azure.tenant()` once and pass its key to each call of an operation of several, so a switch in the middle doesn't run its remaining calls (and store their answers or errors) in another tenant (D-345; a key this host never had rejects), starts az with no shell (on Windows its own Python with `-X utf8`, so text with quotes, line breaks or non-ASCII arrives as written and comes back as UTF-8, D-290), and resolves with the JSON (undefined for no output). A failure rejects with one message for the user that names a tenant added in Jig: az or the `azure-devops` extension missing, not signed in or sign-in expired (sign in again from the tenant avatar; your own az login keeps "run `az login`"), or what az said. Use it instead of `exec("az", …)` |
| `azure.tenant()` → `{ key, label, isDefault, user?, tenantId?, displayName?, domain?, initials? }` | — | the tenant every `az` this add-on runs uses now (`default` = your own az login; `initials` as its avatar in the top bar shows them). Key in-memory caches and per-tenant storage by `key`; follow switches with the `azure.tenant` event |
| `fs.readFile(path, encoding?)` (`"base64"` for binary files), `fs.readdir/exists`, `fs.writeFile` | `fs:read`, `fs:write` | |
| `fetch(url, init)` | `net` | |
| `storage.get/set` | — | same store as the UI |
| `spawn(command, args, { cwd?, env?, onOutput?(text, stream) })` → `{ pid, write, end, kill, done }` | `exec` or `exec:<name>` | starts a long-running program (no shell) and streams its output while it runs: logs, a deploy, a dev server. `done` resolves to `{ code }` (127 = not found); send output on to the UI with `emit`. Killed when the add-on reloads |
| `fs.watch(path, listener(changes), { recursive?, ignore?, debounceMs? })` → `stop()` | `fs:read` | calls `listener` with the changed paths, gathered over `debounceMs` (200); folders named in `ignore` (default `node_modules`, `.git`) are skipped. Stops when the add-on reloads |
| `notify({ title, message?, tone?, timeout?, system?, actions? })` | — | toast; `actions: [{ label, view \| tab+params \| run+args \| url \| file }]` (up to 3) open one of the add-on's views or tabs, call one of its host exports, open a web page or preview a file. `system: true` also notifies outside Jig when it's in the background (click brings Jig forward) |
| `setBadge(viewId, value)` | — | a badge on one of its views (as `ctx.setBadge`), e.g. from a watcher |
| `addons.list()` / `addons.call(addonId, method, args)` | — | other add-ons and their shared methods (manifest `exports`); calling a method that isn't shared fails |
| `emit(topic, payload)` | — | event to the UI |
| `projects()` | — | the user's projects |
| `workspaces()` | — | every folder the user added, with its repositories |
| `chats.create({ projectId?, cwd?, title?, permissionMode?, provider?, model? })` → `{ sessionId, provider }` | `chat` | an empty chat with the project's defaults (or in `cwd`); `permissionMode` is `default`, `acceptEdits` or `plan`; `bypassPermissions` (Don't ask) only from the built-in Tasks add-on, for a task you set to it (D-363), refused for any other. `provider` (D-330): `"claude"` or `"chatgpt"` (default: the project's, else Jig's); `model`: an alias (`opus`, `sonnet`, `haiku`; ChatGPT's `sol`, `terra`, `luna`, which run their newest version, D-310) or an exact id (default: the provider's). Main checks both (the host process isn't trusted); `"chatgpt"` fails while ChatGPT isn't signed in, with a message that starts "ChatGPT isn't signed in". When the provider's plan is used up and "When a chat hits its limit" is `switch` (the project's or Jig's), the chat starts on the other provider (D-338): `provider` says who runs it |
| `chats.send({ text, sessionId?, projectId?, cwd?, title?, permissionMode?, attachments?, from? })` → `{ sessionId, sentAt }` | `chat` | sends a message (a busy chat queues it), creating a chat first unless `sessionId`. `attachments` are files kept with `ctx.attachments` (copied into the chat, so the add-on's stay its own); the text may be empty when there are files. `from` (D-318): a message from the add-on, not the user: the transcript shows that one line with the add-on's icon (`ChatItem.fromIcon`) and "Jig told Claude", like a finished terminal's notice; it needs `sessionId` and no files, starts a turn in an idle chat and joins a running one. `provider` and `model` (D-330) only with a new chat: with `sessionId` they are refused, since only a limit handoff changes a chat's provider (D-338) |
| `attachments.remove(list)` | — | deletes files this add-on kept (only its own, in `attachments/addon-<id>/`) |
| `chats.get(sessionId)` → `{ id, title, provider, model, status, projectId?, cwd, costUsd, queued, background, userStoppedAt?, waitingFor?, lastAnswer?, lastAnswerAt?, error? }` | `chat` | a chat's state and Claude's last answer. `provider` (`"claude"` or `"chatgpt"`) and `model` (as chosen; empty = the provider's default) say who runs it (D-330). `background` (D-318): commands, subagents and monitors still running in the background (they wake the chat when they end); `userStoppedAt`: when the user last pressed Stop in it or rejected a tool call (a permission or question card); `waitingFor` (D-326): while it needs you, what its pending card is (`question`, `plan` or `permission`); `limit` (D-338): its plan's limit stopped it, `{ provider, state: "ask" \| "waiting" \| "continuing", resetsAt? }`; such a chat hasn't finished (it waits for you, for the reset, or carries on with the other provider, after which `provider` is the new one) |
| `log(message, detail?)` | — | to `~/.jig/logs/main.log` |
| `addon` | — | `{ id, dir, dataDir }` (`dataDir` = `~/.jig/addon-data/<id>/`) |

**Following chats** (D-182): when a chat the add-on created, sent to or asked about (`chats.*`) changes
status, main calls the host export `chatChanged({ sessionId, status })` if there is one (status:
`idle`, `starting`, `working`, `needs_you`, `error`), and again when its last background task
ends (D-318: the status may be the same; ask `chats.get`). Main remembers this in memory only, so after a
restart the add-on asks again with `chats.get` (a watcher). The `chat` permission is checked in the
host and again in main. The Tasks add-on (`addons/tasks`) is the example.

Permissions are shown to you (Settings → Add-ons, and in the builder's preview) and enforced by this
API. `ai` lets an add-on ask Claude (`ctx.ai.ask`); the host checks it again (`ai.ask` IPC), so an
add-on without it gets an error even if its UI calls the method directly. Host code is code you accepted, not a sandbox (D-007): it could import Node modules directly.

## Jig events (D-215)

Add-ons can follow what happens in Jig: host code with `contributes.events` (`[{ on, run }]`, runs even
with no view open), a UI with `ctx.onJigEvent` / `useJigEvent`. The list is `JIG_EVENTS` in `@jig/sdk`:

| Event | Payload | When |
|---|---|---|
| `chat.finished` | `{ sessionId, title, projectId?, cwd }` | a chat's turn ended (working → idle) |
| `chat.needsYou` | same | a chat waits for a permission or an answer |
| `chat.failed` | same + `error?` | a turn ended with an error |
| `git.commit` | `{ repo, branch?, sha, message }` | a commit in one of the projects' repositories, made anywhere (Jig, a terminal, an editor) |
| `git.branch` | `{ repo, from?, to? }` | a branch switch there |
| `project.active` | `{ projectId?, name?, path? }` | another project became active |
| `azure.tenant` | `{ key, label, isDefault, user?, tenantId?, displayName?, domain?, initials? }` | another Azure tenant became the active one (D-282): every `az` Jig runs, `api.exec("az", …)` and `api.azure.az` included, now uses it; drop Azure/DevOps caches and reload. Host code hears it after `api.azure.tenant()` already says the new one. Pipelines (`tenantChanged`) and Boards are the examples (D-284) |

Builder chats don't send chat events. Git events come from watching each repository's `.git` folder
(up to 50 repositories; worktrees follow their `gitdir`).

## Search (D-215)

`contributes.search` (`[{ id, title, icon?, run }]`) adds results to Jig's search (top bar, Ctrl+P):
`run({ query, projectId?, cwd? }, api)` returns up to 8 `{ id, label, detail?, icon?, open }`, where `open`
is the same target as a toast button (`{ view }`, `{ tab, params? }`, `{ run, args? }`, `{ url }`,
`{ file }`). Results show after the files, one group per provider titled `title`; a provider gets
1.5 s, then it's left out of that search. Queries are debounced as you type.

## Asking before Jig quits (D-343)

`contributes.quitGuards` (`[{ id, run }]`): when Jig is about to quit (menu, Alt+F4, closing the last
window, an update's restart), Jig calls `run(undefined, api)` and waits up to 2 s. Return `null` when
there is nothing to ask, or an `AddonQuitAnswer`:

```ts
{ message: "A timer is running: Checkout · Shop · 1:23",
  detail: "Kept running, it goes on counting from 09:05.",
  actions: [{ id: "stop", label: "Stop timer and quit", run: "stop" },   // host.ts export, called with args
            { id: "keep", label: "Keep it running and quit" }] }         // no run: only quits
```

Jig lists every answer (its own, such as an active meeting, and other add-ons') in one modal with your
icon and name, with Cancel and Quit anyway. An action calls its `run` export with `args`, then Jig
quits; if it throws, Jig stays open and shows the error. A guard that throws or is slow is skipped. At
most 3 actions; ask only for something the user would lose or forget. Hidden Jig (tests) never asks.

## Add-ons working together (D-215)

An add-on lists host functions others may call in its manifest's top-level `exports`; they call them
with `api.addons.call(id, method, args)` / `ctx.addons.call(...)`. Use it when one add-on owns some
data (work items, environments) that others build on. A turned-off add-on can't be called.

## Lifecycle

- Discovery at start and on every file change (folders are watched; saving a file reloads that add-on
  only — UI, CSS and host process).
- Switching an add-on off (Settings → Add-ons, or "Turn off" after a crash) unloads it and is
  remembered in `~/.jig/addons-state.json`.
- `jig_list_addons` (the chat tool) and the builder read the catalog: manifest, contributions,
  permissions, a "Purpose" line (the README's first paragraph) and README of every add-on. The weekly
  review gets the same catalog with each add-on's use, so it knows what each one is for (D-215).

## IPC

`addons.list`, `addons.setEnabled`, `addons.call`, `addons.callShared`, `addons.badges`,
`addons.setBadge`, `addons.systemNotify`, `addons.search`, `addons.storageGet/Set`, `addons.reload`,
`addons.history`, `addons.rollback`; events `addons.changed`, `addons.event`, `addons.badges`,
`addons.jigEvent` (`docs/reference/ipc.md`).
The UI bundle is served at `jig-addon://<id>/ui.js`, its CSS at `jig-addon://<id>/ui.css`, other files
of the folder (images) at `jig-addon://<id>/<path>`.

## Meetings window

ctx.meetings.open(): Promise<void> opens/focuses the built-in Meetings lobby window; calls run in its call window (D-217, D-292).
ctx.meetings.history(): void opens the meeting history tab (`jig.meetings`) in this window (D-250).
Meetings must be enabled. Its call and transcript are global, independent of the active project.
The host retains the privileged media/authentication implementation; no credential is returned to an
add-on. Tasks exports addReviewed for explicitly user-reviewed work: {title,prompt,projectId,source}.
It pauses the queue, defaults to Plan mode, and deduplicates by source. It never starts a chat itself.

The built-in meetings id has host-managed typed state. Generic storageSet/storageDelete (including
Claude's add-on-data tools) reject writes, preventing bypass of its room-only connection and review
handlers. Read access remains available; use the meeting transcript tool for paginated snapshots.

## Approval cards (`chat.permissionRenderer`)

`contributes.permissionRenderers: [{ tool, component }]` replaces Jig's permission card when Claude
calls one of the add-on's own tools (`tool` is the short name, e.g. `add` for
`mcp__jig__addon_<id>_add`). The component (exported from `ui.tsx`) gets `AddonPermissionProps`:
`request { toolName, input, title }`, `status` (pending or answered), `sessionId`, `projectId` (the
chat's project) and `respond(decision)`. `respond({ behavior: "allow", input })` runs the tool with
the changed input; `respond({ behavior: "deny" })` declines. The Task queue's `ReviewTasks` is the
example (D-248).

