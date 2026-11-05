# Pipelines

Azure DevOps pipelines through your own `az` CLI (`az login` + the `azure-devops` extension), like
the pipelines plugin (D-148). Jig stores no tokens (D-018).

- **Tenants (D-282, D-284):** every `az` runs through `api.azure.az` with the tenant picked in the top
  bar. In-memory caches are keyed by tenant; the organisations setting, the pipelines found and their
  newest runs are stored per tenant (`settings`, `found`, `latest` for your own az login,
  `<key>@<tenant>` for another). On a switch (`azure.tenant` → `tenantChanged`) the view keeps its
  toolbar, shows a spinner in the list's place and then that tenant's pipelines. A run started from
  Jig is watched while its tenant is active.
- **Each call stays in its tenant (D-345):** every exported function first pins the tenant active when
  it starts (`pinned(api)`), and passes it to every `az` (`api.azure.az(args, { tenant })`), its
  caches and its storage keys. A search still running when you switch finishes in the tenant it
  started with and is stored there; it never lists another tenant's errors on this tenant's list. A
  saved list that has errors naming another tenant (saved by a search that ran into a switch before
  this) is searched again, however new, and those errors are left out until then.

- **Your repositories' pipelines:** every repository in your workspaces whose `origin` is on Azure
  DevOps (a repository with worktrees once) → `az pipelines list --repository … --repository-type
  tfsgit` → `az pipelines show` for the YAML file and default branch → the YAML's run-time
  parameters, read from your checkout (`lib/devops.ts`). "(old) …" and disabled pipelines are left
  out. Kept (storage `found`) and looked for again after 4 minutes, every 5 minutes while the view is
  open, when **More pipelines** opens, and on **Find pipelines again** (header), so a new pipeline joins its
  repository by itself; one seen before is not looked up again (D-166).
- **View Pipelines** (right sidebar): a card per repository; each pipeline is one compact row (D-180):
  its name, how long ago the newest run started (Run and ⋯ in that place on hover) and its state icon
  at the far right. Click a row (or ⋯ → Details…) for a dialog with the newest run as a chip
  (✓ 12m, ▶ Running 35m, ◷ Queued 3m, Cancelled…), its branch, why (CI, manual, PR…), who, what it
  changed from the defaults ("Deploy to: production"), its times and stages (`Build ✓ → Deploy ▶`,
  skipped ones left out), and buttons to open the pipeline or the run in the browser, or Run….
- **Run form** (Run on a pipeline, or Search → Run a pipeline…): the branch (the default first, then
  local and origin branches), a picker per parameter with `values`, a checkbox per boolean, a text
  field otherwise, and a summary of what will run. The parameters are read from the pipeline's YAML in
  Azure DevOps on the picked branch (`az devops invoke … items`), like DevOps' own form; objects and
  other structured parameters keep their defaults. Nothing runs until **Queue run**, which closes the
  form at once: a toast says it's queueing, then another that it's queued (or why it couldn't be).
- **Loaded when Jig starts** (D-183): the `refresh` watcher finds the pipelines and reads their newest
  runs a few seconds after Jig starts and every 5 minutes, and saves them (storage `found`, `latest`).
  Opening the view shows them at once (and what it showed last, when opened again) and refreshes in
  the background: a small spinner in the header, never a loading screen.
- **Refreshing:** one `az pipelines runs list` per Azure DevOps project, every 20 s while a run runs
  and every minute otherwise, only while Jig is in front; a finished run's stages
  (`az devops invoke … Timeline`) are asked for once.
- **Watcher:** runs you started from Jig are checked every minute; you get a notification when one
  succeeds or fails, with **Open run**, and a system notification when Jig isn't in front (D-215).
- **More pipelines in your organisations** (collapsed, loaded when opened; D-125): every other
  pipeline of the organisations your `az` login belongs to (or the ones listed in Settings →
  Pipelines), per organisation and project; Run opens the same form, described from Azure DevOps.
- **Arrange** (header): hide pipelines, drag them into your order, group them with dividers; per
  repository (`repo:<name>`), and per organisation/project in More pipelines. In a card, use the
  small side icon to add a divider above a pipeline. Nested cards omit the duplicate Add divider/help
  row; the outer list keeps its trailing divider control. Kept globally in the
  add-on's storage (`arrangement`).
- **Settings → Pipelines:** Check Azure CLI; the organisations for More pipelines (every one you
  belong to by default, added by URL, narrowed to projects).

- **Claude's tools (D-371), read only:** `addon_pipelines_pipelines` (each pipeline with its newest
  run, per repository; `everywhere: true` for every organisation and project of More pipelines),
  `addon_pipelines_runs` (`state` running / recent / failed, filters pipeline, branch, repo, org,
  project, `top`; running asks for `inProgress` and `notStarted` apart; the stages of runs going) and
  `addon_pipelines_run` (one run by id or link: stages, jobs, failed steps with their errors, the last
  40 lines of the first failed step's log, its link). Same code, caches and tenant pinning as the
  view; `everywhere` looks at 40 projects a call at most. **No tool starts, queues, re-runs or
  cancels a run**, and each description says so: runs and deploys are started only by you, from the
  Run form. The phone concierge answers "are any pipelines running?" with them. Text in
  `lib/report.ts` (tested).

Commands used: `git remote get-url`, `git for-each-ref`, `az pipelines list / show / run / runs list
/ runs show`, `az repos ref list`, `az devops invoke` (timeline, YAML, a failed step's log), `az rest` (your organisations), `az devops project list`.
Parsers in `lib/devops.ts`, `lib/runs.ts` and `lib/orgs.ts` (tested).

Run details include **Duration** (start-to-finish or live elapsed execution time, excluding queue
time). Timestamp rows keep their positions while a run finishes. The outcome badge remains time
since completion. Missing timestamps show Not reported / Not started instead of a fabricated
elapsed time. Azure CLI subprocesses explicitly use UTF-8 on Windows pipes; refresh replaces
previously cached malformed run names with correctly decoded metadata (D-206).
