import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("What Jig can do: slots, add-ons, skills, and Try in a chat", async ({ page, jigHome }) => {
  const dir = join(jigHome, "demo");
  await mkdir(join(dir, ".claude", "skills", "release"), { recursive: true });
  await writeFile(
    join(dir, ".claude", "skills", "release", "SKILL.md"),
    "---\nname: release\ndescription: Cut a release\n---\n",
  );
  await hostCall(page, "projects.add", { path: dir });

  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("What Jig can do");
  await page.keyboard.press("Enter");
  const about = page.getByTestId("about");
  await expect(about).toBeVisible();

  // Every slot, with the add-ons that use it.
  await expect(about.getByTestId("about-slots").locator("[data-testid^=about-slot-]")).toHaveCount(16);
  const view = about.getByTestId("about-slot-view");
  await expect(view).toContainText("in use");
  await view.locator("button").first().click();
  await expect(view).toContainText("contributes.views");
  await expect(view).toContainText("Git");

  // The project's skills.
  await about.getByTestId("about-nav-skills").click();
  await expect(about.getByTestId("about-skills")).toContainText("Cut a release");

  // A configure example opens a new chat with the text in the composer, not sent.
  await about.getByTestId("about-try").first().click();
  await expect(page.getByTestId("composer-input")).toHaveValue(
    "Switch to a dark theme that is easy on the eyes",
  );

  // The top bar button opens the same tab again.
  await page.getByTestId("about-button").click();
  await expect(page.getByTestId("about")).toBeVisible();
});
