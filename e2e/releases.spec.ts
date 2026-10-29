import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

/** A repository that has never been versioned: package.json at 0.1.0, conventional commits. */
async function shop(jigHome: string) {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  await writeFile(join(dir, "package.json"), '{\n  "name": "shop",\n  "version": "0.1.0"\n}\n');
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "feat: discount codes");
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "fix: rounding in totals");
  return dir;
}

async function openReleases(page: Page) {
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("show releases");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("releases-view")).toBeVisible({ timeout: 15000 });
}

test("Releases: set up a repository, draft with Claude, release, and see the next one", async ({
  page,
  jigHome,
}) => {
  const dir = await shop(jigHome);
  await hostCall(page, "projects.add", { path: dir });
  await openReleases(page);

  // Not set up yet: detection, then the policy from what was found.
  await page.getByTestId("releases-setup-shop").click();
  await expect(page.getByTestId("release-setup")).toContainText("No versioning yet");
  await expect(page.getByTestId("release-setup")).toContainText("package.json (0.1.0)");
  await page.getByTestId("release-setup-defaults").click();
  await expect(page.getByTestId("release-policy")).toContainText("package.json");
  const policy = JSON.parse(await readFile(join(dir, ".jig", "release.json"), "utf8"));
  expect(policy).toMatchObject({
    style: "planned",
    versionFile: "package.json",
    commitConvention: "conventional",
  });

  // The first release is the baseline: the version in package.json.
  await expect(page.getByTestId("release-unreleased")).toContainText("2 commits");
  await page.getByTestId("release-prepare").click();
  await expect(page.getByTestId("release-version")).toHaveValue("0.1.0");
  await expect(page.getByTestId("release-changelog")).toHaveValue(/### Added\n- discount codes/);
  await page.getByTestId("release-draft").click();
  await expect(page.getByTestId("release-reason")).toContainText("scripted");
  await expect(page.getByTestId("release-notes")).toHaveValue("You can now use discount codes at checkout.");
  await expect(page.getByTestId("release-steps")).toContainText("Tag v0.1.0 with the notes");
  await page.getByTestId("release-go").click();
  await page.getByTestId("dialog-confirm").click();

  await expect(page.getByTestId("release-history")).toContainText("v0.1.0", { timeout: 15000 });
  expect(git(dir, "tag", "--list").trim()).toBe("v0.1.0");
  expect(git(dir, "log", "-1", "--format=%s").trim()).toBe("Release 0.1.0");
  expect(await readFile(join(dir, "CHANGELOG.md"), "utf8")).toContain("- Discount codes at checkout");
  expect(git(dir, "tag", "-l", "--format=%(contents)", "v0.1.0")).toContain("discount codes at checkout");

  // A feature after it: the next release is a minor bump.
  await writeFile(join(dir, "pay.ts"), "export const pay = 1;\n");
  git(dir, "add", "pay.ts");
  git(dir, "commit", "-q", "-m", "feat: pay by invoice");
  // A pull request merged from GitHub.
  git(dir, "checkout", "-q", "-b", "ann/export");
  await writeFile(join(dir, "export.ts"), "export const csv = 1;\n");
  git(dir, "add", "export.ts");
  git(dir, "commit", "-q", "-m", "feat: export to CSV");
  git(dir, "checkout", "-q", "main");
  git(
    dir,
    "merge",
    "-q",
    "--no-ff",
    "ann/export",
    "-m",
    "Merge pull request #7 from ann/export\n\nExport orders to CSV",
  );
  await page.getByTestId("release-refresh").click();
  await expect(page.getByTestId("release-unreleased")).toContainText("2 commits");
  await expect(page.getByTestId("release-prs")).toContainText("#7");
  await expect(page.getByTestId("release-prs")).toContainText("Export orders to CSV");
  await page.getByTestId("release-prepare").click();
  await expect(page.getByTestId("release-version")).toHaveValue("0.2.0");
  await page.getByRole("button", { name: "Cancel" }).click();

  // The panel shows it with its unreleased work.
  await expect(page.getByTestId("releases-repo-shop")).toContainText("0.1.0", { timeout: 15000 });

  // Git shows the unreleased count next to the repository.
  await page.keyboard.press("Control+Shift+G");
  await expect(page.getByTestId("git-unreleased").first()).toHaveText("2 unreleased", { timeout: 15000 });

  // The notes of a release can be published as an artifact from a chat.
  await page.getByTestId("tab-addon.releases.repo").click();
  await page.getByTestId("release-publish").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(
    /Publish the release notes of shop v0\.1\.0 as an artifact/,
    {
      timeout: 15000,
    },
  );
});

test("Releases: on a continuous project, a deploy by hand is the release", async ({ page, jigHome }) => {
  const dir = await shop(jigHome);
  await mkdir(join(dir, ".jig"), { recursive: true });
  await writeFile(
    join(dir, ".jig", "release.json"),
    JSON.stringify({
      version: 1,
      style: "continuous",
      scheme: "calver",
      tagFormat: "v{version}",
      environments: [{ name: "prod", deploy: "manual", production: true }],
    }),
  );
  await hostCall(page, "projects.add", { path: dir });
  await openReleases(page);
  await page.getByTestId("releases-repo-shop").click();
  await expect(page.getByTestId("release-policy")).toContainText("Continuous");
  await page.getByTestId("release-deployed-prod").click();
  const now = new Date();
  const version = `${now.getFullYear()}.${now.getMonth() + 1}.1`;
  await expect(page.getByTestId("release-deploys")).toContainText(version, { timeout: 15000 });
  expect(git(dir, "tag", "--list").trim()).toBe(`v${version}`);
  expect(git(dir, "rev-list", "-n", "1", `v${version}`).trim()).toBe(git(dir, "rev-parse", "HEAD").trim());
});

test("Claude uses the Releases tools and changes add-on data, with Undo", async ({ page, jigHome }) => {
  const dir = await shop(jigHome);
  await mkdir(join(dir, ".jig"), { recursive: true });
  await writeFile(join(dir, ".jig", "release.json"), JSON.stringify({ version: 1, style: "planned" }));
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const chat = page.getByTestId("chat");

  // An add-on's tool: what changed since the last release, from the chat's repository.
  await page.getByTestId("composer-input").fill("what changed since the last release?");
  await page.keyboard.press("Enter");
  await expect(chat).toContainText("Here is what changed since the last release.", { timeout: 15000 });
  await expect(chat).toContainText("addon_releases_changes");
  await chat.getByText("addon_releases_changes").first().click();
  await expect(chat).toContainText("feat: discount codes");

  // Jig's add-on data tools: Claude looks inside the add-on and saves data; Undo takes it back.
  await page.getByTestId("composer-input").fill("save a note in the releases data");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("change-card").first();
  await expect(card).toContainText("Changed Releases's data", { timeout: 15000 });
  const note = async () =>
    ((await hostCall(page, "addons.storageGet", { id: "releases", key: "fake-note" })) as { value?: unknown })
      .value;
  expect(await note()).toEqual({ text: "from a chat" });
  await card.getByTestId("change-undo").click();
  await expect(card).toContainText("Undone");
  await expect.poll(note).toBeUndefined();
});
