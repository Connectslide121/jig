# Jig factory — architecture

Part of [phase 28](../28-factory.md). How the add-on is built. Read `docs/reference/addon-api.md`,
`docs/reference/slots.md` and an existing built-in add-on (`addons/tasks/`, `addons/workflows/`)
first: Jig factory follows the same patterns.

## Shape

```
addons/factory/
  addon.json          manifest (below)
  host.ts             Conductor: runs, stage runner, gates, watcher tick, tools, exports
  ui.tsx              views and tabs: Floor, Run, Interview, Demo review, Inbox, Settings
  parts.tsx / parts/  UI pieces: RunCard, StageGraph, OutputCard, QuestionCard, BriefPanel,
                      DeviceFrames, ScoreCard, GateOwnerPicker, Inspector… (session 0: one parts.tsx)
  lib/                pure logic, unit-tested (*.test.ts beside each file)
    run.ts            types, run/stage/output/gate transitions
    graph.ts          a track's stage graph: what may start now, fan-out, joins
    gates.ts          owners, caps (revisions, retries), the inbox, trust numbers
    floor.ts          the Floor's lanes, a card's progress, the KPI strip, the stage-graph boxes
    samples.ts        the sample runs shown until runs can be started (D-440)
    recipes.ts        parse + validate recipe files, resolve overrides, build a stage's prompt
    frontmatter.ts    read/write an output file's front-matter status and history
    quality.ts        the critic's rubric, the kit's check.json, pass/fail
    slug.ts           run ids, branch names
  recipes/            built-in recipes (*.md)
  fixtures/demo/      the sample runs' demo page (static HTML)
  tracks/             new-idea.json, existing-product.json, change-request.json, tender.json
  README.md
```

The **Conductor** is plain code: AI runs only inside a stage's chat. No other agent runtime (AGENTS.md:
each engine drives an official CLI).

## Manifest (sketch)

```jsonc
{
  "id": "factory",
  "name": "Jig factory",
  "icon": "factory",
  "storage": { "scope": "project" },
  "permissions": ["chat", "chat:read", "ai", "exec", "fs:read", "fs:write", "phone"],
  "exports": ["startRun", "runs"],
  "contributes": {
    "views":    [{ "id": "factory", "title": "Jig factory", "region": "left", "startHidden": true }],
    "tabs":     [{ "id": "floor" }, { "id": "run" }, { "id": "interview" }, { "id": "review" }, { "id": "inbox" }],
    "topbar":   [{ "id": "factory", "icon": "factory", "title": "Jig factory" }],      // count of what waits for you
    "dashboard":[{ "id": "waiting" }],
    "actions":  [{ "id": "new-idea", "title": "New idea…" }, { "id": "open-floor", "title": "Jig factory" }],
    "menus":    [{ "slot": "context.message", "id": "from-message", "title": "Start Jig factory from this" }],
    "tools":    [ /* factory_brief, factory_report, factory_ask, factory_questions, factory_runs */ ],
    "context":  [{ "id": "stage" }],          // tells a stage chat its role, run, inputs, how to report
    "watchers": [{ "id": "tick", "every": "1m" }],
    "settings": [{ "id": "factory" }],
    "search":   [{ "id": "runs" }]
  }
}
```

Exact keys follow `docs/reference/slots.md`. The view is listed in View → Views (hard rule: no hidden
features); New idea is also in the top bar's menu.

## Data model (`lib/run.ts`)

```ts
type Level = "L1" | "L2" | "L3";
type TrackId = "new-idea" | "existing-product" | "change-request" | "tender";

interface Run {
  id: string;                 // "fx-<base36>"
  slug: string;               // "shift-swap" → branch factory/shift-swap, folder docs/factory/shift-swap
  title: string;
  projectId: string;
  repo?: string;              // the product repo (absolute path); unset until chosen/created (D-428)
  track: TrackId;
  level?: Level;
  languages: Record<string, string>;   // output group → language; default "en" (D-437)
  state: "interview" | "planning" | "running" | "waiting" | "stuck" | "done" | "stopped";
  brief?: BriefMeta;          // front-matter of brief.md + coverage
  owners: Record<GateId, Owner>;       // set by hand per run on the Plan step (D-431)
  stages: StageRun[];
  outputs: Output[];
  gates: GateState[];
  createdAt: string; updatedAt: string;
  source: { kind: "typed" | "voice" | "meeting" | "message" | "ticket"; ref?: string };
}

interface StageRun {
  id: string;                 // "S5" or "S7:spec"
  recipe: string;             // recipe id
  status: "blocked" | "ready" | "running" | "needs-you" | "done" | "failed" | "skipped";
  chatId?: string;            // the stage's chat (api.chats)
  attempt: number;            // retries: 1 automatic, then needs-you
  version?: number;           // demo version for S5/S6 (v1..v3)
  startedAt?: string; endedAt?: string;
  report?: { summary: string; outputs: string[]; notes: string[] };
}

type OutputStatus = "draft" | "reviewed" | "approved" | "published" | "rejected" | "superseded";
interface Output {
  id: string; kind: string;   // "demo", "spec", "pitch"…
  path: string;               // relative to the run folder
  version: number; status: OutputStatus;
  history: { status: OutputStatus; by: string; at: string; edited: boolean; note?: string }[];
}

type GateId = "G0" | "GD" | "G1" | "G2" | "G3" | "G4" | "G4m" | "G5";
interface Owner { kind: "me" | "person"; name?: string; board?: { org: string; project: string } }
interface GateState {
  id: GateId; status: "closed" | "waiting" | "approved" | "changes" | "rejected";
  revisions: number;          // AI revisions used (cap 3)
  decidedBy?: string; at?: string; note?: string; pins?: Pin[];   // comment pins from demo review
}
interface Pin { screen: string; x: number; y: number; device: "desktop" | "tablet" | "phone"; text: string }
```

