---
name: jig-release
description: Prepare, build, validate and publish a Windows installer release of Jig from this repository to GitHub Releases (pick the version and write the notes into release/next.json, then npm run release). Use for requests to release, ship or publish Jig, or prepare its next release; not for releasing projects managed inside Jig or merely building a local installer.
---

# Release Jig

Run from the Jig repository root. Read `AGENTS.md` and `docs/guides/packaging.md`.
This is a repository maintenance skill: Claude Code inside Jig follows the same workflow as any
other agent and edits this repository directly, never the in-app builder.

## The way to release: a plan and `npm run release` (D-245)

Everything below is automated by `scripts/release.ts`; an agent decides only the version and writes
the notes. (Jon starts it with one click: the **Release Jig** workflow in Jig's Workflows.)

1. See what changed since the last release (`addon_releases_changes` for this repository, or
   `git log v<latest>..HEAD`). Pick the bump: **major** only for changes that break users' data,
   settings or the add-on API; **minor** for new user-visible features; **patch** for fixes and
   polish only. The version is exactly one bump above the latest published release.
2. Write `release/next.json` (ignored by git): `version`, `bump`, `reason` (one sentence), `summary`
   (one or two sentences for docs/status.md) and `notes` (Markdown for users: New / Improved / Fixed,
   no commit hashes, decision ids or internal history; known gaps only when users will notice).
3. `npm run release -- --check` validates the plan, the repository and GitHub without changing
   anything. Fix a rejected plan; a rejected repository (uncommitted work, behind origin, gh signed
   out) is the user's to resolve; never stash or commit someone else's work to get past it.
4. `npm run release` (15–25 minutes; in Jig run it with `jig_terminal_run` so the user can watch).
   It bumps and commits the version with a "being prepared" status line, runs `npm run check`, the
   whole e2e suite (skipped when `npm run e2e` already passed in full on this source, D-272; after a failed run only the failed specs and those the fixes since need, D-325), builds and packages, verifies the installer/feed/unpacked app, runs the packaged
   test, writes SHA256SUMS, tags and pushes atomically, uploads a draft, verifies the downloaded
   installer, publishes it as latest, checks the unauthenticated latest-release API, feed and
   installer, records the publication in docs/status.md and pushes that commit.
5. On failure it stops and says why. Failing tests: follow "When tests fail" below. Otherwise fix
   what's yours to fix (see Scope), commit the fix and run it again: once the version is set it
   continues from HEAD (fix commits after the release commit are fine) and an existing draft. Report the version, the reason for the bump, the link and notes.

The sections below are what the script does and checks, for reviewing it or recovering by hand.

## Scope and authorization

- A request to **publish/release Jig** authorizes the release-scoped commit, tag, push and GitHub
  publication described here. Proceed through verification without asking again. A request only
  to create this skill, explain releases, prepare a release or build an installer does not authorize
  pushing or publishing; finish all local preparation and report the ready result.
- `AGENTS.md`'s normal no-push rule has this explicit release exception. Do not push unrelated
  repositories, force-push, rewrite published tags, alter repository visibility or install the
  resulting app on the user's machine unless separately requested.
- Work on `main`. Preserve unfinished work; never sweep someone else's changes into a release.
  Resolve only routine release failures. Stop on conflicting release/tag identity, unexpected
  remote history or a failed check that "When tests fail" doesn't let you fix; explain the
  concrete blocker. Retry a transient
  network/upload failure at most twice, inspecting remote state before each retry.

## Prepare the release

1. Confirm repository identity: `git remote get-url origin` must identify
   `https://github.com/Connectslide121/jig` (an equivalent SSH URL is fine). Check branch, working
   tree and upstream. Fetch origin and compare local/remote main; fast-forward only when safe.
   Inspect outgoing commits so publication includes the intended work. A dirty tree must be
   resolved without discarding or silently including unrelated edits.
2. Use Windows x64 and Node compatible with `package.json`; the installer carries platform-native
   dependencies. Use the existing Git and `gh` authentication (`gh auth status`); never read or
   print tokens. Verify access with `gh repo view Connectslide121/jig`. Run `npm ci` when needed
   to install the locked Windows dependencies. Do not package Linux/macOS dependencies for Windows.
3. Inspect the last published stable release and its tag, local tags and existing drafts through
   `gh release list/view` or `gh api`. A 404 from `/releases/latest` can mean no stable release;
   distinguish that from an inaccessible repository by checking the release list/repository.
   Check for an already-published requested version before making changes.
4. Use the requested stable version. If none was specified, choose the next patch above both the
   current app version and latest stable release; explain a minor/major choice if warranted.
   Never reuse a published version for different bytes. The first release must exceed installed
   `0.1.0` so those installations detect it. Tag format: `v<version>`.
5. Inspect the five synchronized version fields across three manifests with:

   ```text
   node .agents/skills/jig-release/scripts/version.mjs
   node .agents/skills/jig-release/scripts/version.mjs <version> --dry-run
   node .agents/skills/jig-release/scripts/version.mjs <version>
   ```

   The helper updates root/desktop `package.json` and the corresponding lockfile versions;
   it refuses manifest drift, invalid versions and downgrades before writing. Do not bump the
   SDK, launcher or other workspace packages solely to match Jig's app version.
6. Write concise user-facing release notes from changes since the previous published tag (for
   the first release, describe the actual shipped features). Include material known gaps, not
   internal task history. Save the exact Markdown to `release/jig-<version>-notes.md` (tracked in git:
   the app's What's new tab is built from these files, D-393), for `--notes-file`; never interpolate
   notes into a shell command.
   Update `docs/status.md` with the version's preparation/publication state, accurately.

## Validate and package

- Run `npm run check`, then the whole e2e suite with `npm run e2e` (parallel, a few minutes; it builds
  first when stale). Every test must pass; when one doesn't, follow "When tests fail" below.
- Run `npm run build` before packaging.
- Build the NSIS installer on Windows without opening Explorer:

  ```text
  npm run dist --workspace @jig/desktop -- --no-open
  ```

  Expected artifacts are `apps/desktop/release/Jig-Setup-<version>.exe`, its `.exe.blockmap`,
  and `latest.yml`. Packaging always passes `--publish never`; this skill owns publication.
  Verify latest.yml names this installer, version matches and SHA-512 matches its bytes.
  Check the exit status, actual file, nonzero size and Windows `VersionInfo.ProductVersion`;
  its normalized version must match the chosen version. Check the unpacked app includes native runtime dependencies,
  the Claude Code binary, built-in add-ons and curated skills. Do not launch an interactive installer.
- After packaging, run `npx playwright test e2e/packaged.spec.ts` with `JIG_HIDDEN=1` in its
  environment. The test launches `win-unpacked/Jig.exe` using a temporary home and the fake
  engine. Require a passing test, not a skip; an older unpacked build is not evidence for this
  release. The full e2e suite runs against the fresh build before packaging.
- Generate `apps/desktop/release/SHA256SUMS.txt` containing lowercase SHA-256 and basename for
  installer, blockmap and latest.yml, using `Get-FileHash` or Node crypto. Record installer size/hash
  and tested source SHA. Never publish an installer without its matching update metadata.
- Review the release diff, commit only the intended release changes on main, and record the
  release commit SHA. The installer must have been built from exactly that tracked source state
  (a version-only/release-documentation commit changes the SHA, not the built inputs). If any
  build input changes after checks/packaging, rerun the affected checks and rebuild.
- Recheck that HEAD is the release commit and the working tree has no unfinished tracked work.
  For prepare-only requests, finish here with the version, artifact/hash, notes and checks.

## When tests fail (D-331)

The whole e2e suite runs only at release (D-258), so the release is where a batch of changes first
meets it, and failures there are expected. Fix them; don't hand them back. When `npm run release`
stops on failing unit or e2e tests:

1. **Sort each failure** and name its kind in the fix's commit and the final report:
   - **Outdated test:** the app changed on purpose and the test expects the old behaviour. Update
     the test to the new behaviour.
   - **Test bug:** an ambiguous locator, a timeout too short for what the test now does, a race in
     the test. Fix the test and say what caused it.
   - **Regression in the released changes:** fix the app when the fix is small and inside those
     changes, with its test; otherwise stop and report.
   - **Environment:** network, a file Windows holds, gh. Rerun once; then stop and report.
2. **Never** skip (`test.skip`, `.fixme`) or delete a test, weaken an assertion you don't
   understand, or raise retries or timeouts for the whole suite. A longer timeout for one test is
   fine when a comment says why.
3. **Prove it before resuming:** run the failed specs (`npx playwright test <spec>` with
   `JIG_HIDDEN=1`, or `npx vitest run <file>`), run `npm run verify`, commit, then run
   `npm run release` again. It reruns only the failed specs and those the fixes need (D-325).
4. **Limits:** stop and report after two fix rounds, or when a fix needs more than a small change
   to the app.
5. **Flaky tests** (passed on retry) don't block. Name them in the final report and offer a task to
   fix each.
6. **Report** every failure with its kind and fix next to the release link. A request that only asks
   to say where a release failed doesn't override this; Jon wants failures fixed (D-331).

## Publish when authorized

1. Before any push, all local preparation above must be complete. Create an annotated `v<version>`
   tag at the release commit, or verify an existing local tag resolves to that exact commit.
   Push only the intended main commit and tag, atomically, with no force:

   ```text
   git push --atomic origin <release-sha>:refs/heads/main refs/tags/v<version>
   ```

   If the remote tag already exists, verify its peeled commit. Never move it to another build.
2. Create a **draft** with installer, blockmap, latest.yml and checksum file uploaded together:

   ```text
   gh release create v<version> <installer-path> <blockmap-path> <latest-yml-path> <checksum-path> --repo Connectslide121/jig --verify-tag --draft --title "Jig <version>" --notes-file <notes-path>
   ```

   Use actual structured tool arguments or proper shell quoting for paths. On retry, inspect an
   existing draft, tag, notes and assets; upload only missing matching artifacts. Do not recreate
   the release blindly or replace assets on a published release. Leave an incomplete draft as
   a draft if blocked and report its link.
3. Verify the draft's exact tag/commit, notes, installer name/size and checksum. For an end-to-end
   published-byte check, download its installer and checksum to a fresh ignored temporary folder
   using `gh release download` and compare SHA-256 with the local installer. Keep credentials
   inside `gh`; do not copy authentication into scripts or release assets.
4. Publish the verified stable draft as latest:

   ```text
   gh release edit v<version> --repo Connectslide121/jig --verify-tag --draft=false --prerelease=false --latest
   ```

5. Verify via `gh release view` and the **unauthenticated public** GitHub
   `/repos/Connectslide121/jig/releases/latest` API: correct tag, not draft/prerelease, installer
   installer, blockmap and latest.yml assets present and downloadable, with matching feed version/hash.
   The public check matters because installed Jig does not attach
   a GitHub login. Confirm the published version compares newer than the previous installed app.
   If publication succeeded but verification failed, report that state; do not create another version.
6. Record the published URL/version in the docs and commit that documentation correction. Do not
   move the release tag or rebuild/reupload merely for this post-publication documentation update.
   Follow the release request's authorized push scope for this docs-only follow-up.

Report the release link, version, installer/hash and validation outcome. Installed Windows Jig
downloads updates automatically and offers Install and restart. Versions 0.1.0/0.1.1 need one manual
upgrade to gain this updater. Do not install or restart the user's app without authorization or during
an active meeting. No developer UI, GitHub credential store or required CI service is introduced.
