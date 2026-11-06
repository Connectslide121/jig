# Pages

Jig's own artifacts (D-405): a chat publishes a **self-contained HTML page**, with the images
and files it loads, into Jig, and Jig keeps it, lists it and previews it, all on this computer. Nothing is
uploaded and no claude.ai is involved (Claude Code's Artifact tool exists only in the Claude desktop app).

- **Tools for chats** (`mcp__jig__addon_pages_*`): `publish` (an HTML `file` in the chat's folder, its
  project or the temp folder, or the `html` itself; `files` next to it; `id` to update a page), `list`
  and `read` (read-only). Relative `src`/`href`/`url()` files are found in the HTML and copied along;
  anything outside the page's folder, `..` and absolute paths are refused. `jigContext` tells the chat to
  use it for reports, mockups, dashboards, release notes and comparisons.
- **A page card in the chat** (`toolRenderers`): title, version, **Open in Jig** (the Preview tab; scripts
  stay off until the user turns them on there, no network, no access to Jig) and ⋯ (Open in browser, Show
  in folder, Save as…).
- **The Pages view** (Tools → Pages; sidebar or main tab): newest first, with project, chat and when it
  changed in aligned columns; the whole row opens the page; ⋯ has Open the chat, Open in browser, Show in
  folder, Save as…, Rename and Delete.
- **Storage:** the list is `pages` in this add-on's storage (global); the files are in
  `~/.jig/addon-data/pages/<id>/v<n>/`. An update is a new version of the same page and carries over the
  files it doesn't bring again; the last 5 versions are kept. Limits: 300 files, 25 MB per version.

`lib/pages.ts` holds the pure parts (path checks, finding the files a page loads, titles, pruning) with
tests; `host.ts` does the file work.