Storage: `runs` (index) and `run:<id>` in the add-on's project-scoped storage (D-116). The run's
**content** is files in the product repo; storage holds only state. Every transition is a pure
function in `lib/run.ts` (`startStage`, `finishStage`, `decideGate`…), so the Conductor is a thin
loop and the rules are unit-tested.

## Tracks (`tracks/*.json`)

```jsonc
{
  "id": "new-idea",
  "caps": { "revisionsPerGate": 3, "retriesPerStage": 1 },
  "stages": [
    { "id": "S1", "recipe": "interview", "interactive": true },
    { "id": "S2", "recipe": "scout", "after": ["S1"] },
    { "gate": "G0", "after": ["S2"] },
    { "id": "S4", "recipe": "kit-extract", "after": ["G0"], "when": "product.exists" },
    { "id": "S4b", "recipe": "directions", "after": ["G0"], "when": "!product.exists" },
    { "gate": "GD", "after": ["S4b"] },
    { "id": "S5", "recipe": "demo-{level}", "after": ["S4|GD"] },
    { "id": "S6", "recipe": "critique", "after": ["S5"], "loop": { "back": "S5", "until": "quality.pass", "max": 3 } },
    { "gate": "G1", "after": ["S6"] },
    { "fanout": "S7", "after": ["G1"], "outputs": "plan.outputs" },
    { "gate": "G2", "after": ["S7:spec", "S7:stories", "S7:tests"] },
    { "gate": "G4", "after": ["S7:pitch", "S7:deck", "S7:course-sales"] }
  ]
}
```

`lib/graph.ts` answers "what may start now" from a track and a run's state: joins, fan-out over the
plan's outputs, `when` conditions, loops with a cap.

## Recipes (`recipes/*.md`)

```markdown
---
id: pitch
role: Sales enablement
inputs: [brief, demo.approved, kit.glossary, scout]
outputs: [sales/pitch.md]
provider: claude          # or chatgpt; models from addons/shared/providers.ts (D-412)
model: default
reviewer: G4
checks: [frontmatter, words<=600, glossary]
languageGroup: sales
---
You are the sales enablement role of Jig factory… (the reviewed prompt)
```

Built-ins live in `addons/factory/recipes/`; a product repo overrides one by putting a file with the
same `id` in `<repo>/.jig/factory/recipes/` (committed). `lib/recipes.ts` validates (known inputs,
outputs inside the run folder, a reviewer gate that exists) and builds the stage prompt: recipe
text + the run's inputs (paths) + the rules from [pipeline.md](pipeline.md) → Rules + how to report.

## The stage runner (D-425)

- The Conductor starts a stage with `api.chats.create({ projectId, cwd: repo, title, provider,
  model, permissionMode })` and `api.chats.send({ sessionId, text: prompt, from: "factory" })`,
  at most `factory.concurrency` (default 3) at a time across all runs.
- Jig follows the chats it created (D-182); on `chatChanged` and every watcher tick it asks
  `api.chats.get` and moves the run on. A stage is finished when its chat called `factory_report`
  and is idle with nothing in the background (the rules of the Tasks add-on's `chatFinished`,
  D-318; copy the pure part into `addons/shared` if both need it, D-415).
- A chat that ends a turn without reporting gets one nudge (`from` message), then the stage is
  `needs-you` with the chat's last answer.
- `limit` (D-338) and `waitingFor` (D-326) on `chats.get` show as "waiting for the plan's reset"
  or "needs you" on the run.
- **Unattended runs (D-438) need a core change.** `chats.create` allows `bypassPermissions` only from
  the Tasks add-on (D-363), and stage chats run commands (`npm run check`, `git commit`) that
  `acceptEdits` would stop at. Session 2 widens D-363 to Jig factory, for a run where **you** chose
  "Don't ask" on the Plan step (a user-only choice, like in Add tasks), with a new decision entry.
  Without it, stage chats run in `acceptEdits` and stop at each command for you.

