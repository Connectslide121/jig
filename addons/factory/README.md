# Jig factory

Turns an idea into an interview, a polished demo and a full pack of documents and material (phase 28,
[docs/plan/28-factory.md](../../docs/plan/28-factory.md)). This version (session 0) has the views and
the data model; starting runs comes in later sessions. Until then, **sample runs** show how it works
(D-440).

- **Open it:** the **factory** button in the top bar (its count is what waits for you, in every
  project) → Floor, Inbox or Runs; or View → Views → **Jig factory** for the compact runs list.
- **Floor** (tab): the active project's runs as cards in six lanes (Interview, Demo, Review, Pack,
  Launch, Done) under a strip of numbers: running, waiting for you, median time from idea to demo,
  and the share of drafts approved as is. A card shows the level, a progress ring with its count, the
  time in the run and a **you** chip when a gate waits for you; the whole card opens the run. In a
  narrow place the lanes become one list grouped by lane.
- **Run** (tab): the track's stages and gates in a row (dots for stages, diamonds for gates, coloured
  by how far they got), the outputs as cards (a picture of a demo, a file icon for a document; the
  whole card opens it in Preview) and the timeline.
- **Inbox** (tab): everything waiting for a person across runs and projects, grouped by gate:
  project, run, what waits, how long, its owner and a pill (**you** when it's yours). A row opens the
  output in Preview, or the run.
- **Sample runs:** ⋯ → Load sample runs (on the Floor, the Runs view or the top bar's menu) adds six
  sample runs to the active project, one or more in every lane; ⋯ → Remove sample runs takes them
  away. Their files live in the add-on's data folder, never in a repository.

## Files

- `lib/run.ts`: the run, its stages, gates and outputs, and the moves between their statuses.
- `lib/graph.ts`: the track as a graph and what can run next (`nextSteps`).
- `lib/gates.ts`: gates, owners and caps, the inbox, trust numbers, output names.
- `lib/floor.ts`: lanes, the card's progress, the KPI strip and the stage-graph boxes.
- `lib/samples.ts`: the sample runs (D-440).
- `tracks/new-idea.json`: the "new idea" track.
- `host.ts`: runs in project storage (`runs`, `run:<id>`), output files, sample runs.
- `ui.tsx`, `parts.tsx`: the views.
