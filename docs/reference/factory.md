# Factory (reference)

The built-in add-on `addons/factory` (phase 28, [plan](../plan/28-factory.md)). It runs an idea through
a **track** of stages and gates: each stage is a chat of its own that follows a **recipe**, writes its
files on the run's branch and reports back; each gate waits for a person. Design:
[28-factory/architecture.md](../plan/28-factory/architecture.md).

## Where things are

| What | Where |
| --- | --- |
| A run's state | the add-on's project storage: `runs` (the ids), `run:<id>`, `inspect:<id>` (the Inspector's log, last 300 entries) |
| A run's files | `docs/factory/<slug>/` in the run's git worktree on branch `factory/<slug>` (D-429, D-451); in the repository itself when it has no commits yet (`worktree: null`) |
| Sample runs | ids `fx-sample-*`, files in the add-on's data folder, never in a repository (D-442) |
| Tracks | `addons/factory/tracks/*.json` (graph: stages, gates, `after`, `when` with `!` and `&`, loops, fan-out; a track's `offers`, `defaults` and `productExists`, D-471): `new-idea`, `change-request`, `tender` |
| A company's profile | `<repo>/.jig/factory/company.md` (certifications, turnover, references): what the tender analyst checks requirements against |
| A release package | `docs/factory/releases/<day>/` in the repository: README, `release-notes.md`, `tests/<cr>.md`, `letters/<cr>.md`, written uncommitted (D-471) |
| Recipes | `addons/factory/recipes/*.md`; a repository overrides one in `<repo>/.jig/factory/recipes/<id>.md` ([guide](../guides/factory-recipes.md)) |
| Golden briefs | `addons/factory/fixtures/briefs/*.md` (tests, evals and **Start from a brief…**) |
| Eval results | the add-on's global storage `evals` (newest 200): brief, recipe hashes, score, pass, demo versions (D-472) |
| The factory report's page | project storage `reportPage`: the Pages page it updates (D-472) |

## The Conductor (`host.ts`)

One loop, serialised (`serial`), driven by the `tick` watcher (every minute and at start), by
`chats.changed` and by your decisions:

- `advance` (lib/conductor.ts) starts the stages whose inputs are done (fan-out per planned output),
  opens gates whose inputs are done, closes the run when nothing is left.
- Up to `factory.concurrency` stage chats run at once across all runs (default 3, 1–6).
- A stage chat is made with `api.chats.create` in the run's project and folder (its worktree), named
  "Factory · <run> · <stage>", with the plan's permission mode: **Accept edits**, or **Don't ask**
  only when you picked it when starting (D-440, D-449).
- A turn's end is read with `afterTurn`: reported → done; ended without a report → one nudge, then
  failed; cut off (plan limit, Jig closed) → "carry on" when it can; asked (`factory_ask`) → waits for
  you. A failed stage is retried once in a new chat, then waits for you.
- Gates: **Approve** marks the gate's drafts approved (front-matter and status), **Ask for changes**
  (a note is required) resets the stages the gate sends back to with the note as feedback, at most 3
  revisions per gate; **Reject** stops the run.
- Every stage's files are committed on the run's branch (`factory <run>: <stage> v<n>`); a failing
  commit (no git identity) is logged, never fatal.
- Restart: running stages are picked up from their chats' state.
- **Phone cards** (D-434, D-468, `lib/phone.ts`): after every step, each run's cards are brought in
  line with `api.phone`: a gate of yours waiting ("<run> · Demo v2 is ready" with the demo's
  screenshot, or "<gate> waits for you" with the outputs to review: Approve · Ask for changes ·
  Open in Jig; GD only Open), a stage that needs you (its one question: Answer · Open; several: Open),
  "is stuck" and, within 30 minutes of finishing, "is done". The run keeps the message ids
  (`Run.phone`, keys `gate:<id>`, `ask:<stage>`, `stuck`, `done`); a card whose subject was settled
  anywhere is edited to say how ("✅ Approved", "✏️ Changes asked: …", "✅ Answered") without
  buttons. The screenshot is the demo kit's first `check/screenshots/` file, else one frame of the
  page through `capture.record`, kept in the add-on's data folder. Not paired or off: tried again
  after a minute. Gates someone else owns don't get phone cards (their board card instead).
- **Approvals by others** (D-435, D-469, `lib/approvals.ts`): with an approvals board picked on the
  Plan step (`plan.approvals`), a gate a person owns gets a card there when it starts waiting
  ("<run> · <gate>", assigned to them, the outputs to review), through the Boards add-on's exports
  `cardAssignee`, `createCard`, `cardStatus` and `commentCard`. After every tick (`boardApprovals`) each
  card is read at most every two minutes: a new comment starting "changes:" asks for changes (the
  rest is the note, decided by `board:<name>`), the card in the board's done column approves. Waiting
  again after changes comments on the same card; decided in Jig or stopped comments and forgets it
  (`GateState.card`). GD stays in Jig. Errors: in the timeline, tried again after five minutes.
- **Tracks** (D-471): a run's `track` picks its graph. **Change request**: S1 is the intake
  (`cr-intake`, a CR from a support ticket), the product is the project's, the pack offers spec, tests,
  release notes, quote and letter (the last four ticked); the quote's estimates come from
  `lib/estimates.ts` (medians of measured stage times, never the AI's guess; "TO FILL IN" below three
  measured runs). A **critical** one (the Plan step's switch, or `critical: true` in the CR) skips the
  kit, demo and G1 and goes S3 → **S8c Fix now** → the pack → G3. **Tender**: no interview; T1 builds
  the requirement matrix (`tender/matrix.json` + `.md`) from the documents and `.jig/factory/company.md`,
  flagging "may not be required"; T2 the gap report with the earlier tenders' gaps; G0 is the bid
  decision. No sales or marketing stages.
- **Release package** (D-471, `lib/package.ts`): Floor → ⋯ → Release package… lists change requests
  whose plan is done, not critical, not packaged: ready once G2 is approved (and G3 when they build).
  It writes the package uncommitted, marks the runs `packaged`, and hands the notes to the Releases
  add-on (`stagePackage`) when it is on: its Release tab offers **Use the release package**.
- **Measure and tune** (D-472): times come only from finished stages of real runs (`measurements`;
  samples and eval runs left out). The **factory report** (`lib/report.ts`) is a self-contained page
  in Pages (system colours, no scripts): runs by track and state, each recipe's median and p80, the
  critic's first passes, scores and demo versions, approved-as-written per kind, and suggestions
  (never applied) for lighter gates (≥5 decisions, ≥90% as written) or recipes to fix (<50%). The
  **Plan step's estimates** (`stageTimes`, `planStageTime`, `planTotal`): each recipe over all
  projects, the build per level, a fan-out as its slowest output; nothing below three measurements.
  **Recipe evals** (`lib/evals.ts`): a run per golden brief marked `Run.eval` (the brief and the
  short hashes of `demo-<level>` and `critique`, overrides included); `evalSteps` after each step
  approves its G0 and GD (first direction) by `eval`, then at G1 (or a stage needing a person)
  records the result and stops the run. Eval runs send no notifications or phone cards.
- **Publish** (D-438, D-470, `lib/publish.ts`, `publish.tsx`): ⋯ → Publish demo… on a demo version
  G1 approved. Where: this computer (a copy of the version's folder in `published/<run>-v<n>/` in the
  data folder) or a `factory.publishTargets` site (the site's mirror in `publish/<target>/`, the version
  at `<run>/v<n>/`, the whole mirror deployed with the pinned Static Web Apps CLI through `npx` and the
  user's az; no deployment token is read). For 7, 30 or 90 days: the page carries a script that
  replaces it with "has ended" after that date. Optionally a fixed bar "Is this what you wanted?" with
  e-mail links to the address given. The pre-publish scan (e-mail, phone, the names in
  `.jig/factory/kit/real-names.txt`, in the demo's text, attributes and script strings) disables
  Publish on any finding. `Run.published` keeps each copy; the Run tab's **Published** list opens it
  and takes it down (removes it, redeploys the site).

## Host methods

Called from the add-on's UI (`ctx.host.call`); `runs` and `ideaFrom` are exported to other add-ons
(Meetings calls `ideaFrom`, D-460).

| Method | Args | Does |
| --- | --- | --- |
| `runs` / `allRuns` | `{projectId}` / – | the project's runs / every project's |
| `run` | `{projectId, runId}` | one run, or `null` |
| `outputFiles` | `{projectId, runId}` | output id → absolute path |
| `startRun` | `{projectId, brief? \| briefText? \| text?, title?, permissionMode?, outputs?, build?, productExists?, level?, track?, critical?, eval?, attachments?}` | a new run (in a worktree when the project is a git repository with commits); a tender needs its documents or a text |
| `tracks` | – | the tracks New idea offers: `{id, title, description, interviews, offers, defaults}` |
| `meetings` | – | your recent ended meetings for New idea's picker (`api.meetings.recent`, permission `meetings:read`) |
| `ideaFrom` | `{text, title?, source?}` | leaves a pending idea and opens New idea with it (a meeting's or a message's ⋯) |
| `briefDoc` | `{projectId, runId}` | the run's brief parsed: sections, coverage, gaps, level, languages (D-461) |
| `enough` | `{projectId, runId}` | Good enough: the interviewer writes the brief from what there is and ends |
| `track` | `{projectId, runId}` | the run's track and plan for the Plan dialog |
| `plan` | `{projectId, runId, outputs, languages, owners, level, build, productExists, permissionMode, approvals?, critical?}` | confirms the Plan step (`plan.confirmed`), the run goes on |
| `decide` | `{projectId, runId, gateId, kind: "approve" \| "changes" \| "reject", note?, pins?, direction?}` | a gate decision; on G1 Ask for changes the Demo review's pins join the note as numbered lines (at most 30), on GD Approve `direction` picks a board (D-462) |
| `decideOutput` | `{projectId, runId, outputId, kind: "approve" \| "reject", note?}` | one pack output and its files (a reason is needed to reject); an edit since Jig wrote it is noticed by its hash and counts against trust; the gate is approved by itself once nothing of it waits and something was approved (D-467) |
| `reviewOf` | `{projectId, runId, outputId}` | the review sheet: the output and the newest version of its other form (deck ↔ deck images, one-pager ↔ its images), each with its file, its Markdown text and its files (PDF, HTML, images) |
| `boardTargets` | `{projectId}` | the Boards add-on's boards that can take cards for the project (`cardTargets`), or a `problem` |
| `storyCards` | `{projectId, runId, outputId, boardId, type?}` | one card per `## ` story of a stories output, through the Boards add-on's `createCard`; only on your click |
| `review` | `{projectId, runId}` | the demo's versions for Demo review: entry file (absolute), change log, scorecard (`pass`, `score`, eight axes, fixes) |
| `directions` | `{projectId, runId}` | GD's direction boards: `{id, name, file}` |
| `publishInfo` | `{projectId, runId}` | the publish targets (name, address), the versions that may go out (G1 approved) and `published` |
| `publishScan` | `{projectId, runId, version}` | `{hits: [{kind: "email" \| "phone" \| "name", value}], files, names}`: the pre-publish scan |
| `publish` | `{projectId, runId, version, where: "local" \| <target>, days: 7 \| 30 \| 90, confirmTo?}` | publishes (scan again first; refuses on findings), records `Run.published`, moves the demo output to `published` |
| `takeDown` | `{projectId, runId, id}` | removes a published copy (and redeploys its site); marks it `takenDown` |
| `showInPages` | `{projectId, runId, version}` | publishes that demo version through the Pages add-on's `publish` export; the run keeps one page (`demoPage`) and each version updates it |
| `tenderMatrix` | `{projectId, runId}` | a tender run's requirement matrix, or `null` |
| `tenderGaps` | `{projectId}` | `{tenders, gaps}`: requirements not met or unknown under the same key in two or more tenders |
| `packageCandidates` | `{projectId}` | change requests for a release package: `{runId, title, slug, waiting, why}` |
| `makePackage` | `{projectId, runIds, day}` | writes the release package of the ready ones (refuses an existing folder), marks them `packaged`, stages it in Releases; `{folder, files, staged}` |
| `stageEstimates` | `{projectId, runId?}` | every recipe's measured time over all projects' runs, the run left out: recipe (and `build@<level>`) → `{n, medianMs?, p80Ms?}` (D-472) |
| `factoryReport` | `{projectId}` | publishes the project's factory report through the Pages add-on's `publish`, updating its one page; the page id |
| `runEvals` | `{projectId, briefs?}` | starts an eval run per golden brief (all of them by default) |
| `evals` | `{projectId?}` | `{rows, results, running}`: results per recipe version (runs, passed, average score, trend, demo versions), newest results first, the project's eval runs still going |
| `answer` | `{projectId, runId, stageId, answers? \| reply?}` | answers the interview's question cards, or a stage's `factory_ask` |
| `rerun` | `{projectId, runId, stageId, note?}` | the stage again as its next version; what follows waits again |
| `fork` | `{projectId, runId, stageId, note?}` | a new run from that stage on a branch of its own |
| `stop` | `{projectId, runId}` | stops starting its stages |
| `inspect` | `{projectId, runId}` | the Inspector's log: prompts, messages, tools, decisions, errors |
| `briefs` | – | the golden briefs |
| `loadSamples` / `clearSamples` | `{projectId}` | the sample runs |
| `tick` | – | one Conductor step (the watcher) |
| `phoneAction` | `{messageId, buttonId, text?}` | the `phone.action` event: a tap on one of its cards; Approve or Ask for changes (the reply's text is the note) on a gate, Answer (the reply answers the stage's one question or its `factory_ask`), Open (a toast on the computer that opens the run) |

Events: `changed` `{projectId, runId}` after every save (the views reload), `storage`.

## Tools for stage chats

Engine-neutral (`claude.tool` slot), so Claude and ChatGPT chats get the same ones. They act only in a
chat that runs a stage (the Conductor knows its chat id).

| Tool | Read-only | Does |
| --- | --- | --- |
| `addon_factory_brief` | yes | the stage's run: brief, plan, files to read and write, outputs, feedback to address |
| `addon_factory_questions` | no | the interview's question cards (with suggested answers); the stage waits for your answers |
| `addon_factory_report` | no | the stage's report: summary, outputs, notes, quality (critique), `failed` |
| `addon_factory_ask` | no | one question to a person; the stage waits for your reply |
| `addon_factory_runs` | yes | the project's runs, short |

`claude.context` tells a stage chat its role, run and stage, and to report.

## Views

- **New idea** (modal, D-460): the track (New idea, Change request, Tender, D-471), the idea typed,
  dictated or pasted, files, a meeting from your history, the project and whether it's for its product
  or a new one; **Start interview** / **Start intake** / **Read the tender** (a tender opens its Run tab).
- **Interview** (tab, D-461): question cards with suggested answers (one click, edit or dictate),
  **Good enough**, the brief building beside them with its coverage, level, languages and open
  points; **Looks right** approves G0 and opens the Plan dialog.
- **Plan** (modal, the person stage S3): stages (struck through when skipped, as the Conductor
  would), the track's outputs with a language per group, a change request's **critical** switch, an owner per gate, level and how chats ask; **Start run**. Each of Jig's stages still to come shows its measured median at the right ("—" without three measurements), and a line under the list the total or how many stages aren't measured yet (D-472). A run
  started from a brief is planned in its start dialog (`plan.confirmed`), so S3 passes by itself.
- **Floor** (tab): lanes of run cards, the KPI strip, **New idea…**, **Start from a brief…**, ⋯
  **Release package…** (modal: whole-row ticks of the ready change requests, why the others wait, the
  day), **Recurring gaps…** (modal: per key, its tenders and status), **Factory report** (to Pages, D-472),
  **Recipe evals…** (modal: **Run evals**, the eval runs going, a row per recipe version with runs,
  passed, average score, trend and demo versions) and the sample runs. Eval runs show as "Eval ·" cards
  while they run and leave the Floor when done; they never count in the KPIs.
- **Run** (tab): the stage graph of the run's own track (each node opens its sheet), outputs,
  timeline and the run's chats; a tender's **Requirements** above the outputs (a fixed box: id, text,
  category, must/should and the status at the right; a status filter and a search; a row opens its
  source and why).
  A **stage sheet** shows status, recipe, version, times, its chats, a question to answer, the report
  and the stage's outputs, with **Open chat**, **Re-run…** and **Fork from here…**. A **gate sheet**
  shows its owner, revisions left and what it reviews, with **Approve**, **Ask for changes** (with a
  note) and **Reject…**. ⋯ has **Inspector**, **Re-run a stage…**, **Fork from a stage…** and **Stop
  the run**.
- **Demo review** (tab, D-462): the demo in three device frames (desktop 1440, tablet 834, phone
  390; one frame with device tabs where it is narrow), scaled to fit, through `ctx.frameUrl` in a
  sandboxed frame (scripts on, no network, never same-origin). Version chips, the score out of 5,
  **Pin** (click a frame to drop a numbered pin with a comment; pins are kept per run until sent),
  **Ask for changes** (a modal with the pins and a note: G1's changes), **Approve** while G1 waits,
  and ⋯ **Open in Preview**, **Open in browser**, **Show in Pages**. The side panel shows what
  changed, the scorecard's axes and fixes, and the pins. Opens from the Run tab's **Review demo**,
  G1's gate sheet and G1 rows in the inbox.
- **GD's gate sheet** shows the three direction boards as cards; the whole card picks it.
- **Inbox** (tab), the **Factory** view (View → Views) and the top bar's **factory** button:
  what waits for a person across projects, grouped by gate. A pack output's row opens its **review
  sheet** (modal, D-467): the output beside its other form where it has one (two columns when wide),
  a preview (Markdown, the HTML page, the image), its files (each opens in Preview), **Edit** (opens
  it in Preview), **Reject…** (with a reason), **Approve**, and for user stories **Add as board
  cards…**. **Trust per output** under the groups: per kind, how many were reviewed, the share
  approved as written and the median review time.
- Actions **Factory: new idea…** and **start from a brief…** (search and menus); a chat reply's
  ⋯ → **Start a Factory run from this**; a meeting's ⋯ → **Start a Factory run…**.

## Settings

`factory.demoKitPath` (protected, D-443), `factory.concurrency` (D-450) and `factory.designSources`
(D-462: the `DESIGN.md` references; the design stages' brief lists them with the product kit and the
picked direction) and `factory.elearning` (D-447: the MCP server and the tools that create a course,
add pages and publish; without it courses are Markdown in `learning/`), on Settings → Factory.
Built-in add-ons read their own namespace with `api.config()` (D-450).
