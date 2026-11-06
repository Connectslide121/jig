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
| [28-factory/motion.md](28-factory/motion.md) | **Motion**, the video add-on (sessions M1–M3): how it works, screens, look settings, architecture |
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
| D-459 | **Impeccable's design playbooks** (pbakaus/impeccable) are bundled, text only and off by default; the design director, demo builders and critic name them in their recipes' `skills` (Jon asked, 2026-11-07). |

Motion, the video add-on (Jon, 2026-11-06; [28-factory/motion.md](28-factory/motion.md)):

| # | Decision |
|---|---|
| D-453 | **Motion** (`addons/motion`): videos from HTML storyboards, useful on its own, planned here (sessions M1–M3); first kinds teaser, what's new, walkthrough; kept per project like Pages; storyboard + settings + live preview; AI only writes, on the chat's provider; MP4 + poster. |
| D-454 | **Rendered with HyperFrames**, installed on first render after you approve; FFmpeg looked for first, downloaded only after you approve. |
| D-455 | **Voiceover with the natural voice** per scene, scene length follows the speech; burned-in captions and `.srt`/`.vtt`; core `api.speech.say`. |
| D-456 | **Music from your own music folder**; Find music opens Pixabay Music; Jig never bundles or fetches tracks itself. |
| D-457 | **Live captures** of an app or demo as scenes, recorded in a hidden window; core `api.capture.record`. |
| D-458 | **Jig factory's teasers are made with Motion** (replaces D-448's demo-kit teaser; HyperFrames stays the engine). |

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
- **Current session:** 4, the demo end to end — not started.
- **Done:** session 0 (decisions D-426…D-442, `addons/factory` with the Floor, Run and Inbox on
  sample runs). Session 1: the demo kit (all of it, passing its own gate), the
  `factory.demoKitPath` setting, skills that can start off (D-443). Session 2: the Conductor, stage
  runner, tools, Run tab sheets and Inspector (D-449…D-452, D-459). Session 3: New idea, the
  Interview tab, the Plan step, meetings and dictation for add-ons (D-460, D-461).
- **Plan changed after session 1** (Jon, 2026-11-06): D-444…D-448 (design sources, two-form deck
  and one-pager, ChatGPT images, e-learning connector, HyperFrames teasers). They change sessions 4
  and 5 (their checklists say how), nothing already built. Their settings join the Settings → Jig
  factory page like `factory.demoKitPath` (D-443). Open: how people without Jig see a demo.
- **Motion added to this phase** (Jon, 2026-11-06, D-453…D-458): a video add-on,
  `addons/motion`, in sessions **M1–M3** between sessions 4 and 5 ([28-factory/motion.md](28-factory/motion.md)).
  Session 5's teaser uses it (D-458 replaces the demo-kit teaser of D-448).
- **The demo kit's code:** branch **`demo-kit`** of this GitHub repository (its own history; it is
  meant to become the repository `jig-demo-kit`, D-431, which could not be created from the agent).
  Get it beside `jig/`: `git clone -b demo-kit <this repo's URL> ../jig-demo-kit`, then
  `npm install && npm run setup` in it. Its README and AGENTS.md say how to use it. Push kit
  commits back with `git push origin HEAD:demo-kit`; push `factory` after every commit too.
- **Half done / next step:** session 3 is done (see its notes). Next: session 4, from its first
  item (the design director). Built-in add-ons read core settings with `api.config()` (D-450).

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

### 2. The add-on core: Conductor and stage runner — done

- [x] Conductor in `host.ts`: run state machine, graph scheduling with fan-out, retries (1 per
      stage), caps (3 revisions per gate), resume after restart, a watcher tick (1 min).
- [x] Stage runner on `api.chats.create/send/get` with `factory.concurrency` (default 3); one chat
      per stage, named "Factory · <run> · <stage>", in the run's project.
- [x] Unattended runs (D-440): widen D-363 so Jig factory may start stage chats in "Don't ask" when
      **you** picked it on the Plan step (user-only, like Add tasks); new decision entry
      ([architecture.md](28-factory/architecture.md) → The stage runner).