## Tools for stage chats (`claude.tool` slot, engine-neutral)

| Tool | For | Read-only |
|---|---|---|
| `factory_brief` | the run's brief, plan, kit paths, earlier outputs, the stage's inputs | yes |
| `factory_questions` | the interviewer posts question cards (`{ id, text, suggestion, options? }[]`) and gets your answers | no |
| `factory_report` | a stage reports: outputs written, summary, notes, quality numbers | no |
| `factory_ask` | a stage needs a person: the run goes `needs-you` with the question | no |
| `factory_runs` | any chat: list runs and what waits (also for "how is the factory doing?") | yes |

`claude.context` gives a stage chat its role, run, stage, inputs and "report with `factory_report`
when done". Each tool gets a fake-engine row (`docs/guides/testing.md`).

## Files in the product repository (D-427)

```
<repo>/
  .jig/factory/
    recipes/               overrides (committed)
    kit/                   tokens.json (DTCG), screenshots/, glossary.md, brand.md
  docs/factory/<slug>/     on branch factory/<slug>
    input/                 what came in (text, files, meeting excerpt)
    brief.md  scout.md  plan.json
    directions/            new brands: 3 direction boards
    demo/v1/ v2/ v3/       static demo folders (L1), each with CHANGES.md
    quality/v1.json …      check.json + critic scores; screenshots/
    spec.md  stories.md  tests.md  release-notes.md  customer-letter.md
    sales/  learning/  marketing/  teaser/
    retro.md
```

Every Markdown output starts with front-matter: `status`, `recipe`, `version`, `run`, `provider`,
`model`, `createdAt`, and `history` once a person acts. The stage chat commits on `factory/<slug>`
(small commits, the run id in the message); it never pushes. The branch is merged when the pack is
approved: a button on the Run tab that shows the git commands it will run first.

A **new product** with no repository: the interview asks whether to create one (D-428), the name and
the folder; Jig factory runs `git init` there (and nothing remote) only after you say yes.

## Viewing demos

- The demo kit builds a self-contained static folder (no network; Pages and the review tab load it
  without a server). The Demo review tab shows `demo/v<N>/index.html` in sandboxed frames at three
  device sizes. Check in session 4 whether an add-on frame can load a local folder directly, or
  whether it goes through the Pages add-on (`pages` export) or a new SDK helper; record the choice
  as a decision.
- "Open in browser" and "Show in Pages" for the full-size view; Pages keeps versions.

## Phone buttons (D-432, core change, session 6)

Today `main/phone/` sends core cards with buttons (permissions, questions, plans) through
`PhoneChannel` (`channel.ts`, Telegram and Teams), and `jig_phone_send` sends text and a picture;
add-ons have nothing. Add:

```ts
// host API, permission "phone"
api.phone.send({ text, image?: string /* png path */, buttons?: { id: string; label: string; reply?: boolean }[] })
  → { messageId } | { error: "not_paired" | "off" }
api.phone.update(messageId, { text, buttons? })      // e.g. "Approved on the computer"
// event to the add-on's host
on("phone.action", ({ messageId, buttonId, text? }) => …)   // text: the reply after a `reply: true` button
```

Rules: masked and cut like every phone text; only the paired account; buttons map to the add-on's
own ids (never commands); answered elsewhere updates the card. Docs: `addon-api.md`, `26-phone.md`,
`slots.md` if a manifest key is needed; e2e on the fake Telegram server (`e2e/phone.spec.ts`).

Jig factory's cards: **"<run> · Demo v2 is ready"** (screenshot, Approve · Ask for changes · Open in
Jig); **"<run> needs you"** (the question, Answer · Open); **"<run> is done"** (summary, Open).

## Approvals by other people (D-433)

For a gate owned by a person: a card in the product's board (Boards add-on) titled
"<run> · <gate>", assigned to them, with links to the outputs. The watcher reads its state:
moved to the board's resolved column = approved; a comment starting "changes:" = ask for changes.
The board's column roles come from the Boards add-on's data.

## Settings (`settings.page`, `ConfigSchema`)

`factory.demoKitPath`, `factory.concurrency` (1–6, default 3), `factory.critic` (provider:
`chatgpt` when signed in, else `claude`), `factory.publishTargets` (Azure Static Web Apps sites,
asked at each publish, D-436), `factory.defaultLanguage` (`en`). Settings that run programs or decide
spending go into `PROTECTED_SETTINGS` (D-077).

## Exports (other add-ons, D-215)

`startRun({ projectId, text, source })` (Meetings' "Start Jig factory", the Tasks report's
follow-ups) and `runs({ projectId? })` (dashboards).
