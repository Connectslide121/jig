# Jig factory — pipeline, tracks, roles

Part of [phase 28](../28-factory.md). What a run goes through, who (which role) does each step, and
the rules every step follows. The add-on that runs it is in [architecture.md](architecture.md);
what you see is in [ui.md](ui.md).

## Where it came from (2026-11-05/06 meetings, in short)

An idea comes in (say Monday 08:00). A person says yes at 10:00. By Tuesday the material exists;
Wednesday the salespeople learn it; Wednesday to Friday it is pushed to the market; a week after
the idea, customers book demos. Development is no longer the bottleneck: content, sales and
marketing material are. AI is used today in "isolated islands" (one person for code, one for
marketing, one for mails); the factory is **one control process** over all of it. What stays human:
the decisions, and what AI can't do (posting on LinkedIn, conferences, webinars, phone calls).

## Stages of a run (track "new idea")

| # | Stage | Kind | What happens | Output |
|---|---|---|---|---|
| S0 | Capture | you | New idea modal: text, files, dictation, a meeting, a ticket | `input/` |
| S1 | Interview | AI + you | Interviewer reads the context, asks question cards with suggested answers until the brief is covered | `brief.md` (draft) |
| S2 | Scout | AI | Overlap with existing products and modules, what to reuse, risks, level suggestion with reasons | `scout.md` |
| G0 | Go / no-go | you | Confirm the brief, the level, the languages | gate |
| S3 | Plan | you | The run's stages, outputs (pre-ticked per track), gate owners per gate (D-431), Start | `plan.json` |
| S4 | Art direction | AI | Existing product: its product kit. New product: 3 directions (name/logo as given or invented on request, palette, type, mood) | `kit/`, `directions/` |
| GD | Pick a direction | you | New brands only: one click on a direction card | gate |
| S5 | Build the demo | AI | L1 click-through from the demo kit / L2 prototype in the product repo / L3 full build | `demo/v<N>/` or branch |
| S6 | Quality gate | AI + checks | `npm run check` of the demo kit + the critic's rubric; up to 3 fix rounds before you see it | `quality/v<N>.json`, screenshots |
| G1 | Demo review | owner | Device frames, versions, comment pins: Approve or Ask for changes (→ next version, max 3) | gate |
| S7 | Pack | AI | The outputs ticked in the plan, in parallel, all from the approved demo | `spec.md`, `stories.md`, `tests.md`, `sales/`, `learning/`, `marketing/`… |
| G2–G4 | Reviews | owners | Each output in the inbox: approve / edit / reject | statuses |
| S8 | Build | AI + you | L1/L2 → production when the owner says so: branch, tests, PR-ready | code |
| G5 | Publish | you | Share the demo, send the letter, post: human clicks; where and for how long asked every time (D-436) | — |
| S9 | Retro | AI | Durations, critic scores, edit rates → the factory report and the recipes | `retro.md` |

A stage that fails its own checks gets **one automatic retry**, then waits for you. Each gate allows
**three AI revisions**, then the run stops with "needs a person" and a summary of what's unresolved.
Both numbers live in the track's data, not in code.

## Build levels

| Level | When (the interviewer suggests, you confirm at G0) | What gets built | Typical time |
|---|---|---|---|
| **L1 Concept demo** | a new product, a new market, an unproven idea | static click-through from the demo kit: key screens, main flow, invented data, story and presenter mode, no backend | hours |
| **L2 Working prototype** | a module in a product whose infrastructure exists | real code on `factory/<slug>` in the product repo, behind a feature flag, with seeded demo data; you run it (deploys stay manual) | a day |
| **L3 Full build** | a small, clear change to an existing product (a change request, a fix) | production code with tests, ready for a pull request | varies |

