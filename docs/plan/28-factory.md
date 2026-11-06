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

Recorded in `docs/decisions.md` as D-424 … D-439 (session 0; they were J-1 … J-16 in the first
draft of this plan, in the same order).

| # | Decision |
|---|---|
| D-424 | **A built-in Jig add-on**, `addons/factory`, called **Jig factory** (working name). Not a skill, not a workflow: the full thing, built so it can be tested end to end. |
| D-425 | **Jig factory runs its own stage chats**, in parallel (default 3 at a time), through the add-on host's `api.chats`. Not through the Tasks queue (sequential, one per project). This replaces option C of the first design. |
| D-426 | **One demo stack for every concept demo (L1)**: React + TypeScript + Tailwind + shadcn/ui, built into a static folder, whatever the product's own stack is. Working prototypes (L2) and full builds (L3) use the product's own stack. |
| D-427 | **A run's files live in the product's repository** under `docs/factory/<run>/`, on a branch per run (`factory/<slug>`), merged when the pack is approved. |
| D-428 | **A new product with no repository:** the interview asks every time whether to create one, its name and where; Jon decides each time. |
| D-429 | **The demo kit has its own repository** (beside Jig in the workspace); Jig only points to it (a setting). |
| D-430 | **Vendor** Anthropic's `web-artifacts-builder`, `theme-factory`, `webapp-testing` and Vercel's `web-design-guidelines` into `skills/`, text only, after a licence check; their scripts are rebuilt inside the demo kit. |
| D-431 | **Gate owners are set by hand per run** (on the Plan step), not as global roles. |
| D-432 | **Phone buttons for add-ons:** yes. A core phone API so Jig factory can send "Demo v2 is ready · Approve · Ask for changes · Open in Jig" and receive the tap. |
| D-433 | **Approvals by other people** go through the product's own Azure DevOps board (a card per gate, polled). |
| D-434 | **An independent design critic** runs on ChatGPT (Codex) when it is signed in, else on Claude. |
| D-435 | **New brands:** the interview asks for the name and logo; the factory invents them only when told to. |
| D-436 | **Sharing a demo outside Jig:** asked every time, at Publish (where, how long). |
| D-437 | **Languages:** asked every time in the interview, English by default. |
| D-438 | **Runs go on unattended** (overnight, while away) and stop only at gates, with a cap on retries per stage. |
| D-439 | **No usage design:** runs use the user's own plan like any chat; recipe evals on real models only start from a button. |

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
- **Current session:** 1, the demo kit and the quality gate — in progress.
- **Done:** session 0 (decisions D-424…D-440, `addons/factory` with the Floor, Run and Inbox on
  sample runs).
- **Half done / next step:** see session 1's checklist below.

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

- [x] Reserve D-numbers for J-1 … J-16 (`npm run decision`): D-424 … D-439, filled, used here.
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
runs), stored like real runs and marked `fx-sample-` (D-440). Besides the three planned lib files,
`lib/floor.ts` (lanes, card progress, KPIs, stage-graph boxes) and `lib/samples.ts` keep the views'
logic pure. The top bar menu has Floor, Inbox, Runs and the sample entries; **New idea…** comes with
session 3. Screenshots: `JIG_UI_SHOTS=1 xvfb-run -a npx playwright test e2e/factory.spec.ts -g "Dark
and Light"` (view at sidebar, panel and tab; Floor, Run and Inbox at a wide and a narrow window).

### 1. The demo kit and the quality gate — in progress

Its own repository (D-429); this session creates it beside `jig/` and adds only a setting in Jig.

- [ ] Demo kit repo: Vite + React + TS + Tailwind v4 + shadcn/ui, hash routes, relative base, one
      static folder output; shells (sidebar app, top-nav app, phone frame, tablet frame, landing).
- [ ] Built-in: PROTOTYPE · sample data banner, version and change log, story mode ("what to try"
      panel), presenter mode (arrow keys, hotspots), theme switch, reduced motion.
- [ ] Tokens pipeline: DTCG 2025.10 `tokens.json` → Style Dictionary v5 → CSS variables + Tailwind
      theme. A sample product kit (neutral brand).
- [ ] Block registry (shadcn registry format) with the first blocks: app shell, data table, KPI
      strip, chart card, calendar/schedule, kanban, detail drawer, form in a modal, empty state.
- [ ] Storybook catalogue of the kit.
- [ ] `npm run check` in the kit = the quality gate: build, offline load, no console errors, axe
      (0 serious/critical), screenshots at 1440/1280/834/390, layout shift, banner present, real-data
      scan; writes `check.json` + screenshots ([demo-quality.md](28-factory/demo-quality.md)).
