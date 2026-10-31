import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("shows the shell with Jig's own top bar and the projects view", async ({ page }) => {
  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await expect(page.getByTestId("region-left")).toBeVisible();
  await expect(page.getByTestId("main-empty")).toBeVisible();
  await expect(page.getByTestId("statusbar")).toContainText("fake engine");
});

test("search finds actions and runs them without a separate Tools dropdown", async ({ page }) => {
  await expect(page.getByTestId("tools-button")).toHaveCount(0);
  await page.getByTestId("goto-button").click();
  await expect(page.getByTestId("goto")).toBeVisible();
  await page.getByTestId("goto-input").fill("settings");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("settings")).toBeVisible();
  // Opening settings again reuses the same tab.
  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("tab-jig.settings")).toHaveCount(1);
});

test("keyboard shortcuts run actions", async ({ page }) => {
  await page.keyboard.press("Control+B");
  await expect(page.getByTestId("region-left")).toBeHidden();
  await page.keyboard.press("Control+B");
  await expect(page.getByTestId("region-left")).toBeVisible();
});

test("search stays in the top bar with results directly beneath it and no layout shift", async ({ page }) => {
  const input = page.getByTestId("goto-input");
  await expect(input).toBeVisible();
  for (const width of [1100, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    const before = await page.getByTestId("region-left").boundingBox();
    await input.fill("settings");
    const results = page.getByTestId("goto");
    await expect(results).toBeVisible();
    const anchor = await page.getByTestId("goto-button").boundingBox();
    const dropdown = await results.boundingBox();
    expect(Math.abs(dropdown!.y - anchor!.y - anchor!.height - 4)).toBeLessThan(1);
    expect(Math.abs(dropdown!.x + dropdown!.width / 2 - anchor!.x - anchor!.width / 2)).toBeLessThan(1);
    expect(await page.getByTestId("region-left").boundingBox()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(results).toHaveCount(0);
    await expect(input).toBeVisible();
  }
  for (const shortcut of ["Control+K", "Control+P"]) {
    await page.keyboard.press(shortcut);
    await expect(input).toBeFocused();
    await expect(page.getByTestId("goto")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await input.fill("settings");
  await page.screenshot({ path: "test-results/topbar-search.png" });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(input).toHaveValue("");
});

test("views move between regions from their ⋯ menu and the layout is saved", async ({ page, jigHome }) => {
  await page.getByTestId("view-menu-jig.projects").click();
  await page.getByTestId("move-view-right").click();
  await expect(page.getByTestId("region-right")).toContainText("Projects");
  await expect(page.getByTestId("region-left").getByTestId("view-tab-jig.projects")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        JSON.parse(await readFile(join(jigHome, "layout.json"), "utf8").catch(() => "{}")).right?.views,
    )
    .toContain("jig.projects");
  await page.getByTestId("view-menu-jig.projects").click();
  await page.getByTestId("hide-view").click();
  await expect(page.getByTestId("view-tab-jig.projects")).toHaveCount(0);
});

test("projects: add, switch, rename and remove", async ({ page, jigHome }) => {
  const alpha = join(jigHome, "work-alpha");
  const beta = join(jigHome, "work-beta");
  await mkdir(join(alpha, ".git"), { recursive: true });
  await mkdir(beta, { recursive: true });
  await hostCall(page, "projects.add", { path: alpha });
  await hostCall(page, "projects.add", { path: beta });
  await expect(page.getByTestId("project-switcher")).toContainText("work-beta");
  await page.getByTestId("project-work-alpha").click();
  await expect(page.getByTestId("project-switcher")).toContainText("work-alpha");

  await page.getByTestId("project-work-alpha").dblclick();
  await expect(page.getByTestId("project-dashboard")).toContainText("work-alpha");

  await page.getByTestId("project-work-alpha").click({ button: "right" });
  await page.getByTestId("project-rename").click();
  await page.getByTestId("dialog-input").fill("Alpha app");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("project-switcher")).toContainText("Alpha app");
  await expect(page.getByTestId("tab-jig.project")).toContainText("Alpha app");

  await page.getByTestId("project-Alpha app").click({ button: "right" });
  await page.getByTestId("project-remove").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("project-Alpha app")).toHaveCount(0);
  await expect(page.getByTestId("tab-jig.project")).toHaveCount(0);
  const saved = JSON.parse(await readFile(join(jigHome, "projects.json"), "utf8"));
  expect(saved.projects.map((p: { name: string }) => p.name)).toEqual(["work-beta"]);
});

test("tabs and layout survive a restart", async ({ app, page, jigHome }) => {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-learning").click();
  await page.keyboard.press("Control+J");
  await page.waitForTimeout(600); // debounced save
  await app.close();
  const again = await launchJig(jigHome);
  const page2 = await again.firstWindow();
  await expect(page2.getByTestId("settings")).toContainText("Learning");
  await again.close();
});

test("host notifications appear as toasts", async ({ app, page }) => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("jig:event", "notify", {
      title: "Hello from the host",
    });
  });
  await expect(page.getByTestId("toast")).toContainText("Hello from the host");
});

