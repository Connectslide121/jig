# Phase 28 — Jig factory

Status: **in progress** on branch `factory` (session 0 done 2026-11-06; see "Where we are"). Jon's decisions are below; development is planned as
self-contained sessions so it can be done **without Jig**, from GitHub (for example GitHub Copilot's
coding agent on a phone). Asked for after two internal meetings on 2026-11-05 and Jon's follow-ups
on 2026-11-06: "I want the full factory built so we can test it end to end, as a Jig add-on. Nice
UI, nice UX and nice DevX, all of it, over the top … the demos it produces must look super polished,
never like generic MVPs."

**Done when:** you press **New idea** in Jig, answer an interview, and Jig factory delivers a
polished, clickable demo of the idea, then (once you approve it) everything needed to build, sell,
teach and launch it: spec, user stories, test cases, release notes, customer letter, e-learning,
pitch, presentation, one-pager, teaser, marketing plan, articles and newsletter. Each one is a draft
that a person approves, with the people you choose approving at each gate, partly from their phone.

Names of people and products in this repository stay roles and placeholders (AGENTS.md: "No real
names in examples").

## The documents of this phase

| File | What it holds |
|---|---|
| this file | decisions, overview, the sessions (the work, in order, with checklists) |
| [28-factory/pipeline.md](28-factory/pipeline.md) | stages, tracks, build levels, the interview, gates, roles and recipes, rules |
| [28-factory/architecture.md](28-factory/architecture.md) | the add-on's files, data model, Conductor, stage runner, tools, core additions (phone buttons), file layout in product repos |
| [28-factory/ui.md](28-factory/ui.md) | **how you use it** (a walkthrough) and every screen, with wireframes |
| [28-factory/mockup.html](28-factory/mockup.html) | a static visual mockup of the screens (open it in a browser) |
| [28-factory/demo-quality.md](28-factory/demo-quality.md) | the demo quality bar, the demo kit, product kits, design system, skills and resources |
| [28-factory/testing.md](28-factory/testing.md) | testing the factory itself, and DevX |
| [28-factory/copilot-prompt.md](28-factory/copilot-prompt.md) | the prompt to start a coding-agent session for one session of this phase |

## Decisions (Jon, 2026-11-06)

Recorded in `docs/decisions.md` as D-426 … D-441 (session 0; they were J-1 … J-16 in the first
draft of this plan, in the same order).

| # | Decision |
|---|---|
| D-426 | **A built-in Jig add-on**, `addons/factory`, called **Jig factory** (working name). Not a skill, not a workflow: the full thing, built so it can be tested end to end. |
| D-427 | **Jig factory runs its own stage chats**, in parallel (default 3 at a time), through the add-on host's `api.chats`. Not through the Tasks queue (sequential, one per project). This replaces option C of the first design. |
| D-428 | **One demo stack for every concept demo (L1)**: React + TypeScript + Tailwind + shadcn/ui, built into a static folder, whatever the product's own stack is. Working prototypes (L2) and full builds (L3) use the product's own stack. |
| D-429 | **A run's files live in the product's repository** under `docs/factory/<run>/`, on a branch per run (`factory/<slug>`), merged when the pack is approved. |
| D-430 | **A new product with no repository:** the interview asks every time whether to create one, its name and where; Jon decides each time. |
| D-431 | **The demo kit has its own repository** (beside Jig in the workspace); Jig only points to it (a setting). |
| D-432 | **Vendor** Anthropic's `web-artifacts-builder`, `theme-factory`, `webapp-testing` and Vercel's `web-design-guidelines` into `skills/`, text only, after a licence check; their scripts are rebuilt inside the demo kit. |
| D-433 | **Gate owners are set by hand per run** (on the Plan step), not as global roles. |
| D-434 | **Phone buttons for add-ons:** yes. A core phone API so Jig factory can send "Demo v2 is ready · Approve · Ask for changes · Open in Jig" and receive the tap. |
| D-435 | **Approvals by other people** go through the product's own Azure DevOps board (a card per gate, polled). |
| D-436 | **An independent design critic** runs on ChatGPT (Codex) when it is signed in, else on Claude. |
| D-437 | **New brands:** the interview asks for the name and logo; the factory invents them only when told to. |
| D-438 | **Sharing a demo outside Jig:** asked every time, at Publish (where, how long). |
| D-439 | **Languages:** asked every time in the interview, English by default. |
| D-440 | **Runs go on unattended** (overnight, while away) and stop only at gates, with a cap on retries per stage. |
| D-441 | **No usage design:** runs use the user's own plan like any chat; recipe evals on real models only start from a button. |

Later decisions (Jon, 2026-11-06, after going through the plan):

| # | Decision |
|---|---|
| D-444 | **`DESIGN.md` libraries as inspiration** for new brands' directions and the critic; only their addresses are kept (`factory.designSources`). |
| D-445 | **Deck and one-pager in two forms:** HTML from the demo kit (→ PDF) and made with ChatGPT's image model; you pick which to share, or both. |
| D-446 | **Images are generated with ChatGPT** (Codex's image generation on the signed-in plan); demo screenshots first. |
| D-447 | **E-learning through the user's own MCP server:** Jig factory builds the connector (setting + recipes); courses are created as unpublished drafts. |
| D-448 | **Teasers are HTML rendered to MP4 with HyperFrames**, in the demo kit; not html-video (a second agent runtime). |

**Open: sharing a demo for review with people who don't have Jig.** A demo is one self-contained
HTML file, so it can simply be sent (for example in Teams) and opened in a browser. A private
review site (for example Azure Static Web Apps behind company sign-in, board cards linking to it)
is an option Jon hasn't decided on; until then the demo review (G1) is Jon's, in Jig.

## Overview

```
New idea ─► Interview ─► Brief ─► [G0 go] ─► Plan ─► Art direction ─► [GD pick] ─► Demo ─► Quality gate
        ─► [G1 demo approved] ─► Pack (in parallel) ─► [G2–G4 reviews] ─► Build ─► [G5 publish, by hand] ─► Retro
```

- **Build levels** (picked in the interview, confirmed at G0): **L1** concept demo (static
  click-through, new products), **L2** working prototype in the real product (feature branch,
  feature flag, demo data), **L3** full build (small changes, PR-ready).
- **Roles** are recipes (reviewed prompts with inputs, outputs, checks, provider, model). The
  **Conductor** that moves a run through its stages is add-on code, not an AI.
- **Every output is a draft** until a person approves it. Publishing, sending, posting and deploying
  are always a human click.
- **Polished by construction:** demos are built from the demo kit and a product kit, then scored by
  a critic and automated checks before you see them.

## Where we are (the handoff note, keep it current)

Updated by every agent when it stops or finishes a piece of work; a new agent starts here
([copilot-prompt.md](28-factory/copilot-prompt.md) is the prompt to start one).

- **Branch:** `factory` (not merged into main yet). Commits are small; `git log --oneline` on it
  shows the order.
- **Decision numbers (2026-11-07):** main and this branch both used D-424 onward, so the factory's
  decisions were renumbered by +2 (now D-426…D-452) and main is merged in. Commit messages from
  before the renumbering show the old numbers (old D-n is now D-(n+2)). Before
  `npm run decision` here, fetch main and compare its last `## D-` heading with this branch's; if main
  has moved past the factory's last number, say so and merge main first instead of reserving.
- **Current session:** 2, the add-on core (Conductor and stage runner) — in progress.
- **Done:** session 0 (decisions D-426…D-442, `addons/factory` with the Floor, Run and Inbox on
  sample runs). Session 1: the demo kit (all of it, passing its own gate), the
  `factory.demoKitPath` setting, skills that can start off (D-443).
- **Plan changed after session 1** (Jon, 2026-11-06): D-444…D-448 (design sources, two-form deck
  and one-pager, ChatGPT images, e-learning connector, HyperFrames teasers). They change sessions 4
  and 5 (their checklists say how), nothing already built. Their settings join the Settings → Jig
  factory page like `factory.demoKitPath` (D-443). Open: how people without Jig see a demo.
- **The demo kit's code:** branch **`demo-kit`** of this GitHub repository (its own history; it is
  meant to become the repository `jig-demo-kit`, D-431, which could not be created from the agent).
  Get it beside `jig/`: `git clone -b demo-kit <this repo's URL> ../jig-demo-kit`, then
  `npm install && npm run setup` in it. Its README and AGENTS.md say how to use it. Push kit
  commits back with `git push origin HEAD:demo-kit`; push `factory` after every commit too.
- **Half done / next step:** session 2: the Conductor (`host.ts`), recipes, tools and host tests are
  in; next the fake engine's factory roles, the Run tab live (gate and stage sheets, Inspector,
  Start from a brief…), the e2e run and the docs. Built-in add-ons read core settings with
  `api.config()` (D-450).

