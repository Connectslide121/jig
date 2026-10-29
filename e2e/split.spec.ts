import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("split view: open a tab to the side, drag one to the edge, close back to one pane", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  // Two tabs: a chat and Settings.
  await page.keyboard.press("Control+N");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await page.getByTestId("settings-button").click();
  const left = page.getByTestId("main-pane-left");
  await expect(left.getByTestId("tab-jig.settings")).toBeVisible();

  // Right-click the chat's tab → Open to the side.
  await left.getByTestId("tab-jig.chat").click({ button: "right" });
  await page.getByTestId("tab-open-side").click();
  const right = page.getByTestId("main-pane-right");
  await expect(right.getByTestId("tab-jig.chat")).toBeVisible();
  await expect(right.getByTestId("composer-input")).toBeVisible();
  // Both show at once.
  await expect(left.getByTestId("tab-jig.settings")).toBeVisible();
  await expect(page.getByTestId("main-split-handle")).toBeVisible();

  // Move it back: one pane again.
  await right.getByTestId("tab-jig.chat").click({ button: "right" });
  await page.getByTestId("tab-open-side").click();
  await expect(page.getByTestId("main-pane-right")).toHaveCount(0);

  // Drag a tab to the right edge: it opens to the side.
  const box = await left.boundingBox();
  await left.getByTestId("tab-jig.settings").dragTo(left, {
    targetPosition: { x: box!.width - 40, y: box!.height / 2 },
  });
  await expect(page.getByTestId("main-pane-right").getByTestId("tab-jig.settings")).toBeVisible();

  // The split is kept in the layout and survives a reload.
  await expect
    .poll(async () => JSON.stringify(((await hostCall(page, "layout.get")) as { value: unknown }).value))
    .toContain('"split"');
  await page.reload();
  await page.waitForSelector("[data-testid=app-root]");
  await expect(page.getByTestId("main-pane-right").getByTestId("tab-jig.settings")).toBeVisible();

  // Closing the last tab of a pane ends the split.
  await page
    .getByTestId("main-pane-right")
    .getByRole("button", { name: /^Close/ })
    .click();
  await expect(page.getByTestId("main-pane-right")).toHaveCount(0);
  await expect(page.getByTestId("main-pane-left").getByTestId("tab-jig.chat")).toBeVisible();
});
