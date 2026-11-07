import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";

/** A project ("shop") made active: videos belong to the active project. */
async function shop(page: Page, jigHome: string): Promise<string> {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });
  return projectId;
}

const motion = (page: Page, method: string, args: Record<string, unknown>) =>
  hostCall(page, "addons.call", { id: "motion", method, args }) as Promise<{ value: unknown }>;

test("Motion: a video from a template, its live preview, the first render installs, then renders", async ({
  page,
  jigHome,
}) => {
  await shop(page, jigHome);

  // Top bar → Motion → New video…: a template, a title, Create opens the video's tab.
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-new").click();
  const dialog = page.getByTestId("motion-new");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("motion-new-template").selectOption("whats-new");
  await dialog.getByTestId("motion-new-title").fill("Shop 2.4");
  await dialog.getByTestId("motion-new-create").click();
  const tab = page.getByTestId("motion-video-tab");
  await expect(tab).toBeVisible({ timeout: 15000 });
  await expect(tab.getByTestId("motion-scene").first()).toBeVisible();

  // The preview plays the composition in a sandboxed frame and reports its clock.
  const frame = tab.getByTestId("motion-preview-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(tab.getByTestId("motion-time")).toContainText(/0:0\d \/ 0:\d\d/, { timeout: 15000 });
  const inner = frame.contentFrame();
  await expect(inner.locator("#root[data-composition-id=main]")).toBeAttached();
  await expect(inner.locator("section.clip").first()).toBeAttached();

  // Render: nothing installed yet → the install modal; Install, then the render runs to a version.
  await tab.getByTestId("motion-render").click();
  const install = page.getByTestId("motion-install");
  await expect(install).toBeVisible();
  await install.getByTestId("motion-install-go").click();
  await expect(install).toBeHidden({ timeout: 15000 });
  await tab.getByTestId("motion-render").click();
  await expect(tab.getByTestId("motion-render-row")).toHaveCount(1, { timeout: 20000 });
  await expect(tab.getByTestId("motion-render")).toBeEnabled();

  // Videos: the card shows it rendered.
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-videos").click();
  const card = page.getByTestId("motion-video-card").filter({ hasText: "Shop 2.4" });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "rendered");
});

test("Motion: a render can be cancelled, and a cancelled one leaves no version", async ({
  page,
  jigHome,
}) => {
  const projectId = await shop(page, jigHome);
  await motion(page, "install", {});
  const made = (await motion(page, "create", {
    projectId,
    template: "teaser",
    title: "Hold [hold]",
  })) as { value: { id: string } };
  await hostCall(page, "addons.call", {
    id: "motion",
    method: "render",
    args: { projectId, id: made.value.id },
  });
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-videos").click();
  await page.getByTestId("motion-video-card").filter({ hasText: "Hold" }).click();
  const tab = page.getByTestId("motion-video-tab");
  await expect(tab.getByTestId("motion-cancel")).toBeVisible({ timeout: 10000 });
  await tab.getByTestId("motion-cancel").click();
  await expect(tab.getByTestId("motion-render")).toBeEnabled({ timeout: 10000 });
  await expect(tab.getByTestId("motion-render-row")).toHaveCount(0);
});

test("Motion: speak the scripts, then record a capture of a page and keep it as a scene with marks", async ({
  page,
  jigHome,
}) => {
  const projectId = await shop(page, jigHome);
  const made = (await motion(page, "create", { projectId, template: "teaser", title: "Checkout" })) as {
    value: { id: string; storyboard: { scenes: Array<Record<string, unknown>> } };
  };
  const scenes = made.value.storyboard.scenes.map((sc, i) =>
    i === 0 ? { ...sc, voice: "Checkout in one tap." } : sc,
  );
  await motion(page, "update", {
    projectId,
    id: made.value.id,
    storyboard: { ...(made.value.storyboard as object), scenes },
  });
  const page1 = join(jigHome, "checkout.html");
  await writeFile(
    page1,
    '<html><body style="font:24px sans-serif;padding:40px"><h1>Shop</h1><p>Contact: jane.doe@gmail.com</p>' +
      '<button id="buy" style="font-size:24px">Buy now</button></body></html>',
  );
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-videos").click();
  await page.getByTestId("motion-video-card").filter({ hasText: "Checkout" }).click();
  const tab = page.getByTestId("motion-video-tab");
  await expect(tab).toBeVisible();
  const count = await tab.getByTestId("motion-scene").count();

  // Sound: pick a voice, one scene isn't spoken yet; Speak speaks it on this computer.
  await tab.getByTestId("motion-voice").selectOption({ index: 1 });
  await expect(tab.getByTestId("motion-voice-state")).toHaveText("1 of 1 not spoken");
  await tab.getByTestId("motion-speak").click();
  await expect(tab.getByTestId("motion-voice-state")).toHaveText("All 1 spoken", { timeout: 15000 });

  // + Scene → Record a capture…: the page, one click step, Record.
  await tab.getByTestId("motion-add-scene").click();
  await page.getByRole("menuitem", { name: "Record a capture…" }).click();
  const dialog = page.getByTestId("motion-capture");
  await dialog.getByTestId("motion-capture-url").fill(pathToFileURL(page1).href);
  await dialog.getByTestId("motion-capture-step").first().getByLabel("On what").fill("#buy");
  await dialog.getByTestId("motion-capture-record").click();
  await expect(dialog.getByTestId("motion-capture-video")).toBeVisible({ timeout: 30000 });

  // The page shows a real-looking email: Keep waits until you say it's sample data.
  await expect(dialog.getByTestId("motion-capture-findings")).toContainText("jane.doe@gmail.com");
  await expect(dialog.getByTestId("motion-capture-keep")).toBeDisabled();
  await dialog.getByRole("switch").click();
  await dialog.getByTestId("motion-capture-keep").click();
  await expect(dialog).toBeHidden();
  await expect(tab.getByTestId("motion-scene")).toHaveCount(count + 1);

  // The new capture scene zooms where the click happened.
  await tab.getByTestId("motion-scene").last().click();
  const sheet = page.getByTestId("motion-scene-sheet");
  await expect(sheet.getByTestId("motion-mark")).toHaveCount(1);
  await expect(sheet.getByTestId("motion-mark").getByLabel("Kind of mark")).toHaveValue("zoom");
});