- [x] Recipes loader (`lib/recipes.ts`): built-in `addons/factory/recipes/*.md`, overrides in
      `<repo>/.jig/factory/recipes/`, validation, hot reload; tracks as data (`tracks/*.json`).
- [x] Jig's tools for stage chats (`claude.tool` slot): `factory_brief`, `factory_report`,
      `factory_ask`, `factory_questions` (interview), and `claude.context` telling a stage chat its
      role, run and what to report. All engine-neutral (Claude and ChatGPT chats); fake-engine rows
      for each. A recipe's provider and model come from `addons/shared/providers.ts` (D-412).
- [x] Output files with front-matter status in `docs/factory/<run>/` on branch `factory/<slug>` (D-429),
      committed by the stage chat; the Conductor reads them back.
- [x] Run tab live (stage graph, outputs grid, timeline, chats), Inspector (state, prompts,
      reports, timings), re-run a stage, fork a run from a stage.
- [x] e2e: a whole fixture run through every stage with the fake engine in under a minute.

**Done when:** a run walks through all stages with fake roles, in parallel where the graph allows,
and survives a Jig restart.

Session 2 notes: runs start from **Start from a brief…** (factory button, Floor, search action
`start-brief`; D-452) with a golden brief or a pasted one; `startRun` is not exported to other
add-ons. Reference: [docs/reference/factory.md](../reference/factory.md); recipe guide:
[docs/guides/factory-recipes.md](../guides/factory-recipes.md). Things found on the way: an add-on chat
whose first message comes from the add-on (`chats.send`) stayed a draft and was never saved; the
session manager's `notify` now clears `draft` (unit test in `manager.test.ts`). A turn cut off by
Jig closing is resumed with "carry on"; a commit that fails (no git identity) is logged in the
Inspector, never fatal. A stage's `factory_ask` question is answered in its sheet (`answer` with
`reply`). The fake engine plays every role (`engine/fakeFactory.ts`, markers `[fail|noreport|hold|ask
<recipe>]` in a brief; rows in `docs/guides/testing.md`). The golden run (every stage and gate,
critic fails v1 once) takes ~30 s in `e2e/factory.spec.ts`; the click-through test starts a run from
the top bar, answers the scout, approves G0, opens the Inspector and stops the run. Impeccable's
design playbooks are bundled for the design, demo and critique recipes (D-459, `skills:` in a
recipe). Not done here (later sessions' items): Merge branch in ⋯ (session 4/5 with the build),
the Pause button of the mockup (Stop covers it for now).

### 3. New idea and the interview — done

- [x] New idea modal: text, dropped files, dictation (Jig's mic), "From a meeting" picker,
      product picker or "New product" ([ui.md](28-factory/ui.md) → New idea).
- [x] Interview tab: question cards with suggested answers (accept with one click, edit, or
      dictate), the brief building live beside them, coverage meter, "Looks right" (G0).
- [x] Interviewer and Scout recipes ([pipeline.md](28-factory/pipeline.md) → The interview), level
      suggestion with reasons; new product → ask about the repository (D-430), name and logo (D-437);
      languages (D-439).
- [x] Plan step: the run's stages, outputs (pre-ticked per track, untick), gate owners picked by
      hand (D-433), level, languages; Start.
- [x] "Start Jig factory" from a meeting (Meetings' actions) and from a message (`context.message`).

**Done when:** from a voice note or a meeting you reach a one-page brief you would sign, and a plan.

Session 3 notes: core gained `api.meetings.recent` (permission `meetings:read`), `Dictate` in
`@jig/sdk/ui`, and "Start Jig factory…" in a meeting's ⋯ (main calls the factory's export
`ideaFrom`, D-460). The interview's coverage is the brief's nine sections (`lib/brief.ts`,
`parseBrief`); the interviewer rewrites `brief.md` every round, **Good enough** sends `[round n
enough]` and the brief lists its gaps as open points (D-461). The Plan step is the person stage S3:
after G0 the run waits in `planning` until **Start run** in the Plan dialog; a run started from a
brief sets `plan.confirmed`, so the Conductor passes S3 by itself after G0 (`lib/conductor.ts`,
tested). The fake interviewer plays two rounds, a partial brief after round 1, and honours Good
enough (`docs/guides/testing.md`). e2e: the new-idea → interview → Good enough → Plan test, and
Start Jig factory from a chat reply's ⋯ and from a meeting. Add-on CSS: pair container variants
(`@max-3xl:grid-cols-1 @3xl:grid-cols-2`), or the plain one wins (D-297). Not done here: the
"Feels like?" design-source question belongs to session 4 (D-444).


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

### M1. Motion: storyboard, composition and render — not started

The video add-on ([28-factory/motion.md](28-factory/motion.md)); M1–M3 come before session 5,
whose teaser uses Motion (D-458).

- [ ] `addons/motion` skeleton: manifest (D-453), Videos view listed in View → Views, top-bar menu
      (New video…, Videos), empty state, README.
- [ ] `lib/storyboard.ts` (types, validation, timing) and `lib/compose.ts` (storyboard + style +
      template → composition HTML, GSAP and fonts bundled, no network) with unit tests.
- [ ] Templates `teaser`, `whats-new`, `walkthrough` (`template.json`: scene types, inputs schema,
      durations, licence) and a neutral style; HyperFrames blocks adapted where useful, licences kept.
- [ ] Renderer and FFmpeg (D-454): look for FFmpeg (`motion.ffmpegPath`, PATH); install modal for
      what's missing (pinned sources and checksums in `lib/install.ts`) into Motion's data folder;
      render queue (one at a time), progress, cancel, restart-safe; poster image.
- [ ] Video tab: storyboard, live preview with scrubber (the composition itself), settings panel,
      scene side sheet, Render, versions; sidebar / panel / tab widths, Dark and Light.
- [ ] Settings → Motion (`ConfigSchema`, `SETTINGS_GUIDE`, `state.md`); `motion.ffmpegPath` protected.
- [ ] Fake renderer for tests (writes a tiny MP4); `e2e/motion.spec.ts` and its rule in
      `e2e/affected.json`.

**Done when:** you make a what's-new video from the template with screenshots, preview it, render it
to MP4 on your machine.

### M2. Motion: voice, captions, music, captures — not started

- [ ] Core `api.speech.say` (D-455): permission `speech`, the Kokoro process Read aloud uses, WAV in
      the add-on's data folder; `addon-api.md`; host test.
- [ ] Voice per scene: scene length follows the speech; burned-in captions; `.srt` and `.vtt`
      (`lib/captions.ts`, tested).
- [ ] Music (D-456): `motion.musicFolder`, track picker, ducking under the voice, fades; **Find
      music** opens Pixabay Music in the browser; source address kept with the track.
- [ ] Core `api.capture.record` (D-457): permission `capture`, hidden window at the video's size,
      steps (go to, click, type, scroll, wait, highlight), max length, a failing step named;
      `addon-api.md`, `validate.ts` schema, e2e on a local page.
- [ ] Record capture modal (steps list, record, play back, keep); captures as scenes with zooms,
      arrows and highlights; the real-data scan on captures.

**Done when:** a walkthrough of the sample demo with live captures, a natural voice, captions and
music renders on your machine.

### M3. Motion: AI and other add-ons — not started

- [ ] Chat tools (engine-neutral): `motion_create`, `motion_update`, `motion_render`, `motion_list`
      (read-only); tool renderer with the video card; `jigContext` lines; fake-engine rows.
- [ ] Write with Jig in the Video tab (a chat on the current provider, prompt from the video's
      brief and sources), and "New video…" from a chat's ⋯ and from a release (later: Releases).
- [ ] Styles from a product kit, a `DESIGN.md` reference (D-444) or a `theme-factory` theme.
- [ ] Export `createVideo` / `render` (D-215) for Jig factory (D-458).
- [ ] "What Jig can do" line, README line, screenshots, `docs/status.md`.

**Done when:** "make a 40 s teaser for this release" in a chat gives a video you only tweak, and
Jig factory can call Motion.

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
- [ ] Teaser (D-458): the `teaser` recipe calls Motion's `createVideo` with the approved demo's
      screens or captures, the product kit's style, voice and captions in the run's language;
      Motion renders; MP4 + poster in `teaser/` as a draft. Needs sessions M1–M3.
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
