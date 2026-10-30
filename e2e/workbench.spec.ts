import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("shows the shell with Jig's own top bar and the projects view", async ({ page }) => {
  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await expect(page.getByTestId("region-left")).toBeVisible();
  await expect(page.getByTestId("main-empty")).toBeVisible();
  await expect(page.getByTestId("statusbar")).toContainText("fake engine");
});

test("the Tools menu lists actions, filters them and runs them", async ({ page }) => {
  await page.getByTestId("tools-button").click();
  await expect(page.getByTestId("tools-menu")).toBeVisible();
  await page.getByTestId("tools-filter").fill("settings");
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

test("drag a view's tab to reorder it, or onto another sidebar to move it there", async ({ page }) => {
  const left = page.getByTestId("region-left");
  const right = page.getByTestId("region-right");
  await page.getByTestId("suggestions-badge").click();
  await expect(right.getByTestId("view-tab-jig.suggestions")).toBeVisible();
  await right.getByTestId("view-tab-jig.suggestions").dragTo(left.getByTestId("view-tab-jig.sessions"));
  await expect(left.getByTestId("view-tab-jig.suggestions")).toBeVisible();
  await expect(right.getByTestId("view-tab-jig.suggestions")).toHaveCount(0);
  const leftViews = async () =>
    ((await hostCall(page, "layout.get")) as { value: { left: { views: string[] } } }).value.left.views;
  await expect
    .poll(async () => {
      const v = await leftViews();
      return v.indexOf("jig.suggestions") === v.indexOf("jig.sessions") - 1;
    })
    .toBe(true);
  // Within the sidebar: dropped on the bar's empty end, it goes last.
  await left.getByTestId("view-tab-jig.suggestions").dragTo(left.getByTestId("view-tabs-left"), {
    targetPosition: { x: 2, y: 2 },
  });
  await expect.poll(async () => (await leftViews()).includes("jig.suggestions")).toBe(true);
});

test("a submenu opens beside its menu, on the left when there's no room on the right", async ({ page }) => {
  // The bottom panel's ⋯ is at the window's right edge.
  await page.keyboard.press("Control+`");
  await page.getByTestId("region-bottom").locator("[data-testid^=view-menu-]").first().click();
  await page.getByTestId("place-below").hover();
  const menus = page.getByRole("menu");
  await expect(menus).toHaveCount(2);
  const [parent, sub] = [(await menus.nth(0).boundingBox())!, (await menus.nth(1).boundingBox())!];
  expect(sub.x + sub.width).toBeLessThanOrEqual(parent.x + 4);
});

test("action groups open separate menus and model defaults remain configurable", async ({ page }) => {
  await expect(page.getByTestId("tools-group-Jig")).toHaveCount(0);
  await page.getByTestId("jig-menu").click();
  await expect(page.getByRole("menuitem", { name: "Reload window", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "What Jig can do", exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByTestId("tools-group-Layout").click();
  await expect(page.getByRole("menuitem", { name: /Toggle bottom panel/ })).toBeVisible();
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
  await page.getByTestId("tools-group-Projects").hover();
  await expect(page.getByRole("menuitem", { name: /New project/ })).toBeVisible();
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
  for (let i = 0; i < 14; i++) await page.keyboard.press("Control+N");
  const strip = page.getByTestId("main-pane-left").getByRole("tablist");
  await expect(strip.getByRole("tab")).toHaveCount(14);
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
});
