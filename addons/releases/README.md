# Releases

Versions, changelogs and release notes per repository, following its **release policy**
(`.jig/release.json`, committed so the team shares it). D-110.

- **View Releases** (right sidebar, Tools → Show releases): every repository with its release style,
  latest version and unreleased work; "Set up" for the ones without a policy. The status bar shows
  "N to release" for planned repositories with unreleased commits.
- **Release tab** (click a repository):
  - **Set up:** what detection found (version files, tags and their format, changelog, conventional
    commits, GitVersion / Nerdbank.GitVersioning / semantic-release / release-please / Changesets,
    versioning in pipelines). **Set up with Claude** opens a chat with that and asks Claude to propose
    (or adopt) a policy; **Use what's there / Use the defaults** writes one without a chat.
  - **Policy:** a summary; Edit opens the file in Preview; Change with Claude.
  - **Unreleased** (planned style): commits since the last release with their type and AB# work
    items. **Prepare release:** the suggested version (bump from the commits; the first release is the
    baseline), release candidates for environments with a `prerelease` label, the changelog draft,
    **Draft with Claude** (bump reason, changelog, notes per audience), the steps, then **Release**.
  - **What's live:** the latest deploy per environment; "Deployed to …" buttons for manual ones.
  - **Releases:** the history, with the notes to copy.
- **Watchers:** `checkDeploys` (5 min) looks at production pipelines in the policy through `az`;
  `remind` (6 h) sends the weekly reminder when the policy's cadence is `weekly`.

Pure logic in `lib/` (tested in `lib/release.test.ts`): versions and tags, commits and changelogs,
version files, the policy, detection, the next version, Claude's prompt and answer, deploys.
