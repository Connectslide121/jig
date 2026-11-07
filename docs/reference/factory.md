# Jig factory (reference)

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
| Tracks | `addons/factory/tracks/*.json` (graph: stages, gates, `after`, `when`, loops, fan-out) |
| Recipes | `addons/factory/recipes/*.md`; a repository overrides one in `<repo>/.jig/factory/recipes/<id>.md` ([guide](../guides/factory-recipes.md)) |
| Golden briefs | `addons/factory/fixtures/briefs/*.md` (tests, evals and **Start from a brief…**) |

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

## Host methods

Called from the add-on's UI (`ctx.host.call`); `runs` and `ideaFrom` are exported to other add-ons
(Meetings calls `ideaFrom`, D-460).

| Method | Args | Does |
| --- | --- | --- |
| `runs` / `allRuns` | `{projectId}` / – | the project's runs / every project's |
| `run` | `{projectId, runId}` | one run, or `null` |
| `outputFiles` | `{projectId, runId}` | output id → absolute path |
| `startRun` | `{projectId, brief? \| briefText? \| text?, title?, permissionMode?, outputs?, build?, productExists?, level?}` | a new run (in a worktree when the project is a git repository with commits) |
| `meetings` | – | your recent ended meetings for New idea's picker (`api.meetings.recent`, permission `meetings:read`) |
| `ideaFrom` | `{text, title?, source?}` | leaves a pending idea and opens New idea with it (a meeting's or a message's ⋯) |
| `briefDoc` | `{projectId, runId}` | the run's brief parsed: sections, coverage, gaps, level, languages (D-461) |
| `enough` | `{projectId, runId}` | Good enough: the interviewer writes the brief from what there is and ends |
| `track` | `{projectId, runId}` | the run's track and plan for the Plan dialog |
| `plan` | `{projectId, runId, outputs, languages, owners, level, build, productExists, permissionMode}` | confirms the Plan step (`plan.confirmed`), the run goes on |
| `decide` | `{projectId, runId, gateId, kind: "approve" \| "changes" \| "reject", note?, pins?, direction?}` | a gate decision; on G1 Ask for changes the Demo review's pins join the note as numbered lines (at most 30), on GD Approve `direction` picks a board (D-462) |
| `decideOutput` | `{projectId, runId, outputId, kind: "approve" \| "reject", note?}` | one pack output and its files (a reason is needed to reject); an edit since Jig wrote it is noticed by its hash and counts against trust; the gate is approved by itself once nothing of it waits and something was approved (D-467) |
| `reviewOf` | `{projectId, runId, outputId}` | the review sheet: the output and the newest version of its other form (deck ↔ deck images, one-pager ↔ its images), each with its file, its Markdown text and its files (PDF, HTML, images) |
| `boardTargets` | `{projectId}` | the Boards add-on's boards that can take cards for the project (`cardTargets`), or a `problem` |
| `storyCards` | `{projectId, runId, outputId, boardId, type?}` | one card per `## ` story of a stories output, through the Boards add-on's `createCard`; only on your click |
| `review` | `{projectId, runId}` | the demo's versions for Demo review: entry file (absolute), change log, scorecard (`pass`, `score`, eight axes, fixes) |
| `directions` | `{projectId, runId}` | GD's direction boards: `{id, name, file}` |
| `showInPages` | `{projectId, runId, version}` | publishes that demo version through the Pages add-on's `publish` export; the run keeps one page (`demoPage`) and each version updates it |
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

- **New idea** (modal, D-460): the idea typed, dictated or pasted, files, a meeting from your
  history, the project and whether it's for its product or a new one; **Start interview**.
- **Interview** (tab, D-461): question cards with suggested answers (one click, edit or dictate),
  **Good enough**, the brief building beside them with its coverage, level, languages and open
  points; **Looks right** approves G0 and opens the Plan dialog.
- **Plan** (modal, the person stage S3): stages (struck through when skipped), outputs ticked per
  track with a language per group, an owner per gate, level and how chats ask; **Start run**. A run
  started from a brief is planned in its start dialog (`plan.confirmed`), so S3 passes by itself.
- **Floor** (tab): lanes of run cards, the KPI strip, **New idea…**, **Start from a brief…**, ⋯ sample runs.
- **Run** (tab): the stage graph (each node opens its sheet), outputs, timeline and the run's chats.
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
- **Inbox** (tab), the **Jig factory** view (View → Views) and the top bar's **factory** button:
  what waits for a person across projects, grouped by gate. A pack output's row opens its **review
  sheet** (modal, D-467): the output beside its other form where it has one (two columns when wide),
  a preview (Markdown, the HTML page, the image), its files (each opens in Preview), **Edit** (opens
  it in Preview), **Reject…** (with a reason), **Approve**, and for user stories **Add as board
  cards…**. **Trust per output** under the groups: per kind, how many were reviewed, the share
  approved as written and the median review time.
- Actions **Jig factory: new idea…** and **start from a brief…** (search and menus); a chat reply's
  ⋯ → **Start Jig factory from this**; a meeting's ⋯ → **Start Jig factory…**.

## Settings

`factory.demoKitPath` (protected, D-443), `factory.concurrency` (D-450) and `factory.designSources`
(D-462: the `DESIGN.md` references; the design stages' brief lists them with the product kit and the
picked direction) and `factory.elearning` (D-447: the MCP server and the tools that create a course,
add pages and publish; without it courses are Markdown in `learning/`), on Settings → Jig factory.
Built-in add-ons read their own namespace with `api.config()` (D-450).
