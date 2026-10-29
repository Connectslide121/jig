import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("Build something… makes a new add-on, previews it, and Accept makes it live", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("Hello button");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 20000 });
  await expect(page.getByTestId("build-tab")).toContainText("New add-on");
  await expect(page.getByTestId("build-files")).toContainText("hello-button/ui.tsx");
  // The add-on is loaded as a preview right away.
  await expect(page.getByTestId("view-tab-addon.hello-button.main")).toHaveAttribute(
    "title",
    "Hello button (preview)",
    { timeout: 15000 },
  );
  await page.getByTestId("build-accept").click();
  await expect(page.getByTestId("build-tab")).toContainText("Accepted");
  await expect(page.getByTestId("view-tab-addon.hello-button.main")).toHaveAttribute(
    "title",
    "Hello button",
    { timeout: 15000 },
  );
  await page.getByTestId("view-tab-addon.hello-button.main").click();
  await expect(page.getByTestId("built-view")).toContainText("Built by the builder");
  // Its Tools-menu action works.
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("hello from hello-button");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("toast").last()).toContainText("Hello from hello-button");
});

test("a layout request is a level-1 change shown before it applies", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("move the terminals please");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Move terminals to the right sidebar", {
    timeout: 20000,
  });
  await page.getByTestId("build-accept").click();
  await expect(page.getByTestId("region-right")).toBeVisible();
  await expect(page.getByTestId("region-right").getByTestId("view-tab-jig.terminals")).toBeVisible();
});

test("the builder can show a view below another, as a collapsible section", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("put the pipelines under git");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Pipelines shows below Git", { timeout: 20000 });
  await page.getByTestId("build-accept").click();
  await page.getByTestId("view-tab-addon.git.git").click();
  const section = page.getByTestId("section-addon.pipelines.pipelines");
  await expect(section).toBeVisible();
  // Collapse it, then put it back in its own tab from its menu.
  await page.getByTestId("section-toggle-addon.pipelines.pipelines").click();
  await expect(section.getByTestId("section-toggle-addon.pipelines.pipelines")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await section.hover();
  await page.getByTestId("view-menu-addon.pipelines.pipelines").click();
  await page.getByTestId("section-own-tab").click();
  await expect(section).toHaveCount(0);
  await expect(page.getByTestId("view-tab-addon.pipelines.pipelines")).toBeVisible();
});

test("Discard leaves nothing behind", async ({ page }) => {
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("Throwaway gadget");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 20000 });
  await page.getByTestId("build-discard").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("build-tab")).toContainText("Discarded");
  await expect(page.getByTestId("view-tab-addon.throwaway-gadget.main")).toHaveCount(0);
});

test("a chat can ask for a build; the card follows it", async ({ page, jigHome }) => {
  const dir = join(jigHome, "proj");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("build me a pomodoro timer");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("build-card")).toContainText("Ready to review", { timeout: 20000 });
  await page.getByTestId("build-card").getByTestId("build-accept").click();
  await expect(page.getByTestId("build-card")).toContainText("Accepted");
});

test("Change this with AI on an add-on view starts a build about that add-on", async ({ page }) => {
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Repos" }).click();
  await page.getByTestId("view-menu-addon.repos.overview").click();
  await page.getByTestId("change-with-ai").click();
  await expect(page.getByTestId("build-dialog")).toBeVisible();
  await page.getByTestId("build-goal").fill("show the last commit message");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Changes Repos", { timeout: 20000 });
  await page.getByTestId("build-accept").click();
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await expect(page.getByTestId("addon-repos")).toContainText("your copy");
});

test("when no add-on can do it, you try the request's demo, change it, confirm it and email it", async ({
  jigHome,
}) => {
  const outbox = join(jigHome, "outbox");
  await mkdir(outbox, { recursive: true });
  // JIG_MAIL_OUT: the zip and the mailto: link are written there instead of opening anything.
  const app = await launchJig(jigHome, { JIG_MAIL_OUT: outbox });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-testid=app-root]");
  await page.keyboard.press("Control+Shift+B");
  await page.getByTestId("build-goal").fill("change jig itself: draw in the window frame");
  await page.getByTestId("build-submit").click();
  const request = page.getByTestId("build-proposal");
  await expect(request).toContainText("Needs a change in Jig", { timeout: 20000 });
  await expect(request).toContainText("Title bar items from add-ons");
  await expect(page.getByTestId("build-accept")).toHaveCount(0);

  // 1. Try it: the demo runs right there (sandboxed).
  const demo = page.frameLocator("[data-testid=dev-demo]");
  await expect(demo.locator("button")).toHaveText("Build ✓");
  // A DOM click: the windows are hidden in tests, and a hidden window doesn't route mouse clicks
  // into a sandboxed frame (it runs in its own process).
  await demo.locator("button").dispatchEvent("click");
  await expect(demo.locator("button")).toHaveText("Clicked");
  // Nothing can be sent before you confirm it.
  await expect(page.getByTestId("build-email-request")).toBeDisabled();

  // 2. Change it: the builder writes version 2, with a new demo.
  await page.getByTestId("dev-feedback").fill("Show the build number too");
  await page.getByTestId("dev-revise").click();
  await expect(page.getByTestId("dev-version")).toHaveText("Version 2", { timeout: 20000 });
  await expect(demo.locator("#change")).toHaveText("Show the build number too");
  await request.getByText("What will be requested").click();
  await expect(page.getByTestId("dev-spec")).toContainText("Show the build number too");

  // Confirm, then send: a new email to the developers with the package attached.
  await page.getByTestId("dev-approve").click();
  await expect(page.getByTestId("dev-approved")).toBeVisible();
  await page.getByTestId("build-email-request").click();
  await expect(page.getByTestId("toast").last()).toContainText("Attach jig-request-title-bar-items");
  // The zip is saved in "Downloads" (JIG_MAIL_OUT here) and a mailto: email says to attach it.
  await expect.poll(async () => (await readdir(outbox)).filter((f) => f.endsWith(".zip")).length).toBe(1);
  const [zipName] = (await readdir(outbox)).filter((f) => f.endsWith(".zip"));
  expect(zipName).toMatch(/^jig-request-title-bar-items-from-add-ons-[\w-]+\.zip$/);
  const mailto = decodeURIComponent(await readFile(join(outbox, "mailto.txt"), "utf8"));
  expect(mailto).toContain(
    "mailto:support@sprinta.se?subject=Jig development request: Title bar items from add-ons",
  );
  expect(mailto).toContain(`[Before sending: attach ${zipName}.`);
  await expect(page.getByTestId("dev-emailed")).toBeVisible();
  await app.close();
});
