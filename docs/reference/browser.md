# Browser

## Your browser (D-225)

**The globe icon at the top right** (also Tools → Open Browser or Ctrl+K → Open Browser) opens a Browser tab in the main panel.
It is a native Chromium `WebContentsView`: direct rendering and native mouse, keyboard, selection,
clipboard and IME, without compressed frames or forwarded input. The toolbar offers address entry,
Back/Forward, Reload/Stop, detached Developer tools and Open in default browser. Ctrl/Cmd+L focuses
the address, Ctrl/Cmd+R or F5 reloads, Alt+Left/Right navigates history, and Ctrl/Cmd+plus/minus/0 zooms.
A fixed-height status row shows the title or load failure without moving the page.

Main owns one user page per workbench window (`main/browser/userBrowser.ts`). The isolated persistent
partition `persist:jig-user-browser` holds cookies separately from both Jig and Claude. There is no
preload or Node access; sandbox and context isolation stay enabled. Navigation and redirects allow
http(s), file and about:blank only; popups open in place. Downloads use Chromium's save flow;
camera, microphone, location and other permission requests remain denied. Claude's tools cannot read
or drive this page. Closing its tab hides it; reopening keeps the page and history for that window.
Closing the workbench destroys its native WebContents.

`UserBrowserView` reports the reserved page slot's bounds and visibility only when they change.
Main converts CSS coordinates using the workbench zoom, clips them to the content area, and sets the
native view bounds. Hidden tabs and Jig dialogs/menus hide the surface, keeping DOM overlays usable.
The page stays at the slot's real size; no scaled screenshot is used. The native view is documented
by [Electron](https://www.electronjs.org/docs/latest/api/web-contents-view).

## Claude's browser

Claude’s browser uses the MonitorCog icon in its tab, menu and empty state; your browser uses Globe.

Code: `apps/desktop/src/main/browser/` (pages, service, tools, page scripts),
`apps/desktop/src/shared/browser.ts` (types), `apps/desktop/src/renderer/features/browser/` (the view).
Decisions: D-090, D-095, D-319, D-320.

Claude checks its own web work in a real Chromium page inside Jig. **Each chat has its own page**
(D-320), so chats browsing at the same time never get in each other's way. A page is offscreen with
its own size: the **Claude’s browser** view (right sidebar; Search → Open Claude’s browser) only shows a
scaled picture of it, so the view's size never limits Claude, and resizing never moves anything on
screen. The view opens by itself when a chat starts browsing, except while you work on another tab
of its panel: then its tab gets a badge (the number of chats that browsed) until you look (D-349). Turn off Settings → Chats → **Show
Claude’s browser when it's used** (`browser.showWhenUsed`, on by default) to keep it closed. You can
take over inside a page for sign-ins and other steps Claude needs your help with. The address is
read-only; there are no user Back/Forward, Reload, viewport or test-launch controls in this view.
A permanent hint at the bottom explains who controls it and links to **open Browser** for personal browsing.
Console and Network remain available for inspection (D-226).

## One page per chat (D-320)

- **Made on first use, keyed by the chat.** A chat's first `jig_browser_*` call makes its page
  (`main/browser/pages.ts`, `BrowserPages`); every later call of that chat acts on it. A jig-tester
  subagent calls through its parent chat's tools, so it uses the parent's page. Test something… starts a
  new chat, which opens the address in a page of its own.
- **Per page:** the element numbers from `jig_browser_read`/`open`, the console and network lists,
  the window size, the crash/recovery notice and the live frames.
- **Closed** when the chat is archived or deleted, from the tab's ⋯ → **Close page**, after
  **15 minutes** without a tool call or your input while no view watches it (`IDLE_MS`), and when a
  fifth chat needs a page: at most **4** are open (`MAX_PAGES`), so the one used least recently (and not
  being driven) closes. The chat's next browser call starts with a note saying why ("Your page of
  Claude's browser was closed after 15 minutes unused; open it again with jig_browser_open"), and
  works on a new blank page.
- **Sessions** (`browser.pageSessions`, Settings → Chats → **Chats’ pages in Claude’s browser**):
  - `shared` (the default): every page uses the `persist:jig-browser` session, so cookies, logins
    and storage are shared. You sign in to your dev server once and every chat (and test chat) is
    signed in. **A logout in one chat logs out the others**, and two chats signed in as different
    users replace each other's session cookie; Claude is told not to log out unless the task needs it.
  - `separate`: each page gets an in-memory session of its own (`jig-browser-chat-<id>`), fully apart
    and gone when the page closes. Applies to pages opened after the change.
- **Requests reach their page:** a session takes one `webRequest` listener per event, so `pages.ts`
  installs one set per session (with the download and permission refusals) and hands each request to
  the page whose WebContents made it (`webContentsId`); one without an id goes to the session's only
  page, or nowhere when several share it.

## The view: one tab per page

A strip of tabs as tall as the main area's sits above the address row, one per open page, each on
one line: the chat's name with its project swatch and a pulsing dot at the right while the chat drives
the page (a tool call runs, or ended less than 5 s ago). The page title is in the tab's tooltip and
the address row, not on the tab. Tabs have a fixed width (narrower in a
sidebar than in the bottom panel or a main-area tab, by the view's container width) and truncate;
the strip keeps its height when there are none ("Each chat that browses gets its own page here"), so
opening or closing a page never moves the picture below. The strip scrolls sideways with an overlay
scrollbar like the main tab strip. Clicking a tab shows that page's live picture, address, Console and
Network. The tab of the chat in front is selected by default, else the page used last; a clicked tab
stays until another chat comes to the front. A tab's ⋯ (and its context menu) has **Open chat** and
**Close page**. The view watches only the shown page, so only that page makes frames.

## How it works

- **A page, owned by the main process:** a hidden, offscreen `BrowserWindow` per chat, created on first
  use.
  - It is marked as a helper window (`main/appWindows.ts`), so it never receives Jig's events, never
    counts for focus, notifications or "all windows closed", and is destroyed with the last real
    window.
  - Its session (`persist:jig-browser`, or the chat's own with `browser.pageSessions: separate`)
    keeps cookies and storage apart from Jig's; `sandbox`, `contextIsolation`, no Node and no preload.
  - Downloads are cancelled and permission requests (camera, microphone, location, notifications…)
    are denied. Pop-ups (`window.open`, `target=_blank`) open in the same page.
  - It opens only `http:`, `https:` and `file:` URLs. `localhost:5173` becomes `http://localhost:5173`;
    a host name without a scheme becomes `https://`.
- **Live view:** while a view shows a chat's page (`browser.watch {chatId, on:true}`), that page's
  painted frames go to it as JPEG (`browser.frame {chatId,…}`), at most 10 per second and always the
  last one. Nothing is encoded for a page nobody watches.
- **Taking over:** clicks, the wheel and keys on the picture are mapped to page pixels (through the
  letterboxing) and sent as real input events (`browser.input`). Printable characters are inserted as
  text, and Ctrl/Cmd shortcuts stay Jig's.
- **Console:** console messages and failed loads are kept (the last 300). The view shows the number of
  errors; the terminal icon opens the list in a resizable pane. Electron's own development warnings
  are left out.
- **Network** (Learning 2f, D-111): the page's requests from the browser session's `webRequest`
  events (every request, whatever renderer process the page is in, routed to its page as above): method, URL, type, status, time,
  size and headers, the last 300. Response bodies come from Chromium's DevTools protocol
  (`webContents.debugger`, `Network.getResponseBody`), enabled on a blank page before the first
  navigation so the first page's requests are seen from their start. Credential headers (`Authorization`, `Cookie`, `Set-Cookie`, API keys) are replaced by
  `«redacted»`; response bodies are fetched only when asked (at most 20k characters, while Chromium
  still has them). The view's Network button lists them (click one for headers and body); a badge
  counts failed requests and HTTP errors.
- **Never waits for ever (D-319, `deadline.ts`):** a load stops after 30 s (`jig_browser_open` says
  "The page didn't finish loading in 30 s (still loading: <url>)…"), a script in the page
  (read, click, type, eval, measuring a full page) gives up after 15 s, a screenshot after 15 s, then
  `invalidate()` and 15 s more. Every tool call has a 60 s backstop and ends when the chat is stopped
  or the turn interrupted (the call's `AbortSignal`, below). A result says how long it took from 3 s
  on (`(took 12 s)`).
- **Dialogs answer themselves:** a script added through DevTools before the page's own
  (`Page.addScriptToEvaluateOnNewDocument`, `DIALOG_SCRIPT`) makes `alert` return, `confirm` return
  OK and `prompt` return its default text; a dialog that still opens is accepted through
  `Page.javascriptDialogOpening`. `beforeunload` ("Leave site?") is left anyway (`will-prevent-unload`).
  Each one is a console warning (`alert: Saved (answered OK automatically)`).
- **Crashes and stuck pages:** on `render-process-gone` or `unresponsive`, or when a script times out
  and even `1` doesn't answer in 3 s, the page is replaced by a new one (the old renderer is killed)
  that loads the same address again, once per minute: the same address failing again stays blank.
  Waits on the old page stop at once; the call (or the next one) starts with what happened ("The page
  stopped responding …; it was reloaded (<url>)"), and the console has an error line for it.
- **main.log:** browser calls of 10 s or more, every timeout, crash, recreated page and answered
  dialog (the kind only, never the page's text or contents).
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
| `jig_browser_network {filter?, errorsOnly?, id?, clear?}` | yes | the requests (`#id GET 200 fetch 12ms /api/cart`); with `id`, one request's headers and bodies |
| `jig_browser_eval {expression}` | no | evaluates an expression in the page and returns it as JSON |
| `jig_browser_resize {preset \| width, height}` | no | changes the window size |
| `jig_browser_navigate {action}` | no | back, forward or reload |

Read-only tools run without asking (D-077); the others follow the chat's permission mode. Element
numbers are `data-jig-ref` attributes written by `jig_browser_read`/`open`; they are renewed on every
read, so Claude reads again after the page changes.

Every tool acts on the calling chat's own page; names and arguments are the same as before D-320.
Jig's system prompt addition (`jigContext`) tells Claude to use these tools to check web UI it builds,
together with `jig_terminal_run` for the dev server, that the page is the chat's own (its jig-tester
subagents share it), and that pages share logins by default, so it shouldn't log out unless needed.

## Fake engine

`browse <url>` in a chat: the fake engine calls `jig_browser_open`, clicks element `[1]` if there is
one, and takes a screenshot; with "phone" in the message it also takes `sizes: ["phone","desktop"]`
(`e2e/browser.spec.ts`). With "read it again" it also reads the page after the click
(`e2e/browser-hangs.spec.ts`: a load that never finishes, `alert`/`confirm` on load, a click that
loops for ever, with `JIG_BROWSER_TIMEOUT_SCALE=0.2`). `read the browser page` reads the chat's page
again and answers "My page: Page: …": two chats on separate pages, their tabs, Close page and a
deleted chat's page closing (`e2e/browser-pages.spec.ts`).
