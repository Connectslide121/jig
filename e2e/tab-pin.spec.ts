import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

const tabOrder = (page: import("@playwright/test").Page) =>
  page
    .getByTestId("main-pane-left")
    .locator('[role="tab"]')
    .evaluateAll((tabs) => tabs.map((t) => t.getAttribute("data-testid")));

test("tabs: pin keeps a tab first and unclosable until unpinned, and survives a restart", async ({
  app,
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  // A chat that has a prompt (so it is saved), then Settings to its right.
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("Hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-result")).toHaveCount(1);
  await page.getByTestId("settings-button").click();
  const chat = page.getByTestId("tab-jig.chat");
  const settings = page.getByTestId("tab-jig.settings");
  await expect(settings).toBeVisible();
  expect(await tabOrder(page)).toEqual(["tab-jig.chat", "tab-jig.settings"]);

  // Pin Settings from its context menu: it moves first and loses its close button.
  await settings.click({ button: "right" });
  await page.getByTestId("tab-pin").click();
  expect(await tabOrder(page)).toEqual(["tab-jig.settings", "tab-jig.chat"]);
  await expect(settings).toHaveAttribute("data-pinned", "true");
  await expect(settings.getByRole("button", { name: /^Close/ })).toHaveCount(0);
  await expect(chat.getByRole("button", { name: /^Close/ })).toHaveCount(1);

  // Pinning from the tab's own button works too, in pin order: the chat goes after Settings.
  await chat.hover();
  await chat.getByTestId("tab-pin-button").click();
  expect(await tabOrder(page)).toEqual(["tab-jig.settings", "tab-jig.chat"]);
  await expect(chat).toHaveAttribute("data-pinned", "true");
  await chat.getByTestId("tab-unpin-button").click();
  await expect(chat).not.toHaveAttribute("data-pinned", "true");

  // Nothing closes a pinned tab: Ctrl+W, middle-click, the menu, Close all.
  await settings.click();
  await page.keyboard.press("Control+W");
  await settings.dispatchEvent("mousedown", { button: 1 });
  await settings.click({ button: "right" });
  await expect(page.getByTestId("tab-close")).toHaveAttribute("aria-disabled", "true");
  await page.getByText("Close all").click();
  await expect(chat).toHaveCount(0);
  await expect(settings).toBeVisible();

  // It stays pinned across a restart.
  await app.close();
  const again = await launchJig(jigHome);
  const page2 = await again.firstWindow();
  await page2.waitForSelector("[data-testid=app-root] [data-testid=main-area]");
  await expect(page2.getByTestId("tab-jig.settings")).toHaveAttribute("data-pinned", "true");

  // Unpinning puts it back to normal, and then it closes.
  await page2.getByTestId("tab-jig.settings").getByTestId("tab-unpin-button").click();
  await page2
    .getByTestId("tab-jig.settings")
    .getByRole("button", { name: /^Close/ })
    .click();
  await expect(page2.getByTestId("tab-jig.settings")).toHaveCount(0);
  await again.close();
});