## Working on this phase from GitHub (without Jig)

- Read `AGENTS.md` first, then this file and the `28-factory/` documents. Each session below is
  self-contained: goal, files, checklist, done when.
- Work on the `factory` branch (Jon, 2026-11-06), small commits with their tests and docs
  (AGENTS.md → Commits).
- Before each commit: `npm run verify`. Once at the end of a session: `npm run e2e:changed`
  (on Linux `xvfb-run -a npm run e2e:changed`). The Tests add-on mentioned in AGENTS.md is the in-Jig
  way to run the same command; from GitHub run it in the shell.
- Decisions: `npm run decision -- "Title"`, never a number picked by hand.
- The fake engine (`JIG_ENGINE=fake`) plays every role in tests; no real AI is needed to develop or
  test the add-on. Real-model checks (recipe evals, the first dogfood run) are Jon's, in Jig.
- Tick items here (`[x]` done, `[~]` written but not wired/tested) and the phase row in
  `docs/plan/README.md`.

## Sessions

Sessions run in order. Each ends with something Jon can try (in Jig, after pulling).

### 0. Foundations: decisions, skeleton, mockup in code — done

- [x] Reserve D-numbers for J-1 … J-16 (`npm run decision`): D-426 … D-441, filled, used here.
- [x] `addons/factory/` skeleton: `addon.json` (id `factory`, name "Jig factory", icon `factory`,
      `storage.scope: "project"`, permissions `chat`, `ai`, `exec`, `fs:read`, `fs:write`), empty
      `host.ts`, `ui.tsx`, `README.md`; the view "Jig factory" listed in View → Views (hard rule: no
      hidden features) and a top-bar item.