test("sidebars and panes resize by dragging or with the keyboard, and remember it", async ({
  page,
  jigHome,
}) => {
  const region = page.getByTestId("region-left");
  const handle = page.getByTestId("resize-left");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await region.boundingBox())!.width)).toBeGreaterThan(400);
  await handle.focus();
  const before = Math.round((await region.boundingBox())!.width);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.round((await region.boundingBox())!.width)).toBe(before - 16);
  await handle.dblclick();
  await expect.poll(async () => Math.round((await region.boundingBox())!.width)).toBe(280);

  // A pane inside a tab: the Settings list.
  await page.keyboard.press("Control+,");
  const pane = page.getByTestId("pane-jig.settings.nav");
  await expect(pane).toBeVisible();
  const paneHandle = pane.getByRole("separator");
  await paneHandle.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => Math.round((await pane.boundingBox())!.width)).toBe(208 + 64);
  await expect
    .poll(async () => {
      const saved = await readFile(join(jigHome, "layout.json"), "utf8").catch(() => "{}");
      return JSON.parse(saved).panes?.["jig.settings.nav"];
    })
    .toBe(272);
});

/** Drags with the mouse, for drop targets that only appear once a drag has started. */
async function dragOnto(page: Page, from: Locator, to: () => Locator, at?: { x: number; y: number }) {
  await from.hover();
  await page.mouse.down();
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 4 });
  await to().hover({ position: at });
  await page.mouse.up();
}

test("views go anywhere: sidebars, the bottom panel and the main area, by dragging their tabs", async ({
  page,
}) => {
  const left = page.getByTestId("region-left");
  // A view that starts out of the sidebars opens as a tab in the main area.
  await page.getByTestId("suggestions-badge").click();
  await expect(page.getByTestId("view-in-main-jig.suggestions")).toBeVisible();
  // Its tab dragged onto a sidebar's tabs: it moves there, before that tab, and the main tab closes.
  await page.getByTestId("tab-jig.view").dragTo(left.getByTestId("view-tab-jig.sessions"));
  await expect(left.getByTestId("view-tab-jig.suggestions")).toBeVisible();
  await expect(page.getByTestId("tab-jig.view")).toHaveCount(0);
  const layout = async () =>
    (await hostCall(page, "layout.get")) as {
      value: { left: { views: string[] }; right: { views: string[] }; hidden: string[] };
    };
  await expect
    .poll(async () => {
      const v = (await layout()).value.left.views;
      return v.indexOf("jig.suggestions") === v.indexOf("jig.sessions") - 1;
    })
    .toBe(true);
  // A sidebar tab dragged onto the main area: it opens there as a tab.
  await dragOnto(page, left.getByTestId("view-tab-jig.suggestions"), () => page.getByTestId("main-area"));
  await expect(page.getByTestId("view-in-main-jig.suggestions")).toBeVisible();
  await expect(left.getByTestId("view-tab-jig.suggestions")).toHaveCount(0);
  // The right sidebar isn't showing: dragging offers a drop target at the window's edge.
  await dragOnto(page, page.getByTestId("tab-jig.view"), () => page.getByTestId("view-drop-right"));
  await expect(page.getByTestId("region-right").getByTestId("view-tab-jig.suggestions")).toBeVisible();
  await expect(page.getByTestId("tab-jig.view")).toHaveCount(0);
  await expect.poll(async () => (await layout()).value.right.views.includes("jig.suggestions")).toBe(true);
});

