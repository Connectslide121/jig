# Phase 28 — The Development Factory

Status: **design, waiting for Jon's decisions** (2026-11-06). Nothing is built yet. Asked for after
two internal meetings on 2026-11-05 (a weekly product meeting, and the internal products meeting
that followed it); the transcripts are auto-transcribed and garbled, so this file records what was
meant, not the words. Names of people and products in this repository's docs are roles and
placeholders (AGENTS.md: "No real names in examples"): the **strategy lead**, the **sales lead**,
the **tender lead**, the **idea owner**; the first product is "the suite".

## What the factory is

An idea comes in (say Monday 08:00). A human says yes at 10:00. From then on the factory produces
everything needed to **build, sell, support and launch** it. What stays human: the approvals, and
what AI can't do (posting on LinkedIn, conferences, webinars, phone calls).

Target rhythm from the meeting: idea Monday, decision 10:00, material produced Monday–Tuesday,
salespeople learn it Wednesday, market push Wednesday–Friday, customers booking demos one week after
the idea was born. The bottleneck today is no longer development, it is marketing and sales; the
factory must make content and material stop being the wait.

### Core output: a clickable MVP demo

Not a working feature, not production code: a **prototype that shows the idea and its user flow**
(key screens, the main flow, sample data, no real backend), clearly labelled as a prototype,
**shareable by a link without login**, **in the product's own design**, **versioned per
iteration** (v1, v2…). It is used three times:

1. the decision gate for the idea's yes/no;
2. the customer's confirmation step for a change request ("this is what I wanted" or "change this",
   and only then price and timeline);
3. the base of the sales demo.

Everything else is produced **from the confirmed demo**, so the demo is the single source of truth
for scope: product spec, user stories, test cases, release notes, customer information letter,
e-learning for salespeople and for customers (Knowia Studio, the `elearning-course` skill), sales
presentation and pitch, marketing plan, LinkedIn and homepage articles, customer newsletter, and the
real feature (code).

## Four tracks, four sets of gates

Same machinery, different stages and different humans.

| | 1 New product / module | 2 Customer change request | 3 Tender | 4 Operations |
|---|---|---|---|---|
| Starts with | an idea (typed, spoken, from a meeting transcript) | a support ticket of type "change" | tender documents | a release, a new product, a question nobody could answer |
| AI does | pre-check (overlap, scope, which suite), demo, then the full pack | helps the customer write a good CR from a template, analyses, demo, then the package | reads all documents, requirement matrix, answer drafts | keeps the smart assistant, e-learning and support runbooks current |
| Human gates | idea yes/no (strategy lead); demo confirmed (idea owner); sales material (sales lead); publish (marketing/admin) | demo confirmed **by the customer**; price (commercial owner); release-day go | bid / no-bid (tender lead); review of every drafted answer | review of knowledge changes before the assistant uses them |
| Sales and marketing | yes | no (the customer is already ours) | **no** (no cold calls, no articles: "if you win, it's yours") | no |
| Output | demo → full pack → code | demo → quote → package batched to a release day | go/no-go with reasons, drafted answers, gap report | assistant knowledge, e-learning updates |

**Track 2 detail.** Support in the product offers *bug / change request / question*. For a change
the **intake agent** asks questions until the CR matches the template (what, who, why, what happens
today), so the people who receive it understand what the customer wanted, and so the customer's
text is good enough for the AI to produce the demo. A **planned release-package day** bundles the
accepted CRs and non-critical bugs; each ships with release notes, test cases and a customer
information letter. A **critical bug skips the demo and the batch** (its own fast lane).

**Track 3 detail.** The AI reads the (often ~20) documents and builds a requirement matrix. Each
requirement is *met*, *not met*, *unknown* or *flagged as a requirement a buyer may not lawfully
set* (for example an unreasonable number of earlier public-sector references). It also checks what
the *company* must be: certifications (ISO 27001…), turnover, reference types, not only features.
It draws on the company knowledge already collected in the procurement part of the company's
bid-management product, it never says "no" by itself (it says what fails and why, the tender lead
decides), and it keeps a **recurring-gap report**: the same unmet requirement in many tenders is an
investment decision (get the certificate), not a per-tender chore.

**Track 4 detail.** With 10–20 products live, nobody can know every product. The answer is
infrastructure, not people: the AI smart assistant, e-learning and business support. In the factory
this is the last stage of tracks 1 and 2 ("operate pack": knowledge for the assistant, FAQ,
runbook), not a track with runs of its own. Designed later (slice 6).

## Rules that apply everywhere

