# Testing Jig

| Kind | Tool | Where | Run |
|---|---|---|---|
| Unit | Vitest | `*.test.ts` next to the code (`packages/*`, `apps/desktop/src/main`, `scripts`) | `npm test` |
| End-to-end, what a change needs | Playwright + Electron | `e2e/*.spec.ts` | `npm run e2e:changed` |
| End-to-end, everything (releases) | Playwright + Electron | `e2e/*.spec.ts` | `npm run e2e` |
| Design tokens | `scripts/check-tokens.ts` | renderer + add-ons | `npm run check:tokens` |
| Add-on imports stay in `addons/` (D-415) | `scripts/check-addon-imports.ts` | add-ons | `npm run check:addon-imports` |
| Before each commit (no tests, D-258) | — | — | `npm run verify` (2-8 s on a small change, D-421) |
| Everything fast (releases) | — | — | `npm run check` |

## End-to-end tests

**When they run (D-258, D-331, D-420):** `npm run verify` once before each commit; the specs a task's
changes affect **once, at the end of the task** (`npm run e2e:changed`, when it touched the app or a
spec), before its last commit or report. It covers every change since the last passing run (D-357),
so the commits before it need no run of their own; what fails is fixed in a follow-up commit. Run it
earlier only when a change is risky and the next steps build on it. The whole suite runs only when
releasing; anything else when Jon asks. In Jig, run it through the Tests add-on (`addon_tests_run`,
then `addon_tests_wait` with the run id, D-359), never in a chat's own shell or with `sleep` loops
polling a log.

