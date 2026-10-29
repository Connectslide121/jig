# Pipelines

Azure DevOps pipelines through your own `az` CLI (`az login` + the `azure-devops` extension). Jig
stores no tokens (D-018).

- **Every organisation you belong to** (D-125): by default the view shows each Azure DevOps
  organisation your `az` login is a member of (`listOrgs`: the profile and accounts APIs through
  `az rest`), with all its projects. Settings → Pipelines turns that off, adds organisations by
  hand, and narrows any organisation to chosen projects. The first version's single organisation
  is kept as a listed one.
- **Cost:** the organisations and their projects are asked for once an hour, each project's
  pipelines every 10 minutes, and only the latest runs on each refresh (none for a project without
  pipelines), at most 4 `az` processes at a time.
- **View Pipelines** (right sidebar): pipelines grouped per organisation and Azure DevOps project with the latest run
  (status, branch, when), refreshed every 30 s while Jig is in front. Run a pipeline on a branch, open a run or
  the pipeline in the browser.
- **Watcher**: runs you started from Jig are checked every minute; you get a notification when one
  succeeds or fails.
- **Settings → Pipelines**: every organisation of your login (on by default), organisations added by
  URL (e.g. `https://dev.azure.com/contoso`), the projects per organisation (none = all); "Check"
  tells you whether `az`, the extension and your login are ready.

Commands used: `az rest` (profile and accounts), `az pipelines list`, `az pipelines runs list`, `az pipelines run`,
`az pipelines runs show`, `az devops project list`. Parsers in `lib/runs.ts` (tested).

**Arrange** (header button): hide pipelines, drag them into your order, and group them with dividers
(optionally titled). One arrangement per Azure DevOps organisation and project (`<org>/<project>`; older ones by project), the same in every Jig project (D-108), kept in the
add-on's storage (`arrangement`). New pipelines appear after the arranged ones.

Arrange also hides, restores, reorders and groups entire Azure DevOps projects, including empty ones. Project arrangements are stored alongside pipeline arrangements under `projects:<normalized organisation URL>` in the global `arrangement` data. Hidden projects reappear in Arrange so you can restore them. Settings checks and saving show progress and errors.
