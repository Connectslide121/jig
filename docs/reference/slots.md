# Slots reference

Source of truth: `packages/sdk/src/slots.ts` (`SLOTS`, `MANIFEST_KEY`). A contribution names a slot by
its manifest key in `addon.json` → `contributes`. Components and handlers are named exports of the
add-on's `ui.tsx`; watchers are named exports of `host.ts`. Ids are namespaced by Jig
(`addon.<addon-id>.<id>`), so they never collide. Claude tools are named `addon_<addon-id>_<id>` with
`-` turned into `_`; if two add-ons end up with the same name, the first one loaded keeps it.

| Slot | Manifest key | Fields | Export receives | Where it shows |
|---|---|---|---|---|
| `view` | `views` | `id`, `title`, `icon?`, `region` (`left`/`right`/`bottom`, default left), `under?` (a view id such as `addon.git.git`: start as a collapsible section below it), `component` | `{ ctx }` | a sidebar or the bottom panel, or a section below another view; the user can move/hide it; a new view opens its region the first time |
| `workbench.tab` | `tabs` | `type`, `title`, `icon?`, `component` | `{ ctx, params, tabId, active }` | main-area tabs, opened with `ctx.openTab(type, params)` (`params.title` overrides the tab title) |
| `topbar.item` | `topbar` | `id`, `component` | `{ ctx }` | right side of the top bar |
| `statusbar.item` | `statusbar` | `id`, `side` (`left`/`right`, default `right`), `component` | `{ ctx }` | status bar |
| `dashboard.widget` | `dashboard` | `id`, `component`, `order?` | `{ ctx, project }` | project dashboard |
| `tools.action` | `actions` | `id`, `title`, `group?` (default: add-on name), `icon?`, `shortcut?`, `run` | `run(ctx)` | Tools menu (+ keyboard shortcut) |
| `context.project` / `context.repo` / `context.file` / `context.message` | `menus` | `slot`, `id`, `title`, `icon?`, `run` | `run(ctx, target)` — see `MenuTarget` | right-click menus of projects, repos (Repos view), files (Git), chat messages (`⋯` on a reply) |
| `chat.toolbar` | `chatToolbar` | `id`, `component` | `{ ctx, sessionId, projectId }` | row above the chat composer |
| `chat.toolRenderer` | `toolRenderers` | `tool` (tool name, e.g. `mcp__server__tool`), `component` | `{ ctx, item }` | inside that tool's card in the chat |
| `prompt` | `prompts` | `id`, `label`, `text`, `send?` | — | button above the composer (inserts or sends the text) |
| `watcher` | `watchers` | `id`, `every` (`30s`, `5m`, `1h`; min 10 s), `run` | host: `run({}, api)` | background, in the add-on's host process |
| `claude.tool` | `tools` | `id` (`a-z0-9_`), `description` (when to use it), `params?` (`{ name: { type?, description?, optional?, enum? } }`), `readOnly?`, `run` | host: `run({ ...args, chat: { cwd, projectId, sessionId } }, api)` (`sessionId`: the chat that called), returns text or JSON | a tool Claude can use in every new chat, `mcp__jig__addon_<add-on>_<id>`; read-only tools run without asking (D-115) |
| `settings.page` | `settings` | `title`, `component` | `{ ctx }` | Settings, as its own page |
| `theme` | `themes` | `path`, `label?` | — | Settings → Appearance (Jig or VS Code theme JSON) |

Icons are lucide names in kebab case (`git-branch`, `rocket`; https://lucide.dev/icons). The add-on's
`icon` is the default for its contributions.

Code that shows a context menu appends what add-ons contribute: Jig's own menus do this for
`context.project` and `context.message`; add-ons that show lists of repos or files pass a target to
`ctx.menu(items, event, target)` so other add-ons' `context.repo`/`context.file` entries appear too.

When a slot can't do what a request needs, the builder proposes a new one instead of changing Jig
(D-074); you add it to Jig's source. Slots are the extension points, and adding slots is how Jig grows.