test("drag a tab onto a sidebar's lower half to split it; Reset layout puts it back", async ({ page }) => {
  const left = page.getByTestId("region-left");
  const right = page.getByTestId("region-right");
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Right sidebar" }).click();
  await expect(right).toBeVisible();
  await expect(page.getByTestId("region-right2")).toHaveCount(0);
  await dragOnto(page, left.getByTestId("view-tab-jig.sessions"), () => right, {
    x: 100,
    y: (await right.boundingBox())!.height - 60,
  });
  const lower = page.getByTestId("region-right2");
  await expect(lower.getByTestId("view-tab-jig.sessions")).toBeVisible();
  await expect(right.getByTestId("stack-right")).toBeVisible();
  // The split is made by dragging only: the view menu has no "lower" entries.
  await lower.getByTestId("view-tab-jig.sessions").click({ button: "right" });
  await expect(page.getByTestId("move-view-left")).toBeVisible();
  await expect(page.getByTestId("move-view-right2")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByTestId("layout-button").click();
  await page.getByTestId("reset-layout").click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(left.getByTestId("view-tab-jig.sessions")).toBeVisible();
  await expect(page.getByTestId("region-right2")).toHaveCount(0);
});

test("a submenu opens beside its menu, never over it, and stays in the window", async ({ page }) => {
  // The layout button is near the window's right edge.
  await page.getByTestId("layout-button").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  const menus = page.getByRole("menu");
  await expect(menus).toHaveCount(2);
  const [parent, sub] = [(await menus.nth(0).boundingBox())!, (await menus.nth(1).boundingBox())!];
  // It may overlap the parent's padding by a few pixels (like native menus), never its items.
  const beside = sub.x >= parent.x + parent.width - 10 || sub.x + sub.width <= parent.x + 10;
  expect(beside).toBe(true);
  const width = await page.evaluate(() => window.innerWidth);
  expect(sub.x + sub.width).toBeLessThanOrEqual(width);
});

test("action groups are merged into a few top bar menus and model defaults remain configurable", async ({
  page,
}) => {
  await expect(page.getByTestId("tools-group-Jig")).toHaveCount(0);
  await page.getByTestId("jig-menu").click();
  await expect(page.getByRole("menuitem", { name: "Reload window", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "What Jig can do", exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tools-group-Projects")).toHaveCount(0);
  await expect(page.getByTestId("tools-group-Layout")).toHaveCount(0);
  await page.getByTestId("tools-group-View").click();
  await expect(page.getByRole("menuitem", { name: /Toggle bottom panel/ })).toBeVisible();
  await expect(page.getByText("Appearance", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  // Project actions are in the project switcher.
  await page.getByTestId("project-switcher").click();
  await expect(page.getByRole("menuitem", { name: /Add workspace folder/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-engine").click();
  await expect(page.getByRole("combobox", { name: "Default model", exact: true })).toHaveValue("opusplan");
  await expect(page.getByRole("combobox", { name: "Subagent fallback model" })).toHaveValue("sonnet");
  await expect(page.getByLabel("Default permission mode", { exact: true })).toHaveValue("plan");
  await page.getByRole("combobox", { name: "Default model", exact: true }).selectOption("opus");
  await page.getByRole("combobox", { name: "Default model", exact: true }).press("Tab");
  await page.getByRole("button", { name: "Use recommended defaults" }).click();
  await expect(page.getByRole("combobox", { name: "Default model", exact: true })).toHaveValue("opusplan");
});

test("the top menu bar switches groups on hover only while a menu is open", async ({ page }) => {
  await page.getByTestId("tools-group-Build").hover();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTestId("tools-group-Build").click();
  await expect(page.getByRole("menuitem", { name: /Build something/ })).toBeVisible();
  await page.getByTestId("tools-group-View").hover();
  await expect(page.getByRole("menuitem", { name: /Reset layout/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Build something/ })).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByTestId("tools-group-Build").hover();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("menus stay visible when a screenshot overlay blurs the window", async ({ page }) => {
  await page.getByTestId("tools-group-Build").click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("menuitem", { name: /Build something/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("many tabs: the tab strip scrolls without a scrollbar squeezing the tabs", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  const strip = page.getByTestId("main-pane-left").getByRole("tablist");
  for (let i = 0; i < 14; i++) await page.keyboard.press("Control+N");
  // Fourteen chats (Jig may have opened a tab of its own too).
  await expect(strip.getByTestId("tab-jig.chat")).toHaveCount(14);
  const sizes = await strip.evaluate((el) => ({
    overflows: el.scrollWidth > el.clientWidth,
    strip: el.clientHeight,
    tab: el.querySelector<HTMLElement>('[role="tab"]')!.offsetHeight,
  }));
  expect(sizes.overflows).toBe(true);
  // The tabs fill the strip's height: no scrollbar takes part of it.
  expect(sizes.tab).toBeGreaterThanOrEqual(sizes.strip - 1);
  // The newest (active) tab is in view.
  await expect(strip.getByRole("tab", { selected: true })).toBeInViewport();
  // A thin scrollbar over the strip's bottom edge, shown on hover: dragging it scrolls the tabs.
  const bar = page.getByTestId("main-pane-left").getByTestId("overlay-scrollbar");
  await expect(bar).toHaveCount(1);
  await strip.hover();
  const thumb = bar.locator("div");
  const box = (await thumb.boundingBox())!;
  const before = await strip.evaluate((el) => el.scrollLeft);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 2000, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(before).toBeGreaterThan(0);
  expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0);
});