**One e2e run at a time on the computer (D-420).** `npm run e2e`, `npm run e2e:changed` and a plain
`npx playwright test` (the config's `globalSetup`, `e2e/global-setup.ts`) take a lock
(`scripts/e2e-lock.ts`, a file in the temp folder) before building and running. A run started while
another holds it prints "Waiting for another e2e run to finish (…)" (the Tests view shows the run as
waiting, with an hourglass) and starts by itself when that one ends; a lock whose process is gone is
taken over. Two runs at once took as long as taking turns but made tests flaky (measured: two
19-spec runs side by side ~230-245 s each, with 1-5 failed or flaky tests; one alone 161 s). Only e2e
runs take it: Jig's browser and each chat's page are not affected. The lock owner also ends test
Electrons a killed run left behind (their Playwright worker gone), which otherwise kept gigabytes of
memory.

**Two ways to run them (D-242).**

- `npm run e2e:changed` at the end of a task: only the specs its changes need, a few minutes at most. The
  changed files are those that differ from the source the last passing run tested (D-357): a
  passing `e2e:changed` records the working tree it ran on (untracked files included) in
  `.jig-e2e-changed.json`, a passing whole suite its commit in `.jig-e2e-passed.json`, and the newer
  one is the base; with neither, only your uncommitted changes count. So a commit that touched a
  file every spec depends on doesn't pull the whole suite into every later run of the session. It
  prints the base it used. `-- --since <ref>` diffs from a ref instead (`-- --since origin/main`:
  everything not yet pushed, the old behaviour); `-- --list` prints the choice without running or
  recording. `scripts/e2e-select.ts` picks specs by the
  rules in `e2e/affected.json` (source folders → specs), by the `data-testid`s a changed view renders
  that a spec uses, and changed specs themselves; `smoke.spec.ts` always runs. Docs, unit tests, the
  root `package.json` (scripts; a dependency change also changes the lock file) and a release's version
  bump (only `"version"` lines in the package files, D-420) run nothing; fixtures, the Playwright
  config, `package-lock.json`, the preload and the IPC router run everything; a file no
  rule covers runs `fallback` and is named, so you can add a rule. A new spec needs a rule
  (`scripts/e2e-select.test.ts` fails otherwise, and when a rule's glob matches no file).
- `npm run e2e`, the whole suite: only when releasing Jig (the release skill runs it; failures are
  fixed there, by its "When tests fail"). About 3–4 minutes.
  When it fails on a clean checkout it records the failed specs; `npm run e2e -- --resume` (what the
  release runs) then reruns only those and the specs the commits since need (D-325).

Both build first only when the build is stale (`scripts/build-if-stale.ts` keeps a stamp of the
inputs in `apps/desktop/dist/.build-stamp`; `--force` rebuilds), and so does a plain `npx playwright
test` (its `globalSetup`, D-421): about 0.4 s when the build is fresh, a build (~8 s) when sources changed.

**Rerunning one failing spec while you fix it** (the fastest correct way, D-421):

```bash
npx playwright test e2e/files.spec.ts -g "opens a file"   # one test, by (part of) its title
npx playwright test e2e/files.spec.ts                      # the whole spec
npx playwright test e2e/files.spec.ts:42 --retries=0       # the test at that line, failing on the first try
```

It takes the e2e lock and builds only when stale, like the runs above; `--retries=0` skips the second
try of a failing test. It records nothing, so it's for the fix loop only: the task's `npm run
e2e:changed` at the end still runs (in Jig through the Tests add-on).

Tests run side by side: one Electron
per worker, a fifth of the cores that are free when the run starts (2–8, D-420; each Electron keeps
about three cores busy, and more workers only made every test slower: on 40 cores a 19-spec run took
161 s with 8 workers, 180 s with 13, 186 s with 5; `JIG_E2E_WORKERS=n` to change), every test in its
own temporary `JIG_HOME`. So a test must not depend on another or on timing: measure layout with `settledBox`
(after panels finish their motion), and give fake work that a test talks to while it runs enough time.
Keep tests short and focused (under ~30 s): the slowest single test sets how long the suite takes.

`e2e/fixtures.ts` launches the **built** app (`apps/desktop/dist`) with:

- a fresh temporary `JIG_HOME` per test (deleted afterwards),
- `JIG_ENGINE=fake`, so no Claude Code process is started and no quota is used,
- `JIG_HIDDEN=1`, so the windows never show: on a desktop they would take focus and the mouse could
  cancel a hover (`JIG_HIDDEN=` with an empty value to watch them). The workbench window is still put
  on screen where nobody sees it (`showUnseen`: transparent, far off the desktop, never focused, not
  on the taskbar), because Chromium draws a window that was never shown only about once a second;
  this way it draws at full speed and nothing waits for a frame (D-358). Its pages are never
  throttled as background pages either. So the UI reacts as fast as on your screen: wait for the
  state you need (a saved layout, a turn that ended, a shell's prompt), never for a moment to pass. A hidden Jig sends no system
  notifications either (`notificationsAllowed`), which it otherwise would, being "in the background" Nor
  does it ask before closing or quitting (an active meeting, add-ons' quit guards, D-343): it just
  quits. `JIG_ASK_BEFORE_QUIT=1` makes a hidden Jig ask in its quit modal anyway
  (`e2e/quit-guard.spec.ts`).

Tests that fake a home folder set `USERPROFILE`/`APPDATA` as well as `HOME` (Windows takes the home
folder from them), and fake programs on `PATH` also get a `.cmd` next to them (Windows runs no
shebang scripts).

Fixtures: `jigHome`, `app` (ElectronApplication), `page` (main window, waits for the UI with its
layout loaded).
`hostCall(page, method, args)` calls a host method and returns the raw `{ ok, value | error }`
envelope.

Both `vitest.config.ts` and `playwright.config.ts` remove `GIT_AUTHOR_*` / `GIT_COMMITTER_*` from the
environment (some CI and dev containers set them), so tests see the git identity they configure
themselves. A test that commits sets `git config user.name` / `user.email` in its repository.

`az` is faked by writing `fake-bin/az` (and a `.cmd`) in the test's `JIG_HOME`: the fixture puts that
folder first on `PATH` (`e2e/workflows.spec.ts` fakes a finished pipeline this way). Add-on watchers
can be run at once with `hostCall(page, "addons.call", { id, method, args })`.

On Linux without a display, run under Xvfb: `xvfb-run -a npx playwright test`.
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
| contains "hit the limit" | says "Starting on it.", then the chat's provider reports its plan limit (Claude's "You've hit your limit…", ChatGPT's "ChatGPT's limit is reached…"), resetting in 2 h 13 min: the limit card (D-338) |
| starts with Jig's handoff (`<jig-handoff>`, a chat that continued with the other provider) | first says "Picked up from the handoff: “<the goal>”." (the handoff is left out of the matching, like add-ons' context). After a limit (D-338, `e2e/limit-handoff.spec.ts`) or a handover by hand: the first message you send after Hand over in the handover dialog (D-339, `e2e/handover.spec.ts`) |
| contains "hold until released" (anywhere, also in a task's prompt) | after its thinking, says "Working…" and keeps the turn running until the test calls the host's `fake.release` (`{ match? }`: the held turns whose message contains it, or all; answers how many) or the turn is stopped; then it goes on with the rest of the script (a task's chat still reports). For looking at a view mid-turn, e.g. a Running task. Closing the app during a held turn cuts it off (`cutOffAt`): after a relaunch the task queue tells the chat to carry on, and it reports (`tasks.spec.ts`, D-394) |
| `/compact …` | compacts the conversation (context drops to 21k tokens) |
| `/name …` | a Claude Code command prints its output; a skill (`/explain-code`) answers like Claude |
| a message whose Jig context names a mentioned meeting (`@meeting:…`, D-250) | reads it with `jig_meeting_read` and answers "From the mentioned meeting:" with the start of its transcript |
| a message whose Jig context names a mentioned Teams chat (`@chat:…`, D-333) | reads it with `jig_teams_chat_read` and answers "From the mentioned Teams chat:" with the start of what it read |
| "report the task as done" / "report task tN as failed" (any outcome) | Jig reports again with `addon_tasks_report` (D-353): to the chat's last reported task, or with that `taskId`; summary "Reported again: <outcome>"; the tool's error (another chat's task) is the answer |
| a one-shot that starts "You organize a queue of prompts" (Tasks → Reorganize, D-397) | each block of its task list reversed, the second task of each block continuing the first's chat, a reason on each (`tasks-reorganize.spec.ts`) |
| a queued task that says "only partly" | its report is "partial" instead of "done" |
| "skip the report" / "skip two reports" | Jig ends its turn without reporting ("Waiting for the local server to come up."); with "two" it also answers the queue's first request for the report without one (D-318) |
| the task queue's request for a report ("The task queue asks for the report of task N … taskId "tN" …") | Jig reports "done" with that `taskId` (late when the task ended already) |
| a task from the Tasks queue (its context names `addon_tasks_report`), unless it says "skip the report" | Jig reports with `addon_tasks_report`: "done" with the summary "Did it: <message>" (without the "[1 image]" tags of its files), or "failed" when it says "fail this task"; one note; a follow-up when it says "with follow-ups". In a ChatGPT (Codex) chat the report goes over the chat's local MCP server, as Codex calls it, and the answer is "Reported from ChatGPT." (D-330) |
| a Factory stage message (`[factory stage <recipe> run <id>]`, D-426) | the stage plays its recipe without AI (`engine/fakeFactory.ts`): calls `addon_factory_brief`, writes every file of the prompt's "## Write" list into the run's folder (the demo copies `addons/factory/fixtures/demo/index.html`; directions add three SVGs; other `.html` files get a one-heading page, `.png` files a 1×1 image, the teaser a two-scene storyboard, D-467) and reports with `addon_factory_report`. The critique fails v1 (`quality` pass false, score 62, two fixes) and passes v2 and later (86). The interview posts two rounds of question cards (`addon_factory_questions`: 3, then 2), writes half of `brief.md` (Problem to Main flow, 4/9) after round 1 and, after `[factory answers … round 2]`, the whole brief from `input/idea.md` (level L1 with `levelWhy`, languages `docs: en, sales: sv, …`, one open point); after `[factory answers … round N enough]` (Good enough) at once, with Out of scope empty and two open points (8/9) |
| a change request's intake (`Track: change-request` in the stage's brief, D-471) / a tender's T1 | the intake posts two question cards, then writes the CR (`brief.md`: customer Contoso, ticket SUP-12; `critical: true` when the ticket says `[critical]`); the tender analyst writes `tender/matrix.json` with R1–R5, one of each status, ISO 27001 (`cert:iso-27001`) not met and turnover unknown, so two tenders make both recurring gaps |
| `[fail <recipe>]` / `[noreport <recipe>]` / `[hold <recipe>]` / `[ask <recipe>]` in a factory run's brief | once per run and recipe: that stage reports `failed` (the retry), ends its turn without a report (the nudge), holds until released (a restart in the middle), or asks a question with `addon_factory_ask` and ends its turn (your answer resumes it) |
| `[factory nudge …]` / `[factory resume …]` | the stage writes the files its brief lists ("## You write") and reports |
| a Motion render (`addons/motion`, D-463) | no HyperFrames or FFmpeg: the render ticks five times (250 ms) and writes a tiny MP4 and poster; Install writes `.fake-installed` in Motion's renderer folder. `[hold]` anywhere in the video (a title) holds the render until it's cancelled. M2: **Speak** gets fake silence from `api.speech.say` (its length from the text); **Record a capture** really records the page in a hidden window, but writes a tiny MP4 instead of encoding the frames, and the sound mix is skipped |
| "make a teaser video" / "change the video" / "render the video" / "compose the video" (D-465, D-474) | writes `screen.png` and makes "Shop 2.0" with `addon_motion_create` (title, a feature scene with the screenshot, an outro with a voice script): "Made the teaser."; "change the video" finds it with `addon_motion_list`, then `addon_motion_update` with the title "Shop 2.0 is here" and a bullets scene added (4 scenes): "Changed the video."; "render the video" renders the last one ("Rendering the video." or the tool's message); "compose the video" gives the last one a free composition with `addon_motion_compose` (two clips, the first linked to `s1`): "Composed the video." |
| `call jig_search_code over mcp with {"question":"…"}` / `call jig_test_page over mcp with {"url":"…","steps":"…"}` in a ChatGPT chat | the helpers (D-337) answer at once without Codex: "Fake search (<model>, <thoroughness>): <question>" and "Fake test (<model>) of <url>:" with "- PASS: <first step>"; `<model>` is the resolved search/tester model (fallback included) |
| `call <tool> over mcp` (optionally `with {json}`) | calls one of the chat's Jig tools the way Codex does (D-313): over the chat's own local MCP server (HTTP on 127.0.0.1 with its token, through the official MCP client). Read-only tools run unasked, others ask first unless the chat bypasses permissions; the result (with images) shows on the tool card, then "I called <tool> over Jig's MCP server." |
| "azure tenant(s)" | Jig lists the Azure tenants with `jig_azure_tenants`; with "switch … to X" it then asks to switch with `jig_azure_switch_tenant` (an approval, unless the chat bypasses permissions) and says which tenant is in use |
| "queue tasks for" | Jig asks to queue two tasks (Contoso spec, Fabrikam spec) with the Tasks add-on's `addon_tasks_add` (an approval drawn by the add-on as an editable list; queues what you approved, unless the chat bypasses permissions) |
| "delete the queued task" | Jig asks to delete queued task `t1` with the Tasks add-on's `addon_tasks_delete` (an approval drawn by the add-on, naming the task); deletes it once allowed ("Deleted the queued task."), else "OK, I didn't delete it." |
| starts with "Test this in Jig's browser" (Search → Test something…) | a short report naming the chat's model and its subagents ("Test report (model haiku; subagents: jig-tester, jig-search)"); its PASS/FAIL wording doesn't end the turn with an error |
| contains "routine" | Jig creates the routine "Daily standup notes" (RemoteTrigger, after the permission card) |
| "publish a page" / "update the page" | writes `sales.html` with `chart.png` next to it and calls `addon_pages_publish` (a new page, then a new version of it with the id from `addon_pages_list`; `e2e/pages.spec.ts`, D-405) |
| "publish an artifact" | writes `release-notes.html` and shows an old Artifact call (as in a chat resumed from the desktop app; Jig chats never get the tool, D-404) |
| "use a skill" | Skill `explain-code`, Read `README.md`, the MCP tool `mcp__github__list_issues`, the Releases add-on's tool `mcp__jig__addon_releases_overview`, then a short answer (the chat overview test) |
| "todo list" | three TodoWrite updates, all done at the end |
| "make a plan" (or a message starting "go ahead") | a plan to approve (ExitPlanMode); the reply says the mode after approval. In a Codex chat the plan goes through Jig's `exit_plan` tool over the chat's local MCP server, which raises the same card (D-315) |
| "look at the code" | searches (Grep) and reads `cart.ts` (Read), slowly, pauses (the steps line says Working), then asks a question: Jig looking at the code while you talk (D-210) |
| "subagent" | a Task with a nested Grep and progress (tool uses, tokens, time) |
| "background job" | a Bash command that keeps running in the background (Stop ends it) |
| "edit <file>" | edits the file's first line; the card shows the diff |
| "theme", "light mode", "dark mode", "terminals to the right" | Jig changes Jig's settings or layout (change cards with Undo) |
| "by hand on the vm" | Jig saves a note (`jig_note_evidence`): a "Noted for suggestions" card with Remove |
| "weekly check-in", "profile interview" | Jig reads the profile and adds a line under "How I release and deploy" (`jig_update_profile`, card with Undo) |
| "as a workflow" | Jig saves a 4-step workflow "Write release notes" in the chat's project (`addon_workflows_save`) |
| "since the last release" | Jig calls the Releases add-on's tool `addon_releases_changes` for the chat's repository |
| "list jig library skills" | Reports the skill plugin ids actually selected at engine start; used to verify global/project controls and continuing chats |
| "in a jig terminal" | Jig runs `echo build finished` in a Jig terminal (`jig_terminal_run`); when it exits, Jig sends the chat a "Terminal "Build" finished" message, which starts a new turn |
| "run the unit tests" | Jig lists the project's test suites (`addon_tests_list`) starts `npm:test` without waiting (`addon_tests_run` with `wait: 0`), waits for it by run id (`addon_tests_wait`) and quotes the result's first line; the run shows in the Tests view (D-244, D-359) |
| "any pipelines running" | Jig calls `addon_pipelines_runs` (running, then recent), `addon_pipelines_run` for the newest run's id and `addon_repos_status`, and quotes each result's first line (D-371; `e2e/pipelines.spec.ts`, with a fake az) |
| "remember in the notes" | Jig adds a project dependency about deferring pipeline improvements until migration, using `jig_notes_add`; all chats in that project see it |
| "change the queued task" | Jig appends "Don't run the e2e tests." to queued task `t1` with `addon_tasks_edit` (only queued tasks; the queue's state is left alone) |
| "move the queued task" | Jig moves queued task `t2` to the top of the queue, in a chat of its own, with `addon_tasks_edit` (`moveTo`, `newChat`) |
| "text my phone" | Jig sends the phone "The build is done. Shall I deploy it?" with `jig_phone_send` (D-350), then says "I sent it to your phone." (`e2e/phone.spec.ts`, against a fake Telegram server) |
| "close my phone room" | Jig closes this chat's room on the phone with `jig_phone_close_room` (D-386) and says what the tool answered ("Closed the room of …", or that there is none) (`e2e/phone.spec.ts`) |
| "my usage limits" | Jig reads both providers' plan limits with `jig_usage_limits` (D-386) and says them as the tool wrote them (`e2e/usage.spec.ts`) |
| "in the releases data" | Jig looks at the Releases add-on (`jig_get_addon`) and saves `fake-note` in its data (`jig_set_addon_data`, card with Undo) |
| "add the stage links" | Jig adds a Stage group with the stage site and resource group (`jig_add_project_links`) |
| "make a project for this chat" | Jig lists projects, creates "Fake project" (plan mode) and moves the chat into it, pinned (`jig_list_projects`, `jig_create_project`, `jig_move_chat`) |
| "pipelines below git" (or "under") | Jig shows Pipelines in the lower half of Git's sidebar (`jig_change_layout` op `below`) |
| "bottom panel full width" | Jig makes the bottom panel run the whole window width (`jig_change_layout` op `span`, D-375) |
| "browse <url>" | Jig's browser opens the page, clicks `[1]`, takes a screenshot; with "phone" also one at phone and desktop sizes; with "requests" or "network" it reads the network log (all, then failed ones); with "read it again" it reads the page after the click (a page that hangs on it, `e2e/browser-hangs.spec.ts`). The browser's waits run with `JIG_BROWSER_TIMEOUT_SCALE` (0.2 in that spec: load 6 s, page script 3 s, whole call 12 s) |
| "read the browser page" | Jig reads its own chat's page of Jig's browser (`jig_browser_read`) and answers "My page: Page: …" with the first line, the page's title and address: two chats on separate pages (D-320, `e2e/browser-pages.spec.ts`) |
| a path ending in an image extension | a Read of that image (thumbnail in the card) |
| contains "safety check" | Claude Code's own safety check: asks to run `rm -rf /fake-root/build` ("Dangerous rm operation on critical path"), in every mode including Don't ask, where the card counts down `engine.dontAskWaitSeconds` and Jig declines it unanswered (D-336, `e2e/dont-ask.spec.ts`); then "Removed the build folder." or "OK, I skipped removing it." |
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
  commit messages and release drafts (bump, changelog, one note for customers), and a task run report
  (every task in a line, failed/blocked ones as stuck, one push, every follow-up merged into one proposal, D-355). The reflection
  answers a `practice` pattern with a "better practice" suggestion (D-213), a `habit` pattern with a
  prompting tip whose `example` is a rewritten prompt (D-214), any other pattern with a
  new-add-on suggestion, and a `manual-work` note (without patterns) with a workflow suggestion plus
  a profile update.
- **The builder:** its sessions run a scripted build (`fakeBuilder.ts`). A goal with "jig itself" or
  "source" ends in a development request (title, user story, acceptance criteria, a small mockup);
  feedback on it ("Change the request") gives version 2, with the feedback in the mockup (`#change`).
  A goal with "partly" builds a new add-on that also carries a development request without a mockup
  (D-303, D-422).
- **Dictation (D-208):** with `JIG_ENGINE=fake` Chromium uses a fake microphone and Jig a fake
  transcriber: the model "download" goes 0 → 50 → 100 % without network, and every recording
  becomes "Hello Claude, this came from the microphone." (also every live pass while speaking).
- **Talking with Jig (D-209):** in fake mode the conversation doesn't listen to the microphone;
  `window.dispatchEvent(new CustomEvent("jig-fake-speech", { detail: "…" }))` is "you said …".
  Speaking is pretended (300 ms per sentence); the last sentence is on the button's `data-said`.
- **The Teams phone (D-379, D-381):** with `JIG_ENGINE=fake`, `JIG_TEAMS_RELAY=<url>` points the Teams
  channel at a fake relay instead of the credential's address, and `JIG_TEAMS_RELAY_ZIP=<file>` stands
  in for the relay's deployment package. `e2e/phone-teams.spec.ts` runs Teams setup's Create against a
  fake `az` in the test's `fake-bin` (it logs every command and hands the relay key to the fake relay);
  no real Azure is touched.
- **Guarded tool calls (Routines tab):** answered by a scripted "cloud"
  (`fakeCloud.ts`) with two routines and one past run.

`JIG_MAIL_OUT=<folder>` makes **Email to developers** save the zip there (instead of Downloads) and
write the `mailto:` link to `mailto.txt` instead of opening a mail app. `JIG_FAKE_DELAY` sets the per-word delay (ms), `JIG_FAKE_ONESHOT` a fixed one-shot answer, and
`JIG_FAKE_USAGE` the plan usage (`unavailable` or JSON), `JIG_FAKE_CHATGPT_USAGE` ChatGPT's
(`signedout` or JSON; default a Plus plan at 27 % / 64 %). `signedout` also makes ChatGPT not signed in
for chats (`ai.providers`), so a ChatGPT chat can't be started (D-330).

Code completion with Claude or ChatGPT (D-255, D-401) uses the fake engine's `completer` (the same for both): after `return ` at the caret it
suggests `total;`, anywhere else `// suggested by the fake engine`. Captions to translate (D-277, a
batch since D-384) come back as `<t n="…">[<language>] <caption></t>` each. The meetings test service rings for
a Teams call when a test calls `window.jigTestRing(name)` in the meetings window (D-254). It has three
Teams chats (D-296): an unread one-to-one with Alex, a "Portal planning" group and a one-to-one with
Sam; Call… → Chat finds Alex's and Sam's, anyone else has none. `window.jigTestCaptionsUnavailable()`
in the call window makes Teams captions "unavailable" in a running test meeting (D-321): the
transcript gets the policy notice and, with `meetings.localTranscription` on, lines marked Local
(alternating Alex and You); off, no more lines. Noise suppression (D-322) reads On in a test call
while `meetings.noiseSuppression` is on and Off when it is off (no real audio effect runs). Messages
you send are kept while Jig runs.

## Screenshots

`e2e/screenshots.spec.ts` regenerates the pictures of the "What Jig can do" page and the README
(skipped unless `JIG_SCREENSHOTS=1`; see `docs/reference/about.md`).

### Put the UI in a state and screenshot it

For a design check of a change, take the view in the state you need at every width it can be shown
at, in one test run, instead of clicking through `npm run dev`:

1. **Make the state through the host**, not the screen: `hostCall(page, "addons.call", { id, method,
   args })` for an add-on's data (the Tasks queue: `add`, `stop`, `setStopOnFailure`, `start`),
   `projects.add`, `sessions.send`… State the view reads from the host survives the reload below;
   an open modal or menu does not, so open those after the last placement (or screenshot them
   yourself). Writing add-on storage by hand rarely sticks: add-ons reconcile it (a "running" task
   with an idle chat is put back), so drive them through their own methods.
2. **Something in progress:** a message with "hold until released" keeps the fake engine's turn
   running (a Running task, a busy chat) until `hostCall(page, "fake.release", { match })`.
3. **Screenshot it:** `shootView(page, viewId, name, { ready })` from `e2e/shots.ts` puts the view in
   the right sidebar (320 px), the bottom panel (320 px high, the window's width) and a main-area tab,
   each time saving the layout and reloading the window as on start, so its `@container` sizes respond
   as in real use. It writes `.tmp/shots/<name>-sidebar.png`, `-bottom.png` and `-tab.png` and returns
   the paths; `placements` picks fewer. View ids: a core view's id, or `addon.<add-on>.<view>`.

`e2e/ui-shots.spec.ts` is the worked example (a Tasks queue with done, failed, running, up next and
tasks after a stop line; a second test shows stop lines planned, running and stopped): copy its test, change the state and the view, and run it with
`npm run build && JIG_UI_SHOTS=1 npx playwright test e2e/ui-shots.spec.ts`, then read the PNGs. It is
skipped in normal runs and ignored by `e2e:changed`.

## Rules

- Never use real Claude credentials in tests — use the fake engine.
- Host modules that touch state are tested with a temporary `JIG_HOME` (the Vitest config sets one
  for every test, so nothing reaches the real `~/.jig`).
- A bug fix comes with a test that fails without it.

Settings model discovery uses the fake engine’s canned model list (now including Sonnet), without creating a chat or using credentials.

## Meetings

Set both JIG_ENGINE=fake and JIG_MEETINGS=fake for the isolated meeting service; fake engine alone
never authorises a real meeting. Its Teams chats (9: one-to-one, group and meeting chats) answer the
Chats toolbar's message search and New chat; add `JIG_MEETINGS_CHAT_CREATE=consent` to show New chat
without the permission to start chats (D-332). e2e/meetings.spec.ts creates temporary Shop/Portal projects, joins
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
| One-shot starting "You write meeting notes for Jig." (Generate notes, D-424) | Answers notes JSON: a TL;DR, a decision, two actions ("Review the Shop API", mine, due Friday, the first listed project; "Update documentation", Sam, the second project or an unknown id, plus a citation matching no caption), a risk and a topic, citing the transcript's first and last timestamps. A caption saying "hold until released" keeps it writing until `fake.release` (or Cancel); "fail the notes" makes it fail |
