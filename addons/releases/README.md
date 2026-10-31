# Releases

Versions, changelogs and release notes per repository, following its **release policy**
(`.jig/release.json`, committed so the team shares it). D-110.

- **View Releases** (right sidebar, Search → Show releases): every repository with its release style,
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
  - **Pull requests** merged since the last release (GitHub merge commits, Azure DevOps "Merged PR n"
    squash merges) are listed under the commits.
  - **Release pipeline** (optional, `releasePipeline: { org, project, id }` in the policy): "Start the
    release pipeline" runs it on the new tag after a successful push (`az pipelines run --branch
    refs/tags/<tag>`).
  - **What's live:** the latest deploy per environment; "Deployed to …" buttons for manual ones.
  - **Releases:** the history, with the notes to copy, or **publish as an artifact** (a chat with the
    notes and the request, ready to send).
- **In the Git panel:** "N unreleased" next to a repository with planned releases (the Git add-on's
  `releaseInfo` reads the same policy); click opens Releases.
- **Watchers:** `checkDeploys` (5 min) looks at production pipelines in the policy through `az`;
  `remind` (6 h) sends the weekly reminder when the policy's cadence is `weekly`.

- **Tools for Claude** (slot `claude.tool`), in every chat: `addon_releases_overview`,
  `addon_releases_changes` (what changed since the last release: commits, pull requests, the suggested
  version, what's live), `addon_releases_history` (releases with their notes) — these run without
  asking — and `addon_releases_release`, `addon_releases_record_deploy`, `addon_releases_set_policy`,
  which ask first. Without `repo`, they use the repository the chat works in.

Pure logic in `lib/` (tested in `lib/release.test.ts`): versions and tags, commits and changelogs,
version files, the policy, detection, the next version, Claude's prompt and answer, deploys.
