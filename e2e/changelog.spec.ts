import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

// The versions with notes in release/, newest first, as the build bundles them (D-393).
const versions = readdirSync(fileURLToPath(new URL("../release", import.meta.url)))
  .map((name) => /^jig-(\d+\.\d+\.\d+)-notes\.md$/.exec(name)?.[1])
  .filter((v): v is string => !!v)
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

test("What's new: every version's release notes, from the Jig menu, Settings → About and Get started", async ({
  page,
}) => {
  const [newest, ...older] = versions;
  const oldest = older.at(-1)!;

  await page.getByTestId("jig-menu").click();
  await page.getByRole("menuitem", { name: "What's new" }).click();
  const tab = page.getByTestId("changelog");
  await expect(tab).toBeVisible();
  await expect(tab.locator("[data-version]")).toHaveCount(versions.length);
  await expect(tab.locator("[data-version]").first()).toHaveAttribute("data-version", newest!);
  await expect(tab.getByTestId(`changelog-version-${newest}`)).toContainText(`Jig ${newest}`);

  // A version in the list scrolls to its notes and becomes the current one.
  await tab.getByTestId(`changelog-nav-${oldest}`).click();
  await expect(tab.getByTestId(`changelog-version-${oldest}`)).toBeInViewport();
  await expect(tab.getByTestId(`changelog-nav-${oldest}`)).toHaveAttribute("aria-current", "true");

  // Settings → About opens the same tab at the running version.
  await page.keyboard.press("Control+Comma");
  await page.getByTestId("settings-nav-about").click();
  await page.getByTestId("settings-about-changelog").click();
  await expect(page.getByTestId("changelog")).toBeVisible();

  // Get started's Updates card: What's new beside your version, and GitHub's releases.
  await page.getByTestId("jig-menu").click();
  await page.getByRole("menuitem", { name: "Check for updates…" }).click();
  const updates = page.getByTestId("updates-card");
  await expect(updates.getByTestId("updates-github")).toHaveText("Releases on GitHub");
  await updates.getByTestId("updates-changelog").click();
  await expect(page.getByTestId("changelog")).toBeVisible();
});