- [x] `lib/run.ts`, `lib/graph.ts`, `lib/gates.ts` types and pure functions from
      [architecture.md](28-factory/architecture.md) → Data model, with unit tests.
- [x] The Factory floor, Run, Inbox views rendering **fixture runs** (no AI yet), matching
      [ui.md](28-factory/ui.md) and [mockup.html](28-factory/mockup.html), at sidebar, panel and tab
      widths, Jig Dark and Light (`shootView`).
- [x] `e2e/factory.spec.ts` (fixture runs render, whole card clickable, no layout shift on load) and
      its rule in `e2e/affected.json`.

**Done when:** Jig factory shows fixture runs on the floor, a run's page and the inbox, looking like
the mockup.

Session 0 notes: the fixture runs are **sample runs** the user loads and removes (⋯ → Load sample
runs), stored like real runs and marked `fx-sample-` (D-442). Besides the three planned lib files,
`lib/floor.ts` (lanes, card progress, KPIs, stage-graph boxes) and `lib/samples.ts` keep the views'
logic pure. The top bar menu has Floor, Inbox, Runs and the sample entries; **New idea…** comes with
session 3. Screenshots: `JIG_UI_SHOTS=1 xvfb-run -a npx playwright test e2e/factory.spec.ts -g "Dark
and Light"` (view at sidebar, panel and tab; Floor, Run and Inbox at a wide and a narrow window).

### 1. The demo kit and the quality gate — done

Its own repository (D-431); this session creates it beside `jig/` and adds only a setting in Jig.

- [x] Demo kit repo: Vite + React + TS + Tailwind v4 + shadcn/ui, hash routes, relative base, one
      static folder output; shells (sidebar app, top-nav app, phone frame, tablet frame, landing).
- [x] Built-in: PROTOTYPE · sample data banner, version and change log, story mode ("what to try"
      panel), presenter mode (arrow keys, hotspots), theme switch, reduced motion.
- [x] Tokens pipeline: DTCG 2025.10 `tokens.json` → Style Dictionary v5 → CSS variables + Tailwind
      theme. A sample product kit (neutral brand).
- [x] Block registry (shadcn registry format) with the first blocks: app shell, data table, KPI
      strip, chart card, calendar/schedule, kanban, detail drawer, form in a modal, empty state.
- [x] Storybook catalogue of the kit.
- [x] `npm run check` in the kit = the quality gate: build, offline load, no console errors, axe
      (0 serious/critical), screenshots at 1440/1280/834/390, layout shift, banner present, real-data
      scan; writes `check.json` + screenshots ([demo-quality.md](28-factory/demo-quality.md)).