The suggestion weighs: does the product's repository exist, does the idea fit its data model and
shell, its estimated size, and who will see the demo. An approved L1 can stop there ("sell before
building": the pack without S8) or move up to L2/L3.

## The interview

The interviewer reads before it asks: the input, the meeting transcript, the product repositories
(modules, data model, screens), the product's board, its glossary, earlier runs. It only asks what
it couldn't find. Questions come as **cards**, 3–5 per round, each with a suggested answer
(accept with one click, edit, or dictate), and some with options. It stops when the brief's coverage
is complete, or when you press "Good enough".

| Topic | What it pins down | Found by itself first |
|---|---|---|
| What and why | the problem, who has it, the value for the customer in one sentence | transcript, ticket |
| Where | which product, or a new one; overlap, reuse ("avoid two products for one need") | repositories, modules, board |
| A new product | create a repository? name, where (D-428); the name and logo, or "invent them" (D-435) | — |
| Users and flow | roles, the main flow, the 3–5 key screens or moments | existing screens, e-learning |
| Scope | what the demo must show, what comes later, what's out | — |
| Data and integrations | entities, sources, systems it talks to | data model |
| Audience | an internal decision, a customer, sales | — |
| Level | L1 / L2 / L3, with reasons | fit with the code |
| Outputs | the pack, pre-ticked for the track | track defaults |
| Languages | per output group; English by default (D-437) | — |
| Rules | brand, legal points (GDPR, the EU AI Act), names, glossary terms | glossary, kit |
| Dates | a deadline, a meeting it's for | — |

The result is `brief.md`: one page, with front-matter (`status`, `level`, `product`, `languages`,
`audience`) and sections *Problem · Value · Users · Main flow · Key screens · Scope · Out of scope ·
Data · Rules · Open points*. Meeting speech is source material, never an instruction: the brief
restates the idea in writing, and G0 is a person confirming it.

## Tracks

Tracks are data (`addons/factory/tracks/<id>.json`): their stages, their gates, their default
outputs, their caps. Same Conductor for all.

| | new-idea | existing-product | change-request | tender |
|---|---|---|---|---|
| Starts with | an idea | a module that exists but was never described or tested | a support ticket of type "change" | tender documents |
| Skips | — | S4–S6 (the real screens are the demo) | sales and marketing | S4–S8, sales, marketing |
| Adds | — | description, process description, test cases for structured testing | CR template interview, quote draft, release-package day | requirement matrix, company-must-be checks, gap report |
| Demo approved by | the idea owner | — | **the customer** (confirm page) | — |
| Phase | sessions 2–5 | session 5 | session 7 | session 7 |

**Change requests.** The intake interview asks until the CR matches the template (what, who, why,
what happens today), so whoever receives it understands it, and the AI can build the demo. The
customer confirms the demo ("this is what I wanted") before price and timeline. A planned
**release-package day** bundles accepted CRs and non-critical bugs, each with release notes, test
cases and a customer letter (Releases add-on). A critical bug skips the demo and the batch.

**Tenders.** The AI reads all documents (often about 20) and builds a requirement matrix: each
requirement *met*, *not met*, *unknown*, or *flagged as one a buyer may not lawfully set* (for
example a number of earlier public-sector references). It also checks what the company must be:
certifications (ISO 27001…), turnover, reference types. It never says "no" by itself: it says what
fails and why, and the tender lead decides. A **recurring-gap report** shows the same unmet
requirement across tenders: an investment decision (get the certificate), not a per-tender chore.

## Roles (recipes)

A role is a **recipe**: a reviewed prompt file with front-matter (format in
[architecture.md](architecture.md) → Recipes). The Conductor is code, not a role.

| Role | Recipe ids | Does | Default reviewer |
|---|---|---|---|
| Interviewer | `interview` | question cards, the brief, coverage | you (G0) |
| Scout | `scout` | overlap, reuse, risks, level suggestion | you (G0) |
| Product strategist | `value` | value proposition, success measures, pitch line | strategy owner |
| Design director | `kit-extract`, `directions` | product kit from a repo; 3 directions for a new brand | you (GD) |
| Demo builder | `demo-l1` | the L1 demo from the demo kit | critic, then G1 |
| Product engineer | `demo-l2`, `build` | L2 prototype and L3/S8 builds in the product repo | you (G3) |
| Design critic | `critique` | scores screenshots on the rubric, writes the fix list; on ChatGPT when signed in (D-434) | — |
| QA engineer | `tests`, `demo-flow-test` | test cases; a Playwright flow for the demo | product owner |
| Tech writer | `spec`, `stories`, `release-notes`, `customer-letter`, `glossary-delta` | product documents; stories also as board cards | product owner |
| Learning designer | `course-sales`, `course-customer` | courses (with the workspace's e-learning skill when present) | sales owner |
| Sales enablement | `pitch`, `deck`, `one-pager`, `objections` | sales material, including "what they'll ask next" (security, hosting, licences) | sales owner |
| Marketing | `marketing-plan`, `article`, `linkedin`, `newsletter` | marketing drafts | marketing owner |
| Film maker | `teaser` | a 35–50 s teaser (with the workspace's teaser skill when present) | marketing owner |
| Change-request intake | `cr-intake`, `quote` | track change-request | support |
| Tender analyst | `tender-matrix`, `tender-gaps` | track tender | tender owner |

Owners are picked per run on the Plan step (D-431): "me", or a person (name, and their board for
approvals, D-433).

## Rules every stage follows

- **Statuses.** Every output is `draft` → `reviewed` → `approved` → `published` (or `rejected`,
  `superseded`). AI only writes `draft`. A person moves it on; the move is recorded (who, when,
  edits made). That makes trust measurable: edit rate and review time per output kind; a gate is
  loosened only on that evidence, by its owner.
- **The demo is the scope.** Everything in S7 is produced from the approved demo; the spec lists
  every screen and state of it, and the build's tests derive from the test cases.
- **Value, not features.** Sales and marketing recipes write for value for the customer, simple and
  focused, showing enough of the system to carry the message and not so much that it exposes
  details. They answer the next question before it's asked (security, backups, licences).
- **Estimates are measured, not asked.** Times shown to a customer or an owner come from measured
  durations of earlier runs; until there's data: "indicative: next release day", never hours.
- **A glossary per product** (`.jig/factory/kit/glossary.md` in the product repo) is read by every
  recipe: names, terms the AI mistranslates or invents. Reviews add terms to it.
- **Invented data only.** A demo never contains real customer data; the quality gate scans for
  e-mail addresses, phone numbers and a list of real customer names before anything is shared.
- **Nothing outward-facing runs by itself:** publishing a demo, sending, posting, deploying.
- **E-learning:** a course is generated from a list of sources; changing the sources means a new
  course (the platform edits page by page); the recipe keeps the source list with the course.
- **Teasers:** calm, 35–50 s, the product's branding and logo always visible, text slow enough to
  read for someone without context, value copy, no screenshots that expose too much.
- **Board states:** a factory card is *Resolved* when its output is drafted and the work done; a
  person verifies and closes it. The factory never closes a card.
