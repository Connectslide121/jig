---
name: jig-release
description: Prepare, build, validate and publish a Windows installer release of Jig from this repository to GitHub Releases. Use for requests to release, ship or publish Jig, or prepare its next release; not for releasing projects managed inside Jig or merely building a local installer.
---

# Release Jig

Run from the Jig repository root. Read `AGENTS.md` and `docs/guides/packaging.md`.
This is a repository maintenance skill: Claude Code inside Jig follows the same workflow as any
other agent and edits this repository directly, never the in-app builder.

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
  remote history or a failed required check; explain the concrete blocker. Retry a transient
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
   internal task history. Save the exact Markdown to an ignored file such as
   `release/jig-<version>-notes.md`, for `--notes-file`; never interpolate notes into a shell command.
   Update `docs/status.md` with the version's preparation/publication state, accurately.

## Validate and package

- Run `npm run check`. For changed runtime/UI paths, run the relevant Electron e2e tests with
  the fake engine and temporary homes. Fix failures in scope before proceeding; don't skip checks.
- Run `npm run build` before packaging.
- Build the NSIS installer on Windows without opening Explorer:

  ```text
  npm run dist --workspace @jig/desktop -- --no-open
  ```

  The expected artifact is `apps/desktop/release/Jig-Setup-<version>.exe`.
  Check the exit status, actual file, nonzero size and Windows `VersionInfo.ProductVersion`;
  its normalized version must match the chosen version. Check the unpacked app includes native runtime dependencies,
  the Claude Code binary, built-in add-ons and curated skills. Do not launch an interactive installer.
- After packaging, run `npx playwright test e2e/packaged.spec.ts` with `JIG_HIDDEN=1` in its
  environment. The test launches `win-unpacked/Jig.exe` using a temporary home and the fake
  engine. Require a passing test, not a skip; an older unpacked build is not evidence for this
  release. Relevant source e2e tests run against the fresh build before packaging.
- Generate `apps/desktop/release/SHA256SUMS.txt` containing the lowercase SHA-256 and installer
  basename, using `Get-FileHash` or Node crypto. Record the hash, size and tested source SHA.
- Review the release diff, commit only the intended release changes on main, and record the
  release commit SHA. The installer must have been built from exactly that tracked source state
  (a version-only/release-documentation commit changes the SHA, not the built inputs). If any
  build input changes after checks/packaging, rerun the affected checks and rebuild.
- Recheck that HEAD is the release commit and the working tree has no unfinished tracked work.
  For prepare-only requests, finish here with the version, artifact/hash, notes and checks.

## Publish when authorized

1. Before any push, all local preparation above must be complete. Create an annotated `v<version>`
   tag at the release commit, or verify an existing local tag resolves to that exact commit.
   Push only the intended main commit and tag, atomically, with no force:

   ```text
   git push --atomic origin <release-sha>:refs/heads/main refs/tags/v<version>
   ```

   If the remote tag already exists, verify its peeled commit. Never move it to another build.
2. Create a **draft** with the installer and checksum file uploaded together:

   ```text
   gh release create v<version> <installer-path> <checksum-path> --repo Connectslide121/jig --verify-tag --draft --title "Jig <version>" --notes-file <notes-path>
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
   asset present and downloadable. The public check matters because installed Jig does not attach
   a GitHub login. Confirm the published version compares newer than the previous installed app.
   If publication succeeded but verification failed, report that state; do not create another version.
6. Record the published URL/version in the docs and commit that documentation correction. Do not
   move the release tag or rebuild/reupload merely for this post-publication documentation update.
   Follow the release request's authorized push scope for this docs-only follow-up.

Report the release link, version, installer/hash and validation outcome. Installed Jig's existing
**Check for updates** then opens the release page; users download/run the installer. This workflow
does not add silent installation, in-app developer UI, a new credential store or a required CI service.