- [x] Jig setting `factory.demoKitPath` (`ConfigSchema`, `SETTINGS_GUIDE`, `state.md`).
- [x] Vendored skills (D-432) into `skills/` with pins and licences, plus the factory's own critic
      rubric as a reference file.

**Done when:** a hand-written brief turned into a demo with the kit passes `npm run check` and looks
like a product, not an MVP.

Session 1 notes: the kit is on branch `demo-kit` (see "Where we are"); commands in its README
(`new`, `dev`, `build`, `check`, `storybook`, `registry:build`). `demos/sample` ("Fabrikam Field", a
dispatcher at 07:40) passes `npm run check` in ~25 s: one offline HTML file of 1.2 MB, 4 widths plus
dark, axe, layout shift, alignment, story targets, real-data scan; `check.json` and screenshots in
`<demo>/check/`. A new demo from the template passes too, inside or outside the kit folder. The
setting shows on Settings → Jig factory (core page, D-443: add-ons can't read core settings yet).
Skills: `web-artifacts`, `theme-factory`, `webapp-testing`, `web-design-guidelines` (with a pinned
copy of the guidelines) and the Jig-authored critic `demo-quality` (`references/rubric.md`), all off
by default (`defaultEnabled: false`).

### 2. The add-on core: Conductor and stage runner — in progress

- [x] Conductor in `host.ts`: run state machine, graph scheduling with fan-out, retries (1 per
      stage), caps (3 revisions per gate), resume after restart, a watcher tick (1 min).
- [x] Stage runner on `api.chats.create/send/get` with `factory.concurrency` (default 3); one chat
      per stage, named "Factory · <run> · <stage>", in the run's project.
- [x] Unattended runs (D-440): widen D-363 so Jig factory may start stage chats in "Don't ask" when
      **you** picked it on the Plan step (user-only, like Add tasks); new decision entry
      ([architecture.md](28-factory/architecture.md) → The stage runner).
- [x] Recipes loader (`lib/recipes.ts`): built-in `addons/factory/recipes/*.md`, overrides in
      `<repo>/.jig/factory/recipes/`, validation, hot reload; tracks as data (`tracks/*.json`).
- [ ] Jig's tools for stage chats (`claude.tool` slot): `factory_brief`, `factory_report`,
      `factory_ask`, `factory_questions` (interview), and `claude.context` telling a stage chat its
      role, run and what to report. All engine-neutral (Claude and ChatGPT chats); fake-engine rows
      for each. A recipe's provider and model come from `addons/shared/providers.ts` (D-412).
- [x] Output files with front-matter status in `docs/factory/<run>/` on branch `factory/<slug>` (D-429),
      committed by the stage chat; the Conductor reads them back.
- [ ] Run tab live (stage graph, outputs grid, timeline, chats), Inspector (state, prompts,
      reports, timings), re-run a stage, fork a run from a stage.
- [ ] e2e: a whole fixture run through every stage with the fake engine in under a minute.

**Done when:** a run walks through all stages with fake roles, in parallel where the graph allows,
and survives a Jig restart.

### 3. New idea and the interview — not started

- [ ] New idea modal: text, dropped files, dictation (Jig's mic), "From a meeting" picker,
      product picker or "New product" ([ui.md](28-factory/ui.md) → New idea).
- [ ] Interview tab: question cards with suggested answers (accept with one click, edit, or
      dictate), the brief building live beside them, coverage meter, "Looks right" (G0).
- [ ] Interviewer and Scout recipes ([pipeline.md](28-factory/pipeline.md) → The interview), level
      suggestion with reasons; new product → ask about the repository (D-430), name and logo (D-437);
      languages (D-439).
- [ ] Plan step: the run's stages, outputs (pre-ticked per track, untick), gate owners picked by
      hand (D-433), level, languages; Start.
- [ ] "Start Jig factory" from a meeting (Meetings' actions) and from a message (`context.message`).

**Done when:** from a voice note or a meeting you reach a one-page brief you would sign, and a plan.

### 4. The demo, end to end — not started

- [ ] Design director: product kit from the product repo (tokens + reference screenshots,
      `.jig/factory/kit/`); for a new brand, 3 directions (GD gate, direction cards), each with a
      reference from `factory.designSources` (D-444; setting, "Feels like?" in the interview,
      the critic reads the reference's do's and don'ts).
- [ ] Demo builder (L1) on the demo kit; critic loop (score → fix list → rebuild, max 3 rounds,
      D-436); the quality gate's results on the run.
- [ ] Demo review tab: device frames (desktop, tablet, phone) side by side, v1–v3 switcher with
      change log, comment pins on screens, critic scorecard, Approve / Ask for changes (modal) = G1.
- [ ] L2 path: product engineer recipe on `factory/<slug>`, feature flag, demo data; the demo is the
      running product (you start it; deploys stay manual).
- [ ] Preview through the Pages add-on (scripts on for demos), "Open in browser".

**Done when:** idea → interview → a polished demo in Jig, reviewed and approved.

### 5. The pack — not started

- [ ] Recipes: spec, user stories (as board cards), test cases, release notes, customer letter,
      glossary delta; pitch, presentation, one-pager, objection handling; e-learning for sales and
      for customers; marketing plan, articles, LinkedIn drafts, newsletter; teaser film.
- [ ] Formats (D-445): documents in Markdown; customer letter also PDF; deck and one-pager in two
      forms, HTML from the demo kit → PDF and an image version by ChatGPT, the review lets you pick
      one or both to share; newsletter also as e-mail HTML.
- [ ] Images (D-446): image recipes run on ChatGPT; core: `codexNormalize.ts` shows Codex's
      `imageGeneration` items as image cards and passes `usageLimitExceeded` on as a limit; no
      ChatGPT sign-in = image outputs skipped with a reason; fake-engine row.
- [ ] E-learning connector (D-447): setting `factory.elearning` (MCP server name, which tools
      create a course / add pages / publish), `course-*` recipes create an unpublished course and
      report its link; without the setting, the course as Markdown in `learning/`. Jon fills the
      setting in his workspace.
- [ ] Teaser (D-448): `npm run teaser` in the demo kit on HyperFrames (pinned, GSAP and fonts
      bundled), teaser templates on the product kit's tokens and the demo's screens, a storyboard
      the `teaser` recipe writes, checks (35–50 s, logo visible, text readable); MP4 in `teaser/`.
- [ ] Inbox: everything waiting for a person, grouped by gate; approve / edit / reject; statuses
      `draft → reviewed → approved → published` (and `rejected`, `superseded`) with history.
- [ ] Trust numbers per output kind: approved without edits, review time.

**Done when:** an approved demo produces a full pack, each output reviewable in the inbox.

### 6. Reach: phone buttons, other people, publishing — not started

- [ ] Core: phone API for add-ons (D-434, [architecture.md](28-factory/architecture.md) → Phone
      buttons): `phone` permission, `api.phone.send/update`, `phone.action` events, Telegram and
      Teams channels, a reply-with-text button; docs in `addon-api.md`, `26-phone.md`; e2e with the
      fake Telegram server.
- [ ] Jig factory's phone cards: gate waiting (screenshot + Approve / Ask for changes / Open),
      run finished, run stuck.
- [ ] Approvals by others (D-435): a card per gate in the product's board (Boards add-on), polled;
      owner chosen per run.
- [ ] Publish (D-438): asks where (local only / Azure Static Web Apps target from settings) and for
      how long, runs the pre-publish scan, then the human-confirmed deploy; a customer confirm page.

**Done when:** you approve a demo from your phone; a colleague approves the sales material from
their board.

### 7. Tracks 2 and 3: change requests and tenders — not started

- [ ] Change requests: intake from a support ticket, CR template, demo, quote draft with calibrated
      estimates, release-package day with the Releases add-on; critical bugs skip the batch.
- [ ] Tenders: requirement matrix from the tender documents, company-must-be checks
      (certifications, turnover, references), "may not lawfully be required" flags, recurring-gap
      report, no sales/marketing stages.

### 8. Measure and tune — not started

- [ ] Factory report (a Page): runs, durations per stage, critic scores, edit rates, gates loosened
      on evidence.
- [ ] Calibrated estimates from measured stage durations (never the AI's own guess).
- [ ] Recipe evals: golden briefs on real models from a button, scored by the critic, trend per
      recipe version.

## Left out (for now)

- A cloud Jig or a shared seat for the factory (meeting idea, not in this phase).
- Posting to LinkedIn or sending mail by itself: always a person.
- A CRM/sales product, demo booking and call analysis heard in the meetings: candidates for the
  factory's first runs, not part of the factory.
