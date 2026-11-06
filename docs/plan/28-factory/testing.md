# Jig factory — testing the factory, and DevX

Part of [phase 28](../28-factory.md). Jig's testing rules (AGENTS.md → Testing rules,
`docs/guides/testing.md`) apply; this file says what they mean for Jig factory.

## Test layers

| Layer | What | Where | When |
|---|---|---|---|
| Unit | run/stage/gate transitions, graph scheduling (joins, fan-out, `when`, loops with caps), retries and revision caps, recipe parsing and override resolution, front-matter read/write and status history, rubric aggregation and pass rule, slugs | `addons/factory/lib/*.test.ts` | with each change |
| Host | the Conductor with a temporary `JIG_HOME` and a fake `api.chats` (scripted chat states): resume after restart, concurrency limit, nudge then needs-you, limit/waiting states | `addons/factory/host.test.ts` | with each change |
| E2E | a whole fixture run with the fake engine (below), New idea → done, in under a minute | `e2e/factory.spec.ts` (+ rule in `e2e/affected.json`) | `npm run e2e:changed` once per session |
| UI states | every view at sidebar, bottom panel and tab widths, Jig Dark and Light, with fixture runs in each state | `shootView` (`e2e/shots.ts`) | per UI change, looked at |
| Demo kit | the kit's own tests; `npm run check` on the sample demo; Storybook builds | the demo kit repo | in the kit |
| Recipe evals | golden briefs on real models, scored by the critic; trend per recipe version | a button on Settings → Jig factory | Jon, on demand (uses his plan) |
| Dogfood | run 1: a module in an existing product (L2); run 2: a new-product idea (L1); run 3: a change request (L3) | in Jig | after sessions 4, 5, 7 |

## The fake engine for Jig factory

Add rows to `apps/desktop/src/main/engine/fake.ts` and the table in `docs/guides/testing.md` so a
stage chat plays its role without AI. A stage prompt carries a marker line
(`[factory stage <recipe> run <id>]`); the fake engine answers by recipe:

| Recipe | Fake behaviour |
|---|---|
| `interview` | calls `factory_questions` with 2 rounds of fixed cards, then writes `brief.md` from a fixture |
| `scout` | writes `scout.md` (fixture), suggests L1 |
| `directions` | writes 3 direction folders (fixture images) |
| `demo-l1` | copies `e2e/fixtures/factory/demo/` into `demo/v<N>/` |
| `critique` | fails v1 with a fix list, passes v2 (tests the loop) |
| any pack recipe | writes its output file with front-matter `status: draft` |
| marker `[fail]` in the brief | the stage fails once (tests the retry) |

Every `factory_*` tool also gets a direct fake trigger, as other tools do.

## The e2e run (`e2e/factory.spec.ts`)

1. Open the Floor (empty state) → New idea (modal, type text, pick a fixture project) → Start.
2. Interview: two rounds of question cards, accept suggestions, brief fills, Looks right.
3. Plan modal: untick one output, set G4 to "a person" (fixture board), Start run.
4. The fake critic fails v1, passes v2; G1 appears in the Inbox and the top-bar count is 1.
5. Approve G1 (and a fake phone action in session 6) → pack fans out (concurrency 3 observed).
6. Approve the outputs in the Inbox → run Done; files and front-matter statuses checked on disk.
7. Restart Jig in the middle (step 5) once: the run resumes.

Keep each test short (the suite runs in parallel); split into several tests over a seeded
`JIG_HOME` where a step needs a prepared state.

## DevX

- **Recipes are files** with front-matter; hot-reloaded while Jig runs; per-repo overrides; a
  linter (`lib/recipes.ts` → `validate`) run by the unit tests over every built-in recipe.
- **"Try a recipe"** (Settings → Jig factory → Recipes): runs one recipe alone on a golden brief and
  shows its output next to the previous version's.
- **Tracks are data:** a new track or a changed order needs no code.
- **Inspector** (Run → ⋯): the run's state JSON, every prompt sent, every report, timings, retries.
- **Re-run a stage** and **fork a run from a stage** ("redo from the demo with this change"): the
  fork copies the run folder up to that stage on a new branch.
- **Golden briefs:** three neutral fixture ideas in `addons/factory/fixtures/briefs/` (a new product,
  a module in an existing product, a change request), used by tests, evals and the factory's own demo.
- **Docs:** this phase's files, `docs/reference/factory.md` (written in session 2: data model, tools,
  settings, exports), a guide `docs/guides/factory-recipes.md` ("Writing a recipe"), the README line
  and the "What Jig can do" entry.
