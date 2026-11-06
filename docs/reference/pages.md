# Pages reference

Code: `addons/pages/` (`addon.json`, `host.ts`, `ui.tsx`, `lib/pages.ts`), `ctx.saveCopy` in
`main/addons/saveCopy.ts`, the tool guidance in `main/engine/jigTools.ts` (`PAGES_GUIDANCE`).
Decision: D-405 (follows D-404). Tests: `addons/pages/*.test.ts`, `main/addons/saveCopy.test.ts`,
`e2e/pages.spec.ts`.

A **page** is a self-contained HTML page Claude (or ChatGPT) publishes into Jig: a report, mockup,
dashboard, release notes, comparison. Jig's own replacement for claude.ai artifacts, which Jig chats
never get (`docs/reference/artifacts.md`). Everything stays on this computer; there is no sharing service.

## Tools (`mcp__jig__addon_pages_*`, same names in ChatGPT chats)

| Tool | Does |
|---|---|
| `publish` | `{ title?, file? , html?, files?, id? }`. `file` is an HTML file (absolute, or relative to the chat's folder) in the chat's folder, its project or the temp folder; `html` is the page itself (then `files` are relative to the chat's folder). Files the page loads by a relative `src`, `href`, `srcset`, `poster` or CSS `url()`/`@import` are found in the HTML and copied along (a missing or outside one is reported in `notIncluded`); `files` adds others, or whole folders. With `id`, it updates that page. Returns `{ page, title, version, updated, entry, files, notIncluded?, message }`. Asks like any tool that writes (the user can always-allow it); `alwaysLoad`, so it is never deferred behind tool search |
| `list` | read-only: the pages, newest first, with their ids |
| `read` | read-only: a page's HTML (cut at 200 000 characters) and file list, to continue from it |

`jigContext` adds `PAGES_GUIDANCE` while the publish tool exists: show visual output as a page instead of a
temp file opened in a browser; make it read well without scripts; publish again with the id to update.

## Storage

- The list: key `pages` in the add-on's global storage (`~/.jig/addon-data/pages.json`): `Page`
  (`lib/pages.ts`): `id` (`p_` and ten hex digits), `title`, `entry`, `version`, `versions`, `files`,
  `bytes`, `chatId`, `chatTitle`, `projectId`, `createdAt`, `updatedAt`.
- The files: `~/.jig/addon-data/pages/<id>/v<n>/`, written into `v<n>.tmp` and renamed, so a failed
  publish leaves nothing. An update copies the previous version first, so images next to an unchanged page
  carry over, then lays the new files over it. The newest 5 versions are kept (`LIMITS.keep`); limits per
  version are 300 files and 25 MB (`LIMITS`).
- Publishing is serialised, because each one rewrites the list.

## Paths (security)

- **Source:** the HTML file's real path (symlinks resolved) must lie inside the chat's folder, its project
  or repositories, or the system temp folder (`readableSource`); anything else is refused.
- **Next to the page:** every extra file is resolved against the page's folder and its real path must
  stay inside it (`..`, absolute paths, drive letters and NUL are refused by `normalizeRel`; a symlink
  pointing out is refused or, for a file only the HTML names, left out and reported).
- **Page ids** are checked (`^p_[a-f0-9]{10}$`) before they become paths.
- **Showing it:** the Preview tab, as every HTML file (`docs/reference/preview.md`): a sandboxed frame,
  never same-origin, scripts off until the user turns them on in that tab, CSP with no network, no Node or
  IPC. **Open in browser** gives the file to the user's browser, which has no such sandbox: the user's own
  action.

## In the app

- **The card** (`toolRenderers` for `mcp__jig__addon_pages_publish`, `PageCard`, `promote: true`): a
  picture of the page (`HtmlThumbnail`, 168 px high, the page in a frame with scripts off, a click opens it),
  then a row with the title, "N files · size · version · when", **Open in Jig** (primary), **Open in browser**
  (hidden when the chat is narrow) and ⋯ (Open in browser, Show in folder, Save as…). `promote` makes the
  compact chat view show it as a row of its own instead of folding it into "Used a tool" (the detailed view
  shows it inside the tool's card). It shows the version that call published, and "This page was deleted"
  (buttons off) when it is gone.
- **The Pages view** (`addon.pages.pages`, hidden by default; Tools → Pages, the Home tile, or Go to): newest
  first. A row is the project's swatch (empty when the chat had no project), the title, the chat and when
  it changed: under 36 rem wide the chat and time move under the title, wider they get columns of their own
  (right-aligned time); ⋯ at the far right. The whole row opens the page in Preview; right-click or ⋯ has Open
  the chat, Open in browser, Show in folder, Save as…, Rename, Delete (asks first). Filter field in the
  header. Empty: "Ask a chat to show you something as a page…".
- **Save as…** uses `ctx.saveCopy` (`docs/reference/addon-api.md`): a folder picker, and the page lands in
  `<chosen>/<title>/`, numbered when the name is taken.
- Chat titles follow renames (`chats.get`); a chat that is gone keeps the title it had.

## Fake engine

"publish a page" in a chat writes `sales.html` and `chart.png` into the chat's folder and calls the
publish tool; "update the page" lists, rewrites and publishes again with the id (`e2e/pages.spec.ts`).
