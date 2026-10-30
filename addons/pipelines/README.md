# Pipelines

Azure DevOps pipelines through your own `az` CLI (`az login` + the `azure-devops` extension), like
the pipelines plugin (D-148). Jig stores no tokens (D-018).

- **Your repositories' pipelines:** every repository in your workspaces whose `origin` is on Azure
  DevOps (a repository with worktrees once) → `az pipelines list --repository … --repository-type
  tfsgit` → `az pipelines show` for the YAML file and default branch → the YAML's run-time
  parameters, read from your checkout (`lib/devops.ts`). "(old) …" and disabled pipelines are left
  out. Kept (storage `found`) and looked for again after 4 minutes, every 5 minutes while the view is
  open, when **More pipelines** opens, and on **Find pipelines again** (header), so a new pipeline joins its
  repository by itself; one seen before is not looked up again (D-166).
- **View Pipelines** (right sidebar): a card per repository; per pipeline the newest run as a chip
  (✓ 12m, ▶ Running 35m, ◷ Queued 3m, Cancelled…), its branch, why (CI, manual, PR…), who and what
  it changed from the defaults ("Deploy to: production"), and its stages (`Build ✓ → Deploy ▶`,
  skipped ones left out). Click the name to open the run (or the pipeline) in the browser; ⋯ for both.
- **Run form** (Run on a pipeline, or Tools → Run a pipeline…): the branch (the default first, then
  local and origin branches), a picker per parameter with `values`, a checkbox per boolean, a text
  field otherwise, and a summary of what will run. The parameters are read from the pipeline's YAML in
  Azure DevOps on the picked branch (`az devops invoke … items`), like DevOps' own form; objects and
  other structured parameters keep their defaults. Nothing runs until **Queue run**.
- **Refreshing:** one `az pipelines runs list` per Azure DevOps project, every 20 s while a run runs
  and every minute otherwise, only while Jig is in front; a finished run's stages
  (`az devops invoke … Timeline`) are asked for once.
- **Watcher:** runs you started from Jig are checked every minute; you get a notification when one
  succeeds or fails.
- **More pipelines in your organisations** (collapsed, loaded when opened; D-125): every other
  pipeline of the organisations your `az` login belongs to (or the ones listed in Settings →
  Pipelines), per organisation and project; Run opens the same form, described from Azure DevOps.
- **Arrange** (header): hide pipelines, drag them into your order, group them with dividers; per
  repository (`repo:<name>`), and per organisation/project in More pipelines. Kept globally in the
  add-on's storage (`arrangement`).
- **Settings → Pipelines:** Check Azure CLI; the organisations for More pipelines (every one you
  belong to by default, added by URL, narrowed to projects).

Commands used: `git remote get-url`, `git for-each-ref`, `az pipelines list / show / run / runs list
/ runs show`, `az repos ref list`, `az devops invoke` (timeline, YAML), `az rest` (your organisations), `az devops project list`.
Parsers in `lib/devops.ts`, `lib/runs.ts` and `lib/orgs.ts` (tested).