test("Motion: a chat makes and changes a video with the tools, Write with Jig and Make a video from this", async ({
  page,
  jigHome,
}) => {
  await shop(page, jigHome);
  await hostCall(page, "config.update", { chat: { view: "compact" } });
  const visible = page.locator("[data-tab-id]:not(.hidden)");

  // A chat writes a teaser (with a screenshot scene): the card stands in the chat.
  await page.keyboard.press("Control+N");
  await visible.getByTestId("composer-input").fill("make a teaser video of Shop 2.0");
  await page.keyboard.press("Enter");
  let chat = visible.getByTestId("chat");
  await expect(chat).toContainText("Made the teaser.", { timeout: 20000 });
  let card = chat.getByTestId("motion-card");
  await expect(card.getByTestId("motion-card-title")).toHaveText("Shop 2.0");
  await expect(card.getByTestId("motion-card-meta")).toContainText("3 scenes");
  await expect(card.getByTestId("motion-card-render")).toHaveText("Render");

  // Another chat changes it by scene id: the screenshot stays, a scene is added.
  await page.keyboard.press("Control+N");
  await visible.getByTestId("composer-input").fill("change the video's title");
  await page.keyboard.press("Enter");
  chat = visible.getByTestId("chat");
  await expect(chat).toContainText("Changed the video.", { timeout: 20000 });
  card = chat.getByTestId("motion-card");
  await expect(card.getByTestId("motion-card-title")).toHaveText("Shop 2.0 is here");
  await expect(card.getByTestId("motion-card-meta")).toContainText("4 scenes");
  if (process.env.JIG_UI_SHOTS) await chat.screenshot({ path: join(SHOTS_DIR, "motion-card-chat.png") });

  // Open → the video's tab; Write with Jig starts from the brief and sends it to a new chat.
  await card.getByTestId("motion-card-open").click();
  const tab = page.getByTestId("motion-video-tab");
  await expect(tab.getByTestId("motion-scene")).toHaveCount(4, { timeout: 15000 });
  await tab.getByTestId("motion-write").click();
  const write = page.getByTestId("motion-write-dialog");
  await expect(write.getByTestId("motion-write-text")).toHaveValue("A 20 s teaser of Shop 2.0 for customers");
  await write.getByTestId("motion-write-text").fill("Make it calmer, for partners");
  if (process.env.JIG_UI_SHOTS) await write.screenshot({ path: join(SHOTS_DIR, "motion-write-dialog.png") });
  await write.getByTestId("motion-write-send").click();
  await expect(write).toBeHidden();
  await expect(visible.getByTestId("chat")).toContainText("Make it calmer, for partners", { timeout: 20000 });
  await expect(visible.getByTestId("chat")).toContainText("addon_motion_update");

  // A reply's ⋯ → Make a video from this: kind and length, then that chat is asked.
  await page.keyboard.press("Control+N");
  await visible.getByTestId("composer-input").fill("Gift cards for Shop");
  await page.keyboard.press("Enter");
  const reply = visible.getByTestId("assistant-message").last();
  await expect(reply).toContainText("You said: Gift cards for Shop", { timeout: 20000 });
  await reply.hover();
  await reply.getByRole("button", { name: "Message options" }).click();
  await page.getByRole("menuitem", { name: "Make a video from this" }).click();
  const from = page.getByTestId("motion-from-message");
  await from.getByRole("combobox").first().selectOption("whats-new");
  if (process.env.JIG_UI_SHOTS) await from.screenshot({ path: join(SHOTS_DIR, "motion-from-message.png") });
  await from.getByTestId("motion-from-message-send").click();
  await expect(from).toBeHidden();
  await expect(visible.getByTestId("chat")).toContainText("video of about 40 s with Motion", {
    timeout: 20000,
  });
});

