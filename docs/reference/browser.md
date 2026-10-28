# Claude's browser

Code: `apps/desktop/src/main/browser/` (service, tools, page scripts),
`apps/desktop/src/shared/browser.ts` (types), `apps/desktop/src/renderer/features/browser/` (the view).
Decisions: D-090, D-095.

Claude checks its own web work in a real Chromium page inside Jig. The page is offscreen with its own
size: the **Claude's browser** view (right sidebar; Tools → Open Claude's browser) only shows a scaled
picture of it, so the view's size never limits Claude, and resizing never moves anything on screen.
The view opens by itself when Claude starts browsing; turn off Settings → Claude Code → **Show Claude's
browser when it's used** (`browser.showWhenUsed`, on by default) to keep it closed. You can take over
in the view at any time.

## How it works

- **One page, owned by the main process:** a hidden, offscreen `BrowserWindow` created on first use.
  - It is marked as a helper window (`main/appWindows.ts`), so it never receives Jig's events, never
    counts for focus, notifications or "all windows closed", and is destroyed with the last real
    window.
  - It has its own session (`persist:jig-browser`), so cookies and storage are apart from Jig's, and
    `sandbox`, `contextIsolation`, no Node and no preload.
  - Downloads are cancelled and permission requests (camera, microphone, location, notifications…)
    are denied. Pop-ups (`window.open`, `target=_blank`) open in the same page.
  - It opens only `http:`, `https:` and `file:` URLs. `localhost:5173` becomes `http://localhost:5173`;
    a host name without a scheme becomes `https://`.
- **Live view:** while a view is mounted (`browser.watch {on:true}`), painted frames go to it as JPEG
  (`browser.frame`), at most 10 per second and always the last one. Nothing is encoded while nobody
  watches.
- **Taking over:** clicks, the wheel and keys on the picture are mapped to page pixels (through the
  letterboxing) and sent as real input events (`browser.input`). Printable characters are inserted as
  text, and Ctrl/Cmd shortcuts stay Jig's.
- **Console:** console messages and failed loads are kept (the last 300). The view shows the number of
  errors; the terminal icon opens the list in a resizable pane. Electron's own development warnings
  are left out.
- **Sizes:** desktop 1280×800 (default), tablet 820×1180 and phone 390×844, or any size from the tool.
  The window is offscreen, so resizing never moves anything on your screen.

## Claude's tools (MCP server `jig`)

| Tool | Read-only | What it does |
| --- | --- | --- |
| `jig_browser_open {url}` | no | opens the page, waits for it to load, and returns its text plus the numbered interactive elements; shows the view unless `browser.showWhenUsed` is off |
| `jig_browser_read` | yes | the page's text (up to 8000 characters) and up to 200 interactive elements, `[n] kind "label" …` |
| `jig_browser_click {ref \| selector \| text}` | no | scrolls the element into view and clicks its centre with real mouse events |
| `jig_browser_type {ref \| selector, text, clear?, submit?}` | no | focuses the field (selecting its content unless `clear: false`), inserts the text, Enter with `submit` |
| `jig_browser_press {key}` | no | a key: Enter, Escape, Tab, ArrowDown, a letter… |
| `jig_browser_screenshot {fullPage?, sizes?}` | yes | PNG of the visible page, returned as an image: Claude sees it and the chat shows it. `fullPage`: the whole page (the window grows to the page's height, at most 8000 px, for the capture). `sizes: ["phone","tablet","desktop"]`: one image per size in one call, then the window goes back to its size. Images are at most 1280 wide and 7900 high |
| `jig_browser_console {errorsOnly?, clear?}` | yes | the console messages, most recent last |
| `jig_browser_eval {expression}` | no | evaluates an expression in the page and returns it as JSON |
| `jig_browser_resize {preset \| width, height}` | no | changes the window size |
| `jig_browser_navigate {action}` | no | back, forward or reload |

Read-only tools run without asking (D-077); the others follow the chat's permission mode. Element
numbers are `data-jig-ref` attributes written by `jig_browser_read`/`open`; they are renewed on every
read, so Claude reads again after the page changes.

Jig's system prompt addition (`jigContext`) tells Claude to use these tools to check web UI it builds,
together with `jig_terminal_run` for the dev server.

## Fake engine

`browse <url>` in a chat: the fake engine calls `jig_browser_open`, clicks element `[1]` if there is
one, and takes a screenshot; with "phone" in the message it also takes `sizes: ["phone","desktop"]`
(`e2e/browser.spec.ts`).