- [ ] Jig setting `factory.demoKitPath` (`ConfigSchema`, `SETTINGS_GUIDE`, `state.md`).
- [ ] Vendored skills (D-430) into `skills/` with pins and licences, plus the factory's own critic
      rubric as a reference file.

**Done when:** a hand-written brief turned into a demo with the kit passes `npm run check` and looks
like a product, not an MVP.

### 2. The add-on core: Conductor and stage runner — not started

- [ ] Conductor in `host.ts`: run state machine, graph scheduling with fan-out, retries (1 per
      stage), caps (3 revisions per gate), resume after restart, a watcher tick (1 min).
- [ ] Stage runner on `api.chats.create/send/get` with `factory.concurrency` (default 3); one chat
      per stage, named "Factory · <run> · <stage>", in the run's project.
- [ ] Unattended runs (D-438): widen D-363 so Jig factory may start stage chats in "Don't ask" when
      **you** picked it on the Plan step (user-only, like Add tasks); new decision entry
      ([architecture.md](28-factory/architecture.md) → The stage runner).
- [ ] Recipes loader (`lib/recipes.ts`): built-in `addons/factory/recipes/*.md`, overrides in
      `<repo>/.jig/factory/recipes/`, validation, hot reload; tracks as data (`tracks/*.json`).
- [ ] Jig's tools for stage chats (`claude.tool` slot): `factory_brief`, `factory_report`,
      `factory_ask`, `factory_questions` (interview), and `claude.context` telling a stage chat its
      role, run and what to report. All engine-neutral (Claude and ChatGPT chats); fake-engine rows
      for each. A recipe's provider and model come from `addons/shared/providers.ts` (D-412).
- [ ] Output files with front-matter status in `docs/factory/<run>/` on branch `factory/<slug>` (D-427),
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
      suggestion with reasons; new product → ask about the repository (D-428), name and logo (D-435);
      languages (D-437).
- [ ] Plan step: the run's stages, outputs (pre-ticked per track, untick), gate owners picked by
      hand (D-431), level, languages; Start.
- [ ] "Start Jig factory" from a meeting (Meetings' actions) and from a message (`context.message`).

**Done when:** from a voice note or a meeting you reach a one-page brief you would sign, and a plan.

### 4. The demo, end to end — not started

- [ ] Design director: product kit from the product repo (tokens + reference screenshots,
      `.jig/factory/kit/`); for a new brand, 3 directions (GD gate, direction cards).
- [ ] Demo builder (L1) on the demo kit; critic loop (score → fix list → rebuild, max 3 rounds,
      D-434); the quality gate's results on the run.
- [ ] Demo review tab: device frames (desktop, tablet, phone) side by side, v1–v3 switcher with
      change log, comment pins on screens, critic scorecard, Approve / Ask for changes (modal) = G1.
- [ ] L2 path: product engineer recipe on `factory/<slug>`, feature flag, demo data; the demo is the
      running product (you start it; deploys stay manual).
- [ ] Preview through the Pages add-on (scripts on for demos), "Open in browser".

**Done when:** idea → interview → a polished demo in Jig, reviewed and approved.

### 5. The pack — not started

- [ ] Recipes: spec, user stories (as board cards), test cases, release notes, customer letter,
      glossary delta; pitch, presentation, one-pager, objection handling; e-learning for sales and
      for customers (the workspace's e-learning skill when present); marketing plan, articles,
      LinkedIn drafts, newsletter; teaser film (when the teaser skill is present).
- [ ] Inbox: everything waiting for a person, grouped by gate; approve / edit / reject; statuses
      `draft → reviewed → approved → published` (and `rejected`, `superseded`) with history.
- [ ] Trust numbers per output kind: approved without edits, review time.

**Done when:** an approved demo produces a full pack, each output reviewable in the inbox.

### 6. Reach: phone buttons, other people, publishing — not started

- [ ] Core: phone API for add-ons (D-432, [architecture.md](28-factory/architecture.md) → Phone
      buttons): `phone` permission, `api.phone.send/update`, `phone.action` events, Telegram and
      Teams channels, a reply-with-text button; docs in `addon-api.md`, `26-phone.md`; e2e with the
      fake Telegram server.
- [ ] Jig factory's phone cards: gate waiting (screenshot + Approve / Ask for changes / Open),
      run finished, run stuck.
- [ ] Approvals by others (D-433): a card per gate in the product's board (Boards add-on), polled;
      owner chosen per run.
- [ ] Publish (D-436): asks where (local only / Azure Static Web Apps target from settings) and for
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
