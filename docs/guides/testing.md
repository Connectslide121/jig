# Testing Jig

| Kind | Tool | Where | Run |
|---|---|---|---|
| Unit | Vitest | `*.test.ts` next to the code (`packages/*`, `apps/desktop/src/main`, `scripts`) | `npm test` |
| End-to-end, what a change needs | Playwright + Electron | `e2e/*.spec.ts` | `npm run e2e:changed` |
| End-to-end, everything (releases) | Playwright + Electron | `e2e/*.spec.ts` | `npm run e2e` |
| Design tokens | `scripts/check-tokens.ts` | renderer + add-ons | `npm run check:tokens` |
| Before each commit (no tests, D-258) | — | — | `npm run verify` |
| Everything fast (releases) | — | — | `npm run check` |

## End-to-end tests

**When they run (D-258):** when releasing, or when Jon asks; not after each change.

**Two ways to run them (D-242).**

- `npm run e2e:changed` after a change: only the specs it needs, usually well under a minute. The
  changed files are your uncommitted ones plus commits not yet pushed (`-- --since <ref>` for another
  base; `-- --list` prints the choice without running). `scripts/e2e-select.ts` picks specs by the
  rules in `e2e/affected.json` (source folders → specs), by the `data-testid`s a changed view renders
  that a spec uses, and changed specs themselves; `smoke.spec.ts` always runs. Docs and unit tests run
  nothing; fixtures, the Playwright config, the preload and the IPC router run everything; a file no
  rule covers runs `fallback` and is named, so you can add a rule. A new spec needs a rule
  (`scripts/e2e-select.test.ts` fails otherwise, and when a rule's glob matches no file).
- `npm run e2e`, the whole suite: when releasing Jig (the release skill runs it). About 3–4 minutes.

Both build first only when the build is stale (`scripts/build-if-stale.ts` keeps a stamp of the
inputs in `apps/desktop/dist/.build-stamp`; `--force` rebuilds). Tests run side by side: one Electron
per worker, a third of the cores (2–16; `JIG_E2E_WORKERS=n` to change), every test in its own temporary
`JIG_HOME`. So a test must not depend on another or on timing: measure layout with `settledBox`
(after panels finish their motion), and give fake work that a test talks to while it runs enough time.
Keep tests short and focused (under ~30 s): the slowest single test sets how long the suite takes.

`e2e/fixtures.ts` launches the **built** app (`apps/desktop/dist`) with:

- a fresh temporary `JIG_HOME` per test (deleted afterwards),
- `JIG_ENGINE=fake`, so no Claude Code process is started and no quota is used,
- `JIG_HIDDEN=1`, so the windows never show: on a desktop they would take focus and the mouse could
  cancel a hover (`JIG_HIDDEN=` with an empty value to watch them). A hidden Jig sends no system
  notifications either (`notificationsAllowed`), which it otherwise would, being "in the background" Nor
  does it ask before closing or quitting during a meeting: it leaves the meeting, because a native
  question would pop up on the user's screen while agents run tests.

Tests that fake a home folder set `USERPROFILE`/`APPDATA` as well as `HOME` (Windows takes the home
folder from them), and fake programs on `PATH` also get a `.cmd` next to them (Windows runs no
shebang scripts).

Fixtures: `jigHome`, `app` (ElectronApplication), `page` (main window, waits for the UI).
`hostCall(page, method, args)` calls a host method and returns the raw `{ ok, value | error }`
envelope.

Both `vitest.config.ts` and `playwright.config.ts` remove `GIT_AUTHOR_*` / `GIT_COMMITTER_*` from the
environment (some CI and dev containers set them), so tests see the git identity they configure
themselves. A test that commits sets `git config user.name` / `user.email` in its repository.

`az` is faked by writing `fake-bin/az` (and a `.cmd`) in the test's `JIG_HOME`: the fixture puts that
folder first on `PATH` (`e2e/workflows.spec.ts` fakes a finished pipeline this way). Add-on watchers
can be run at once with `hostCall(page, "addons.call", { id, method, args })`.

On Linux without a display, run under Xvfb: `xvfb-run -a npx playwright test` (after `npm run build`).
On Linux as root, Electron needs `--no-sandbox` (the fixture adds it on Linux).

## The fake engine

`JIG_ENGINE=fake` (always on in e2e tests) replaces Claude Code with a script
(`apps/desktop/src/main/engine/fake.ts`). It stands in for both chat providers (D-309):
`getEngine("codex")` is a second `FakeEngine` with `provider: "codex"` and Codex's capabilities, so
Codex chats run the same script. Its saved Claude Code chats (Open a Claude Code chat…,
D-150) are two scripted ones: "Fix the cart total" (`saved-1`, with a transcript: a reminder,
your message, a reply with an Edit, a subagent's message, the result, a last reply) and "Plan the
checkout", in `JIG_FAKE_SAVED_CWD` (your home folder by default). Standing in for Codex it has one saved
thread instead, "Tidy the README" (`codex-thread-1`: your message with Jig's plan-mode text, a command, a
file change with its diff and a reply), read through the same conversion as real Codex threads (D-315). What it does depends on the message. The first match wins,
in this order:

| Message | What happens |
| --- | --- |
| contains "login" (first message) | acts like a Claude Code that isn't signed in |
| `/compact …` | compacts the conversation (context drops to 21k tokens) |
| `/name …` | a Claude Code command prints its output; a skill (`/explain-code`) answers like Claude |
| a message whose Jig context names a mentioned meeting (`@meeting:…`, D-250) | reads it with `jig_meeting_read` and answers "From the mentioned meeting:" with the start of its transcript |
| "skip the report" / "skip two reports" | Claude ends its turn without reporting ("Waiting for the local server to come up."); with "two" it also answers the queue's first request for the report without one (D-318) |
| the task queue's request for a report ("The task queue asks for the report of task N … taskId "tN" …") | Claude reports "done" with that `taskId` (late when the task ended already) |
| a task from the Tasks queue (its context names `addon_tasks_report`), unless it says "skip the report" | Claude reports with `addon_tasks_report`: "done" with the summary "Did it: <message>" (without the "[1 image]" tags of its files), or "failed" when it says "fail this task"; one note; a follow-up when it says "with follow-ups" |
| `call <tool> over mcp` (optionally `with {json}`) | calls one of the chat's Jig tools the way Codex does (D-313): over the chat's own local MCP server (HTTP on 127.0.0.1 with its token, through the official MCP client). Read-only tools run unasked, others ask first unless the chat bypasses permissions; the result (with images) shows on the tool card, then "I called <tool> over Jig's MCP server." |
| "azure tenant(s)" | Claude lists the Azure tenants with `jig_azure_tenants`; with "switch … to X" it then asks to switch with `jig_azure_switch_tenant` (an approval, unless the chat bypasses permissions) and says which tenant is in use |
| "queue tasks for" | Claude asks to queue two tasks (Contoso spec, Fabrikam spec) with the Tasks add-on's `addon_tasks_add` (an approval drawn by the add-on as an editable list; queues what you approved, unless the chat bypasses permissions) |
| starts with "Test this in Claude's browser" (Search → Test something…) | a short report naming the chat's model and its subagents ("Test report (model haiku; subagents: jig-tester, jig-search)"); its PASS/FAIL wording doesn't end the turn with an error |
| contains "routine" | Claude creates the routine "Daily standup notes" (RemoteTrigger, after the permission card) |
| "publish an artifact" | writes `release-notes.html` and publishes it (Artifact tool, a fake claude.ai link) |
| "use a skill" | Skill `explain-code`, Read `README.md`, the MCP tool `mcp__github__list_issues`, the Releases add-on's tool `mcp__jig__addon_releases_overview`, then a short answer (the chat overview test) |
| "todo list" | three TodoWrite updates, all done at the end |
| "make a plan" (or a message starting "go ahead") | a plan to approve (ExitPlanMode); the reply says the mode after approval. In a Codex chat the plan goes through Jig's `exit_plan` tool over the chat's local MCP server, which raises the same card (D-315) |
| "look at the code" | searches (Grep) and reads `cart.ts` (Read), slowly, pauses (the steps line says Working), then asks a question: Claude looking at the code while you talk (D-210) |
| "subagent" | a Task with a nested Grep and progress (tool uses, tokens, time) |
| "background job" | a Bash command that keeps running in the background (Stop ends it) |
| "edit <file>" | edits the file's first line; the card shows the diff |
| "theme", "light mode", "dark mode", "terminals to the right" | Claude changes Jig's settings or layout (change cards with Undo) |
| "by hand on the vm" | Claude saves a note (`jig_note_evidence`): a "Noted for suggestions" card with Remove |
| "weekly check-in", "profile interview" | Claude reads the profile and adds a line under "How I release and deploy" (`jig_update_profile`, card with Undo) |
| "as a workflow" | Claude saves a 4-step workflow "Write release notes" in the chat's project (`addon_workflows_save`) |
| "since the last release" | Claude calls the Releases add-on's tool `addon_releases_changes` for the chat's repository |
| "list jig library skills" | Reports the skill plugin ids actually selected at engine start; used to verify global/project controls and continuing chats |
| "in a jig terminal" | Claude runs `echo build finished` in a Jig terminal (`jig_terminal_run`); when it exits, Jig sends the chat a "Terminal "Build" finished" message, which starts a new turn |
| "run the unit tests" | Claude lists the project's test suites (`addon_tests_list`) and runs `npm:test` (`addon_tests_run`); the run shows in the Tests view (D-244) |
| "remember in the notes" | Claude adds a project dependency about deferring pipeline improvements until migration, using `jig_notes_add`; all chats in that project see it |
| "change the queued task" | Claude appends "Don't run the e2e tests." to queued task `t1` with `addon_tasks_edit` (only queued tasks; the queue's state is left alone) |
| "move the queued task" | Claude moves queued task `t2` to the top of the queue, in a chat of its own, with `addon_tasks_edit` (`moveTo`, `newChat`) |
| "in the releases data" | Claude looks at the Releases add-on (`jig_get_addon`) and saves `fake-note` in its data (`jig_set_addon_data`, card with Undo) |
| "add the stage links" | Claude adds a Stage group with the stage site and resource group (`jig_add_project_links`) |
| "make a project for this chat" | Claude lists projects, creates "Fake project" (plan mode) and moves the chat into it, pinned (`jig_list_projects`, `jig_create_project`, `jig_move_chat`) |
| "pipelines below git" (or "under") | Claude shows Pipelines in the lower half of Git's sidebar (`jig_change_layout` op `below`) |
| "browse <url>" | Claude's browser opens the page, clicks `[1]`, takes a screenshot; with "phone" also one at phone and desktop sizes; with "requests" or "network" it reads the network log (all, then failed ones); with "read it again" it reads the page after the click (a page that hangs on it, `e2e/browser-hangs.spec.ts`). The browser's waits run with `JIG_BROWSER_TIMEOUT_SCALE` (0.2 in that spec: load 6 s, page script 3 s, whole call 12 s) |
| "read the browser page" | Claude reads its own chat's page of Claude's browser (`jig_browser_read`) and answers "My page: Page: …" with the first line, the page's title and address: two chats on separate pages (D-320, `e2e/browser-pages.spec.ts`) |
| a path ending in an image extension | a Read of that image (thumbnail in the card) |
| contains "run" or "permission" | asks to run `npm test` (permission card) |
| contains "several questions" | asks three questions in steps (one choice, several choices, one to answer in your own words); the reply lists the answers joined by " \| " |
| contains "question" | asks a multiple-choice question. In a Codex chat both question rows go through Jig's `ask_user` tool over the chat's local MCP server, which raises the same card (D-315) |
| "write <file>" | writes the file (a file checkpoint: Restore files puts it back) |
| contains "build" | asks Jig's builder for a tool (`jig_request_build`) |
| contains "slow" | a long streamed answer (try Stop) |
| anything else | a short Markdown answer that repeats your message, with a code block |

More behaviour:
- **Turn endings:** "fail" ends the turn with an error. "big file" adds 130k tokens to the context
  (9k otherwise).
- **Suggestions:** from the second turn on, it suggests a next message.
- **Per-model usage:** every result reports the chat's model with 120 tokens and $0.01 per turn so
  far (`modelUsage`).
- **Messages sent with Ctrl+Enter during a turn:** they get "Noted while working: …".
- **Commands, models and MCP servers:** canned lists (`/usage`, `/explain-code`; models with effort
  levels; `github` connected and `jira` needing sign-in).
- **One-shot questions:** answers for attempts judging, tours, the pre-commit check, standups,
  commit messages and release drafts (bump, changelog, one note for customers). The reflection
  answers a `practice` pattern with a "better practice" suggestion (D-213), a `habit` pattern with a
  prompting tip whose `example` is a rewritten prompt (D-214), any other pattern with a
  new-add-on suggestion, and a `manual-work` note (without patterns) with a workflow suggestion plus
  a profile update.
- **The builder:** its sessions run a scripted build (`fakeBuilder.ts`). A goal with "jig itself" or
  "source" ends in a development request (title, user story, acceptance criteria, a small mockup);
  feedback on it ("Change the request") gives version 2, with the feedback in the mockup (`#change`).
- **Dictation (D-208):** with `JIG_ENGINE=fake` Chromium uses a fake microphone and Jig a fake
  transcriber: the model "download" goes 0 → 50 → 100 % without network, and every recording
  becomes "Hello Claude, this came from the microphone." (also every live pass while speaking).
- **Talking with Claude (D-209):** in fake mode the conversation doesn't listen to the microphone;
  `window.dispatchEvent(new CustomEvent("jig-fake-speech", { detail: "…" }))` is "you said …".
  Speaking is pretended (300 ms per sentence); the last sentence is on the button's `data-said`.
- **Guarded tool calls (Routines and Artifacts tabs):** answered by a scripted "cloud"
  (`fakeCloud.ts`) with two routines, one past run and two artifacts.

`JIG_MAIL_OUT=<folder>` makes **Email to developers** save the zip there (instead of Downloads) and
write the `mailto:` link to `mailto.txt` instead of opening a mail app. `JIG_FAKE_DELAY` sets the per-word delay (ms), `JIG_FAKE_ONESHOT` a fixed one-shot answer, and
`JIG_FAKE_USAGE` the plan usage (`unavailable` or JSON), `JIG_FAKE_CHATGPT_USAGE` ChatGPT's
(`signedout` or JSON; default a Plus plan at 27 % / 64 %).

Code completion with Claude (D-255) uses the fake engine's `completer`: after `return ` at the caret it
suggests `total;`, anywhere else `// suggested by the fake engine`. A caption to translate (D-277)
comes back as `[<language>] <caption>`. The meetings test service rings for
a Teams call when a test calls `window.jigTestRing(name)` in the meetings window (D-254). It has three
Teams chats (D-296): an unread one-to-one with Alex, a "Portal planning" group and a one-to-one with
Sam; Call… → Chat finds Alex's and Sam's, anyone else has none. Messages you send are kept while Jig runs.

## Screenshots

`e2e/screenshots.spec.ts` regenerates the pictures of the "What Jig can do" page and the README
(skipped unless `JIG_SCREENSHOTS=1`; see `docs/reference/about.md`).

## Rules

- Never use real Claude credentials in tests — use the fake engine.
- Host modules that touch state are tested with a temporary `JIG_HOME` (the Vitest config sets one
  for every test, so nothing reaches the real `~/.jig`).
- A bug fix comes with a test that fails without it.

Settings model discovery uses the fake engine’s canned model list (now including Sonnet), without creating a chat or using credentials.

## Meetings

Set both JIG_ENGINE=fake and JIG_MEETINGS=fake for the isolated meeting service; fake engine alone
never authorises a real meeting. e2e/meetings.spec.ts creates temporary Shop/Portal projects, joins
a fake calendar meeting, verifies capture across project switches, modal geometry, caption revision
merging, credential sender restrictions, sharing controls, notes and paused cross-project queueing.
The join-by-link regression checks joining without an acknowledgement, invalid-link errors inside the modal and
unchanged modal geometry; `join-error.png` captures that state. A second test uses the real SDK with
media permission explicitly denied and no account: its microphone error and retry must appear in
the modal (`device-error.png`), proving SDK initialization passes the production-origin check.
No real Azure sign-in, microphones, cameras, speakers or billable call is used. Unit tests cover link
validation, ordering/finals, snapshot isolation, atomic concurrent writes, restart interruption,
media origin checks and idempotent reviewed task addition. The room screenshot is saved under
.jig-test-home-meeting-screenshots/meetings.png (separate from other concurrent test results).

| Fake-engine trigger | Behaviour |
|---|---|
| Question about meeting …, captured through … | Calls jig_meeting_read with the immutable cutoff and answers with the transcript |
| Same trigger containing "Write meeting notes" or "Write concise meeting notes" | Reads the snapshot, calls jig_meeting_save_notes with two owner/project actions; queues nothing |