test("Motion: a free composition starts at Write with Jig, a chat composes it, unsafe markup is refused", async ({
  page,
  jigHome,
}) => {
  const projectId = await shop(page, jigHome);
  await hostCall(page, "config.update", { chat: { view: "compact" } });

  // New video → Start from: Free composition → the tab opens with Write with Jig, on a free composition.
  await page.getByTestId("motion-topbar").click();
  await page.getByTestId("motion-menu-new").click();
  const dialog = page.getByTestId("motion-new");
  await dialog.getByTestId("motion-new-template").selectOption("free");
  await dialog.getByTestId("motion-new-title").fill("Shop 2.0");
  await dialog.getByTestId("motion-new-create").click();
  const write = page.getByTestId("motion-write-dialog");
  await expect(write).toBeVisible({ timeout: 15000 });
  await expect(write.getByTestId("motion-write-picture")).toHaveValue("free");
  await write.getByRole("button", { name: "Cancel" }).click();

  // A chat composes it: the tab shows the free composition, its clips play in the preview.
  const visible = page.locator("[data-tab-id]:not(.hidden)");
  await page.keyboard.press("Control+N");
  await visible.getByTestId("composer-input").fill("compose the video");
  await page.keyboard.press("Enter");
  const chat = visible.getByTestId("chat");
  await expect(chat).toContainText("Composed the video.", { timeout: 20000 });
  await chat.getByTestId("motion-card").getByTestId("motion-card-open").click();
  const tab = visible.getByTestId("motion-video-tab");
  await expect(tab.getByTestId("motion-custom-note")).toBeVisible({ timeout: 15000 });
  await expect(tab).toContainText("Free composition");
  const inner = tab.getByTestId("motion-preview-frame").contentFrame();
  await expect(inner.locator("h1.big").first()).toHaveText("Shop 2.0");
  await expect(tab.getByTestId("motion-time")).toContainText("/ 0:07", { timeout: 15000 });

  // Scripts and network loads never get in.
  const videos = (await motion(page, "list", { projectId })).value as Array<{ id: string }>;
  const refused = await motion(page, "setComposition", {
    projectId,
    id: videos[0]!.id,
    composition: {
      css: "",
      html: '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><script>x()</script><img src="https://x.test/a.png"></div>',
    },
  });
  expect(JSON.stringify(refused)).toContain("<script> isn't allowed");
});

test("Motion at sidebar, panel and tab widths, Dark and Light (JIG_UI_SHOTS=1)", async ({
  page,
  app,
  jigHome,
}) => {
  test.skip(!process.env.JIG_UI_SHOTS, "set JIG_UI_SHOTS=1 to take the design-check screenshots");
  test.setTimeout(240_000);
  const projectId = await shop(page, jigHome);
  await motion(page, "install", {});
  for (const [template, title] of [
    ["teaser", "Shift swap"],
    ["whats-new", "Shop 2.4"],
    ["walkthrough", "Getting started"],
  ])
    await motion(page, "create", { projectId, template, title });
  const size = (width: number, height: number) =>
    app.evaluate(
      ({ BrowserWindow }, [w, h]) => {
        BrowserWindow.getAllWindows()
          .find((x) => x.webContents.getURL().startsWith("jig-app:"))!
          .setContentSize(w!, h!);
      },
      [width, height],
    );
  for (const theme of ["jig-dark", "jig-light"]) {
    await hostCall(page, "config.update", { appearance: { themeId: theme } });
    await size(1600, 900);
    await shootView(page, "addon.motion.videos", `motion-videos-${theme}`, {
      ready: (panel) => expect(panel.getByTestId("motion-video-card").first()).toBeVisible(),
    });
    const main = page.getByTestId("main-area");
    for (const [width, label] of [
      [1600, "wide"],
      [820, "narrow"],
    ] as const) {
      await size(width, 900);
      await page.getByTestId("motion-topbar").click();
      await page.getByTestId("motion-menu-videos").click();
      await page.getByTestId("motion-video-card").filter({ hasText: "Shop 2.4" }).first().click();
      await expect(main.getByTestId("motion-video-tab")).toBeVisible();
      await expect(main.getByTestId("motion-time")).toContainText("/", { timeout: 15000 });
      await page.waitForTimeout(1200);
      await main.screenshot({
        path: join(SHOTS_DIR, `motion-tab-${label}-${theme}.png`),
        animations: "disabled",
      });
    }
    await size(1600, 900);
    await main.getByTestId("motion-scene").nth(1).click();
    await expect(page.getByTestId("motion-scene-sheet")).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId("motion-scene-sheet")).toBeVisible();
    await page.screenshot({ path: join(SHOTS_DIR, `motion-scene-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("motion-scene-sheet")).toBeHidden();
    await main.getByTestId("motion-add-scene").click();
    await page.getByRole("menuitem", { name: "Record a capture…" }).click();
    const capture = page.getByTestId("motion-capture");
    await capture.getByTestId("motion-capture-url").fill("https://shop.example.com");
    await capture.getByTestId("motion-capture-add-step").click();
    await capture.getByTestId("motion-capture-step").nth(1).getByLabel("What to do").selectOption("type");
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS_DIR, `motion-capture-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(capture).toBeHidden();
  }
});
