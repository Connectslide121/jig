# Testing Jig

| Kind | Tool | Where | Run |
|---|---|---|---|
| Unit | Vitest | `*.test.ts` next to the code (`packages/*`, `apps/desktop/src/main`, `scripts`) | `npm test` |
| End-to-end | Playwright + Electron | `e2e/*.spec.ts` | `npm run e2e` |
| Design tokens | `scripts/check-tokens.ts` | renderer + add-ons | `npm run check:tokens` |
| Everything fast | — | — | `npm run check` |

## End-to-end tests

`e2e/fixtures.ts` launches the **built** app (`apps/desktop/dist`) with:

- a fresh temporary `JIG_HOME` per test (deleted afterwards),
- `JIG_ENGINE=fake`, so no Claude Code process is started and no quota is used,
- `JIG_HIDDEN=1`, so the windows never show: on a desktop they would take focus and the mouse could
  cancel a hover (`JIG_HIDDEN=` with an empty value to watch them). A hidden Jig sends no system
  notifications either (`notificationsAllowed`), which it otherwise would, being "in the background".

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
(`apps/desktop/src/main/engine/fake.ts`). Its saved Claude Code chats (Open a Claude Code chat…,
D-150) are two scripted ones: "Fix the cart total" (`saved-1`, with a transcript: a reminder,
your message, a reply with an Edit, a subagent's message, the result, a last reply) and "Plan the
checkout", in `JIG_FAKE_SAVED_CWD` (your home folder by default). What it does depends on the message. The first match wins,
in this order:

| Message | What happens |
| --- | --- |
| contains "login" (first message) | acts like a Claude Code that isn't signed in |
| `/compact …` | compacts the conversation (context drops to 21k tokens) |
| `/name …` | a Claude Code command prints its output; a skill (`/explain-code`) answers like Claude |
| a task from the Tasks queue (its context names `addon_tasks_report`), unless it says "skip the report" | Claude reports with `addon_tasks_report`: "done" with the summary "Did it: <message>", or "failed" when it says "fail this task"; one note; a follow-up when it says "with follow-ups" |
| "queue tasks for" | Claude queues two tasks (Contoso spec, Fabrikam spec) with the Tasks add-on's `addon_tasks_add` |
| starts with "Test this in Claude's browser" (Tools → Test something…) | a short report naming the chat's model and its subagents ("Test report (model haiku; subagents: jig-tester)"); its PASS/FAIL wording doesn't end the turn with an error |
| contains "routine" | Claude creates the routine "Daily standup notes" (RemoteTrigger, after the permission card) |
| "publish an artifact" | writes `release-notes.html` and publishes it (Artifact tool, a fake claude.ai link) |
| "todo list" | three TodoWrite updates, all done at the end |
| "make a plan" | a plan to approve (ExitPlanMode); the reply says the mode after approval |
| "subagent" | a Task with a nested Grep and progress (tool uses, tokens, time) |
| "background job" | a Bash command that keeps running in the background (Stop ends it) |
| "edit <file>" | edits the file's first line; the card shows the diff |
| "theme", "light mode", "dark mode", "terminals to the right" | Claude changes Jig's settings or layout (change cards with Undo) |
| "by hand on the vm" | Claude saves a note (`jig_note_evidence`): a "Noted for suggestions" card with Remove |
| "weekly check-in", "profile interview" | Claude reads the profile and adds a line under "How I release and deploy" (`jig_update_profile`, card with Undo) |
| "as a workflow" | Claude saves a 4-step workflow "Write release notes" in the chat's project (`addon_workflows_save`) |
| "since the last release" | Claude calls the Releases add-on's tool `addon_releases_changes` for the chat's repository |
| "remember in the notes" | Claude adds a "Waiting on" note to the chat with the Notes add-on's tool (`addon_notes_add`); it shows in the Notes view |
| "in the releases data" | Claude looks at the Releases add-on (`jig_get_addon`) and saves `fake-note` in its data (`jig_set_addon_data`, card with Undo) |
| "add the stage links" | Claude adds a Stage group with the stage site and resource group (`jig_add_project_links`) |
| "make a project for this chat" | Claude lists projects, creates "Fake project" (plan mode) and moves the chat into it, pinned (`jig_list_projects`, `jig_create_project`, `jig_move_chat`) |
| "pipelines below git" (or "under") | Claude shows Pipelines in the lower half of Git's sidebar (`jig_change_layout` op `below`) |
| "browse <url>" | Claude's browser opens the page, clicks `[1]`, takes a screenshot; with "phone" also one at phone and desktop sizes; with "requests" or "network" it reads the network log (all, then failed ones) |
| a path ending in an image extension | a Read of that image (thumbnail in the card) |
| contains "run" or "permission" | asks to run `npm test` (permission card) |
| contains "several questions" | asks three questions in steps (one choice, several choices, one to answer in your own words); the reply lists the answers joined by " \| " |
| contains "question" | asks a multiple-choice question |
| "write <file>" | writes the file (a file checkpoint: Restore files puts it back) |
| contains "build" | asks Jig's builder for a tool (`jig_request_build`) |
| contains "slow" | a long streamed answer (try Stop) |
| anything else | a short Markdown answer that repeats your message, with a code block |

More behaviour:
- **Turn endings:** "fail" ends the turn with an error. "big file" adds 130k tokens to the context
  (9k otherwise).
- **Suggestions:** from the second turn on, it suggests a next message.
- **Messages sent with Ctrl+Enter during a turn:** they get "Noted while working: …".
- **Commands, models and MCP servers:** canned lists (`/usage`, `/explain-code`; models with effort
  levels; `github` connected and `jira` needing sign-in).
- **One-shot questions:** answers for attempts judging, tours, the pre-commit check, standups,
  commit messages and release drafts (bump, changelog, one note for customers). The reflection
  answers a pattern with a new-add-on suggestion, and a `manual-work` note (without patterns) with a
  workflow suggestion plus a profile update.
- **The builder:** its sessions run a scripted build (`fakeBuilder.ts`). A goal with "jig itself" or
  "source" ends in a development request (title, user story, acceptance criteria, a small mockup);
  feedback on it ("Change the request") gives version 2, with the feedback in the mockup (`#change`).
- **Guarded tool calls (Routines and Artifacts tabs):** answered by a scripted "cloud"
  (`fakeCloud.ts`) with two routines, one past run and two artifacts.

`JIG_MAIL_OUT=<folder>` makes **Email to developers** save the zip there (instead of Downloads) and
write the `mailto:` link to `mailto.txt` instead of opening a mail app. `JIG_FAKE_DELAY` sets the per-word delay (ms), `JIG_FAKE_ONESHOT` a fixed one-shot answer, and
`JIG_FAKE_USAGE` the plan usage (`unavailable` or JSON).

## Screenshots

`e2e/screenshots.spec.ts` regenerates the pictures of the "What Jig can do" page and the README
(skipped unless `JIG_SCREENSHOTS=1`; see `docs/reference/about.md`).

## Rules

- Never use real Claude credentials in tests — use the fake engine.
- Host modules that touch state are tested with a temporary `JIG_HOME` (the Vitest config sets one
  for every test, so nothing reaches the real `~/.jig`).
- A bug fix comes with a test that fails without it.

Settings model discovery uses the fake engine’s canned model list (now including Sonnet), without creating a chat or using credentials.
