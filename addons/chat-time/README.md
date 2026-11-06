# Chat time

Where chats' working time goes, to see why a chat or a day took long: the model thinking and writing,
tests and builds, browser checks, subagents, other shell commands, other tools and waiting for you.
Read-only, built in since D-419 (it started as an in-app build).

- **Open it:** View → Views → **Chat time** (a view that starts hidden on the right; it opens as a
  main-area tab and can be moved to a sidebar or the bottom panel), or Chats → **Where chat time goes**.
  A chat message's menu → **Where this chat's time went** opens that chat's own tab.
- **Which chats:** the picker at the top left: the **active project** (follows it), any other
  project, or **All projects** (chats without a project count there too). The period: today or the
  last 7, 30 or 90 days. Both are remembered.
- **The view:** working time, wall-clock time, the number of chats and how many other chats worked at
  the same time on average; a stacked bar and a row per category (time, share, calls); working time
  per day by category, with each day's "×n" (other chats at once); the chats ranked by working time
  (click one for its own tab); the slowest calls (click one to open its chat).
- **A chat's tab:** the same breakdown over all its turns, its turns, others at once, the share of
  its time shared with another chat, the slowest calls and **Open chat**.
- **Colours:** one hue per category: model `accent`, tests & builds `magenta` (D-419: a token of its
  own, so they no longer look like the model's orange), browser `info`, subagents `success`, other
  shell `muted`, other tools `line-strong`, waiting `danger`.

## Categories (`lib/analyze.ts`)

- **Tests & builds:** the Tests add-on's `addon_tests_run` / `addon_tests_wait`, and shell steps that
  run a test or build: Vitest, Jest, Playwright, Karma, Cypress, Mocha, pytest, tsc, ESLint/Biome,
  `npm|pnpm|yarn|bun test`, `npm run *test|check|verify|build|lint|typecheck|e2e*`, `ng test|build`,
  `dotnet test|build`, `go|cargo test|build`, Maven/Gradle/MSBuild, or a `*test*`/`*e2e*` script; also a
  `sleep`/`until` loop waiting on a test log. A command is split into steps (`&&`, `;`, `|`, new lines,
  heredoc bodies left out) and only a step that *runs* one counts, so `rm e2e/a.spec.ts` or
  `cat x.test.ts` is other shell.
- **Browser checks:** Jig's browser tools (`jig_browser_*`, `jig_test_page`), other browser MCP
  servers, the **jig-tester** subagent (any subagent type with tester/browser/playwright in its name),
  and shell steps with `PW_CHANNEL=` or running a `*browser*` script.
- **Subagents:** other Agent/Task calls, including everything the subagent did.
- **Waiting for you:** AskUserQuestion, ExitPlanMode, and any call that showed an approval prompt.
- **Other shell commands / other tools:** the rest.
- **Model thinking & writing:** the rest of each turn's working time, which no tool call covers
  (also Claude Code's and Jig's own overhead).

## How it's measured

- Working time is each turn's duration as Jig records it, the same as the chat overview shows. It is
  **wall-clock** time: two chats (or a task queue and a chat) working for the same hour count two
  hours. **Others at once** says how crowded that time was: the other chats' working time inside it,
  divided by its own (any project counts, also for a single project's view). "Wall clock" is the time
  when at least one of the chats in view worked.
- A tool call starts when Jig shows it. Claude chats take its end from the tool result's time in
  Claude Code's transcript (`~/.claude/projects/…/<session>.jsonl`), so they are exact. ChatGPT
  chats, and Claude chats without a transcript, only know the start: their end is when the chat's
  next step began, marked ≈.
- **Nothing counts twice:** calls that ran in parallel count once (the overlap goes to the first of
  waiting, tests, browser, subagents, shell, other tools); a call counts only inside its turn (a
  `run_in_background` command's call ends when it was started, a call still running after the turn
  is cut at its end); a `TaskOutput`/`BashOutput` wait on a background command takes that command's
  category; a subagent's own calls are inside its Agent call.
- Calls that failed or were stopped are marked `!`.

## Tools for chats

Read-only, compact text, so a chat can check where time goes or whether a change helped:

- `addon_chat_time_breakdown` — `scope` `chat` | `project` (default) | `all`, `id` (a chat id, or a
  project's id or name; default: the calling chat or its project), `days` (1 = today, default 7),
  `top` (slowest calls, default 5): per category time/share/calls, others at once, the slowest calls
  (time, category, tool, chat id, a short command), and for a project or all projects one row per day
  (working, wall clock, others at once, top category).
- `addon_chat_time_chats` — `scope` `project` | `all`, `id`, `days`, `top` (default 10): the chats
  ranked by working time with their share, others at once, biggest category, chat id and title.

## Data

Read-only, from Jig's chat files (`<JIG_HOME>/sessions`) and Claude Code's transcripts. Nothing is
written or sent anywhere. Results are cached per chat until its file changes; the first load of a
long period reads every chat changed in it (a few seconds for a week of busy use).

Not yet: a duration next to each tool call in the transcript and a section in Jig's own chat overview
need Jig to record when a tool call ends; that is a separate change (tool-call durations and a
`chatOverview` slot), after which this add-on can read them instead of the transcripts.
