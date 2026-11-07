# Jig factory

Turns an idea into an interview, a polished demo and a full pack of documents and material (phase 28,
[docs/plan/28-factory.md](../../docs/plan/28-factory.md); reference:
[docs/reference/factory.md](../../docs/reference/factory.md)). Runs start from a brief and go through
their stages in chats of their own, stopping at gates for you; **sample runs** show the views with
data (D-442).

- **Open it:** the **factory** button in the top bar (its count is what waits for you, in every
  project) → Floor, Inbox or Runs; or View → Views → **Jig factory** for the compact runs list.
- **Floor** (tab): the active project's runs as cards in six lanes (Interview, Demo, Review, Pack,
  Launch, Done) under a strip of numbers: running, waiting for you, median time from idea to demo,
  and the share of drafts approved as is. A card shows the level, a progress ring with its count, the
  time in the run and a **you** chip when a gate waits for you; the whole card opens the run. In a
  narrow place the lanes become one list grouped by lane.
- **Start from a brief…** (the factory button, the Floor, or the search action): a sample brief or
  one you paste, and how stage chats ask (Accept edits, or Don't ask). The run works in a git
  worktree on `factory/<name>`.
- **Run** (tab): the track's stages and gates in a row (dots for stages, diamonds for gates, coloured
  by how far they got), the outputs as cards (a picture of a demo, a file icon for a document; the
  whole card opens it in Preview), the timeline and the run's chats. A stage's dot opens its sheet
  (chat, report, outputs, a question to answer, Re-run…, Fork from here…); a gate's diamond opens its
  sheet (Approve, Ask for changes with a note, Reject…). ⋯: Inspector, Re-run a stage…, Fork from a
  stage…, Stop the run.
- **Inbox** (tab): everything waiting for a person across runs and projects, grouped by gate:
  project, run, what waits, how long, its owner and a pill (**you** when it's yours). A pack output's
  row opens its review sheet (the output beside its other form, its files, Edit, Reject…, Approve;
  stories: Add as board cards…), a gate's row the run. **Trust per output** under it: reviewed,
  approved as written, review time per kind (D-467).
- **On your phone** (Settings → Phone paired): a gate of yours waiting arrives as a card (the demo's
  screenshot for Demo review) with **Approve**, **Ask for changes** (write what to change as the
  reply) and **Open in Jig**; a stage's question with **Answer**; a stuck or finished run too. Once
  decided anywhere, the card says how and loses its buttons (D-468).
- **Publish demo** (⋯ on a run, once G1 approved a demo): on this computer, or an Azure Static Web
  Apps site from Settings → Jig factory → Publish targets; for 7, 30 or 90 days (the page ends itself
  after); optionally with a bar where the customer confirms by e-mail. Real-looking e-mail addresses,
  phone numbers or listed real names block it. The run's **Published** list takes a copy down (D-470).
- **Sample runs:** ⋯ → Load sample runs (on the Floor, the Runs view or the top bar's menu) adds six
  sample runs to the active project, one or more in every lane; ⋯ → Remove sample runs takes them
  away. Their files live in the add-on's data folder, never in a repository.

## Files

- `lib/run.ts`: the run, its stages, gates and outputs, and the moves between their statuses.
- `lib/graph.ts`: the track as a graph and what can run next (`nextSteps`).
- `lib/gates.ts`: gates, owners and caps, the inbox, trust numbers, output names.
- `lib/floor.ts`: lanes, the card's progress, the KPI strip and the stage-graph boxes.
- `lib/samples.ts`: the sample runs (D-442).
- `tracks/new-idea.json`, `change-request.json`, `tender.json`: the tracks (D-471).
- `lib/estimates.ts`: a quote's estimates from measured stage times.
- `lib/tenders.ts`: the requirement matrix, its counts and the recurring gaps.
- `lib/package.ts`: which change requests can go into a release package, and its files.
- `tender.tsx`: the Requirements box, Recurring gaps and Release package modals.
- `lib/conductor.ts`: the Conductor's pure steps (advance, settle, reset, fork, after a turn).
- `lib/recipes.ts`, `recipes/*.md`: recipes ([guide](../../docs/guides/factory-recipes.md)).
- `lib/frontmatter.ts`, `lib/slug.ts`: output files' status, run names.
- `fixtures/briefs/`: golden briefs.
- `host.ts`: the Conductor and stage runner, runs in project storage (`runs`, `run:<id>`,
  `inspect:<id>`), output files, the chat tools, sample runs.
- `ui.tsx`, `parts.tsx`, `sheets.tsx`: the views and the Run tab's modals.