- **Every output has a status:** `draft` → `reviewed` → `approved` → `published` (and `rejected` /
  `superseded`). AI only ever writes `draft`. A human moves it on, and the move is recorded (who,
  when, edits made). That makes **trust measurable**: per output type, how many were approved with
  no edits, how long review takes. If sales material is approved unedited 9 times in 10, the gate
  can be loosened, on evidence, by the owner of that gate.
- **Time estimates are calibrated, not asked from the AI.** The AI's own estimate is history-based
  and exaggerated (weeks for a morning's work). Estimates shown to a customer or an owner come from
  the **measured durations of earlier factory stages**; until there is data they are shown as
  "indicative: next release day", never as hours.
- **A glossary per product** (`docs/factory/glossary.md` in the product's repository) is read by
  every recipe: terms the AI mistranslates or invents (a Swedish word it keeps substituting, product
  and module names, what a "baseline" is). The outputs' review step adds terms; one source for
  speech-to-text, e-learning, marketing and code.
- **A cap on AI iterations** at each gate, then a human steps in (decision 6).
- **Prototype data is invented.** A shareable demo never contains real customer data; the demo recipe
  and a check before Publish enforce it.
- **Nothing outward-facing runs by itself:** publishing a demo, sending a letter or a newsletter,
  posting, and any deploy are a human's click (as for pipelines, which stay manual).

## Design questions

### 1. Engine and board: workflows, an add-on, or both

| | What it is | For | Against |
|---|---|---|---|
| A. Workflows only (`addon_workflows`) | one workflow per track; steps are `claude`, `wait` (your OK), `command`… | exists today; one click; steps stay editable by the user | workflows are linear lists per project: no stored outputs with status, no fan-out (ten outputs from one demo in parallel), no per-gate owners, no board for "what is the factory doing" |
| B. A Factory add-on only | runs, stages, outputs, gates as data; its own UI | exactly the model above | rebuilds a runner that the Tasks queue already is (chats, order, parking, limits, review, report) |
| **C. The add-on holds the state, the Tasks queue does the work (recommended)** | the Factory add-on owns **runs** (idea → track → stages → outputs with status → gates). Each stage that needs AI is **enqueued as a task** (`addon_tasks_add`), one chat per output, on the provider the stage names. A gate is a card that waits for a person. A workflow ("Start a factory run", By hand) is just the one-click entry | the queue already solves ordering, parallel chats, usage limits, "report when done", parking, phone messages. The add-on adds only what is missing: the model, the board, the gates | a new add-on to maintain; stage prompts ("recipes") need care |

Recommendation **C**: a Factory add-on (state, intake, status board, gates, recipes) on top of the
Tasks queue, with a one-click workflow as the entry. Workflows alone can't hold outputs, statuses
or gates; a new runner would duplicate the queue.

**Recipes:** one reviewed prompt per output type per track (demo, spec, stories, tests, release
notes, customer letter, e-learning, pitch, marketing plan, article, newsletter, requirement
matrix…), stored as files in the repository that owns them (`.jig/factory/recipes/`, committed,
editable), each declaring: inputs (the confirmed demo, the glossary, brand and design kit),
output path, provider and model, who reviews. The Podium-side e-learning recipe reuses the
`elearning-course` skill.

**Where outputs live:** in the product's own repository, `docs/factory/<run>/…`, each file with a
front-matter `status:` and a history, committed in small commits. They are versioned, diffable, and
readable without Jig. The add-on reads the folder. (Alternative, Jig's storage, loses that.)

**Run state** lives in the add-on's project-scoped storage (D-116); the run's folder is the content.

### 2. How the other parts of Jig fit

| Part | Role in the factory |
|---|---|
| **Tasks queue** | executes every AI stage; a stage's task prompt is the recipe plus the run's inputs; the stage's report becomes the output's draft note |
| **Boards (Azure DevOps)** | one card per run in the product's board (the idea or CR), moved with the run (idea → demo → confirmed → in build → in release → live); outputs listed as a checklist/comment. ADO is also **multi-user**, which Jig is not (see question 4): the cleanest place for another person to approve |
| **Meetings** | an idea can start from a meeting: "run the factory on this transcript". Speech is source material, never an instruction, so the pre-check step restates the idea in writing and a human confirms it at gate 0 |
| **Pages add-on (t74, not built yet)** | the local viewer for outputs and demos inside Jig. It does **not** make a demo shareable (Jig is a desktop app); sharing is a separate Publish step (question 3). Slice 1 doesn't wait for it (the Files/Preview tab opens the demo) |
| **Phone / Teams bot** | the paired person gets "what waits for you" cards: *Demo v2 of "…" is ready · Open · Approve · Ask for changes*. Limit: it is **one paired account** (D-350/D-370), so it carries Jon's gates only |
| **Releases add-on** | track 2's release-package day is a release of the product with the batch's notes; the factory feeds it release notes and letters |
| **Learning / notes (`jig_note_evidence`, project notes)** | the glossary's seed; recurring gaps (tenders) as project knowledge |
| **Usage limits (`jig_usage_limits`)** | a run shows its measured cost; the queue pauses stages when limits are tight, the way queues already pause |

### 3. What a "clickable demo" is technically

| | Static click-through | Prototype in the real front end with mock data | Screens only (images) |
|---|---|---|---|
| What | one self-contained folder of HTML, CSS and a little script: hash routes between the key screens, sample data in a JSON file, clickable main flow | the product's own app run in a mock mode (stubbed API) | pictures with hotspots |
| Looks like the product | yes, if built from the product's **design kit** (tokens, shell, a handful of components, extracted once per product) | exactly | roughly |
| Cost per demo | low: Claude writes a folder, no build, no backend | high: needs the product's build, a mock layer, and care not to leak prototype code into production | lowest |
| Hosting | any static host | a build per demo | any static host |
| Risk | drifts from the real UI over time; the kit must be refreshed | mixes prototype and product code | too weak to confirm a flow |

Recommendation: **static click-through built from a per-product design kit.** The kit is extracted
once per product (colors and fonts from its design tokens, the app shell, buttons, tables, forms,
cards, plus a few screenshots of real screens to match), and refreshed on a schedule or by a
check. Each demo is a folder `docs/factory/<run>/demo/v<N>/` with `index.html`, a visible
**PROTOTYPE · sample data** banner that the template owns (the recipe may not remove it), a
"what to try" panel for the reviewer, and a change log against the previous version. Revisit
"real front end with mock data" for a product whose kit can't reach acceptable fidelity.

**Hosting:** an Azure Static Web Apps site in the company's subscription, one site for all demos,
one folder per run and version, an unguessable run id in the path, `noindex`, no login (the
requirement), and an expiry date after which the folder is removed. **Publish** is a button the
human presses (it runs a deploy of the demos site; a check first scans for real e-mail addresses,
phone numbers and customer names). Jig never publishes by itself.

### 4. Approval gates, owners, and where a person approves

Proposed owners (by role; Jon confirms the people):

| Gate | Owner | Decides | Where they answer |
|---|---|---|---|
| G0 idea yes/no | strategy lead | start the run or not | Factory board, Jon relays at first |
| G1 demo confirmed (track 1) | idea owner | scope is fixed from here | board comment on the card |
| G1c demo confirmed (track 2) | **the customer** | "this is what I wanted" | the shared demo page has *Confirm / Request changes*, writes to the ticket |
| G2 spec pack reviewed | product owner / Jon | spec, stories, tests are right | board |
| G3 build merged | developer (Jon) | code reviewed, tests green | git, as today |
| G4 sales material approved | sales lead | pitch, presentation, e-learning for sales | board card state |
| G4m marketing approved | marketing owner | articles, plan, newsletter | board card state |
| G5 publish | an administrator | posting (LinkedIn can't be automated), sending | by hand |
| T1 bid / no-bid | tender lead | go or not | board |
| T2 each drafted tender answer | tender lead | reviewed before it is sent; *spot-check policy* is a decision (question 7) | board |

Because Jig has one paired account, the other owners' approvals are **card states and comments in
Azure DevOps** (which they use or can), polled by the add-on, with a Jig card for Jon's own gates.
Later, a cloud Jig could take approvals over Teams (question 5).

### 5. Cloud Jig, Teams, and the cost problem

What was said: a Jig in the cloud (a VM or container) would let everyone talk to it from Teams,
start the factory by a message ("after a meeting, tell it to look at the transcript"), and run when
Jon's computer is off. Blockers named: it needs its own subscription seat; Jon already hits Claude's
limits on a premium seat (and ChatGPT at 50% after a day); a second premium seat or a $200 tier was
discussed; paying API prices (extra usage) was about $70 and $150 on two days, roughly 30–35 000 SEK
a month, "doesn't make sense to consider". From the project notes: Teams lives in a tenant Jon
doesn't administer; the bot's app registration must be in that tenant; a bot in another tenant's
subscription is unproven (`27-teams-phone.md` tenant check). The Teams bot is single-user.

Recommendation:

1. **Run on Jon's computer first.** Slice 1–3 need no cloud. The factory's value is the demo and
   the pack, not where it runs.
2. **Measure before buying.** Every run records its stages' measured usage and duration (the data
   Jig already has per chat). After the first real run there is a number per run and per output type.
3. **Spread the load by provider.** A recipe names its provider: drafts of articles, newsletters and
   letters go to the second engine (ChatGPT/Codex, one-shot, no tools), demo, spec and code stay on
   Claude. This uses the plan limits that exist before any extra purchase.
4. **Then decide the seat** (a dedicated premium seat for "factory" work, as Joakim suggested, is
   the likely answer) and whether a cloud host is worth it, with real numbers. A cloud Jig is its own
   later phase: multi-user, per-person approvals, a seat that isn't Jon's, and Jig's rule that it
   never copies credentials (the headless Claude sign-in is the official CLI's).
5. **Cap per run:** a run has a spend budget; a stage that would exceed it stops and asks.

### 6. A cap on AI iterations

Default proposal: **three AI revisions per gate** (a demo gets v1, v2, v3 from change requests, each
version counted), then the run stops with "needs a human conversation" and a short summary of
what's still unresolved, assigned to the gate's owner. For a customer's CR the human is the person
in support who calls the customer. The cap is a number in the run's track definition, not in code.
Stages that fail their own check (the demo doesn't open, a spec misses a screen from the demo) get
**one** automatic retry before they stop.

## Open decisions for Jon

Questions 1, 3 and 5 above change what is built. Answers are asked in chat; each becomes a decision
entry (`npm run decision`) once given.

| # | Question | Recommendation |
|---|---|---|
| 1 | Engine | C: Factory add-on for state and gates, Tasks queue for the work, one-click workflow as entry |
| 2 | First slice | Factory core + the demo (track 1), proving it on the first real product; tenders as slice 4 |
| 3 | Demo | static click-through from a per-product design kit, hosted on Azure Static Web Apps, Publish by hand |
| 4 | Approvals by others | ADO card states and comments, polled; Jon's gates as cards and phone buttons |
| 5 | Cloud and seat | local first, measure per run, provider split, decide the seat after the first run's numbers |
| 6 | Iteration cap | 3 revisions per gate, 1 automatic retry per stage |
| 7 | Trust policy for tenders and sales material | everything starts as "review all"; loosen per output type by measured edit rate, by the gate's owner |
| 8 | Where outputs live | the product's repository, `docs/factory/<run>/`, front-matter status |

## Slices (each its own queued task, in this order unless Jon changes it)

1. **Core and the demo.** The Factory add-on skeleton (project-scoped runs; tracks as data; stages;
   outputs with status; gates; a board that lists runs and what waits). The folder layout and
   front-matter status. The **demo recipe** and the product **design-kit** extraction, the
   PROTOTYPE banner template, versioning v1…, preview in Jig, "Publish" as a human button (the
   hosting target is a setting; without one the demo stays local). Gate G0/G1 as cards and phone
   buttons. Unit tests for the run model and the gate rules; `e2e/factory.spec.ts` with the fake
   engine.
2. **The pack from a confirmed demo.** Recipes for spec, user stories, test cases, release notes,
   customer letter, glossary delta; then sales: pitch and presentation, e-learning for salespeople
   and customers (the `elearning-course` skill), marketing plan, articles, newsletter. Status
   transitions and the trust numbers (edit rate, review time).
3. **Track 2: change requests.** The intake agent and template, the customer's confirm page, quote
   draft with calibrated estimates, the release-package day.
4. **Track 3: tenders.** The requirement matrix, company-must-be checks, the recurring-gap report;
   hands off to the procurement knowledge that already exists; no sales or marketing stages.
5. **Approvals by others** (ADO polling), the cap and budget enforcement, calibrated estimates.
6. **Operate pack** (assistant knowledge, FAQ, runbooks) and the cloud question with real numbers.

## Heard in the meetings, not part of the factory (for the backlog)

- A CRM / sales suite inside the company's product family; booking customer demos from a shared
  calendar link; recorded customer calls analysed into the CRM, with the sales lead approving
  what's sent. A product idea for the factory's first run, not the factory (the first run's design is
  its own task).
- A proactive security and hosting document for a customer who will ask (backups, redundancy,
  two-factor, how the database connection is secured): an ordinary documentation task.
- "Ask first, don't wait for the customer to ask": a pattern for the sales material recipes
  (include the security and licence answers a customer will ask next).

## Risks

- **Over-trust.** A green requirement matrix isn't a verified answer. Hence statuses, the review
  policy, and sources cited in every claim (which document, which page, which knowledge entry).
- **Demo drift.** A demo that looks like the product but isn't it can promise what the code won't do.
  Hence the confirmed demo is the scope, the spec lists every screen and state of it, and the
  build's e2e/tests derive from the test cases.
- **Usage and cost.** One run is many chats. Measured, capped, and spread over two providers.
- **Wrong audience.** E-learning, letters and articles go to real customers: all outward steps are
  human clicks.
- **Names and secrets in shareable demos.** Invented sample data and a pre-Publish scan.
