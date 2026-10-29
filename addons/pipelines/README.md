# Pipelines

Azure DevOps pipelines through your own `az` CLI (`az login` + the `azure-devops` extension). Jig
stores no tokens (D-018).

- **View Pipelines** (right sidebar): pipelines grouped per Azure DevOps project with the latest run
  (status, branch, when), refreshed every 30 s while visible. Run a pipeline on a branch, open a run or
  the pipeline in the browser.
- **Watcher**: runs you started from Jig are checked every minute; you get a notification when one
  succeeds or fails.
- **Settings → Pipelines**: organisation URL (e.g. `https://dev.azure.com/contoso`) and the projects to
  show; "Check" tells you whether `az`, the extension and your login are ready.

Commands used: `az pipelines list`, `az pipelines runs list`, `az pipelines run`,
`az pipelines runs show`, `az devops project list`. Parsers in `lib/runs.ts` (tested).

**Arrange** (header button): hide pipelines, drag them into your order, and group them with dividers
(optionally titled). One arrangement per Azure DevOps project, the same in every Jig project (D-108), kept in the
add-on's storage (`arrangement`). New pipelines appear after the arranged ones.
