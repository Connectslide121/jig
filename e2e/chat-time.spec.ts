import { launchWithChats, seedChatTime } from "./chatTimeSeed";
import { expect, hostCall, test } from "./fixtures";

test("Chat time: in View → Views, a project or all projects, a chat's own tab and the AI tools", async ({
  jigHome,
}) => {
  // Two chats in the shop and one in a project that isn't open here.
  const { app, page } = await launchWithChats(jigHome, async (projectId) => {
    await seedChatTime(jigHome, [projectId], { count: 2 });
    await seedChatTime(jigHome, ["contoso-project"], { count: 1 });
  });
  try {
    await page.getByTestId("tools-group-View").click();
    await page.getByRole("menuitem", { name: "Views" }).hover();
    await page.getByRole("menuitem", { name: "Chat time" }).click();
    const view = page.getByTestId("chat-time");
    await expect(view).toBeVisible({ timeout: 15000 });
    await expect(view.getByTestId("chat-time-categories")).toContainText("Tests & builds");
    await expect(view.getByTestId("chat-time-chat")).toHaveCount(2);

    await view.getByTestId("chat-time-scope").click();
    await page.getByTestId("chat-time-scope-all").click();
    await expect(view.getByTestId("chat-time-scope")).toContainText("All projects");
    await expect(view.getByTestId("chat-time-chat")).toHaveCount(3);

    // A chat's own breakdown opens in a tab of its own; the recorded ends are exact (no ≈, D-423).
    await view.getByTestId("chat-time-chat").first().click();
    const tab = page.getByTestId("chat-time-chat-tab");
    await expect(tab).toBeVisible();
    await expect(tab).toContainText("Others at once");
    await expect(tab.getByTestId("chat-time-categories")).toContainText("Browser checks");
    await expect(tab.getByTestId("chat-time-slow-call").first()).not.toContainText("≈");

    // The AI tools answer compact text.
    const tool = (await hostCall(page, "addons.call", {
      id: "chat-time",
      method: "toolBreakdown",
      args: { scope: "all", days: 7, top: 2 },
    })) as { value: string };
    expect(tool.value).toContain("All projects, last 7 days");
    expect(tool.value).toContain("Tests & builds |");
    expect(tool.value).not.toContain("~ = estimated");
  } finally {
    await app.close();
  }
});

test("Chat time: tool calls show their duration in a reserved slot, and the chat overview has a section (D-423)", async ({
  page,
  jigHome,
}) => {
  await hostCall(page, "projects.add", { path: jigHome });
  await hostCall(page, "config.update", { chat: { times: true } });
  await page.keyboard.press("Control+N");
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  await tab.getByTestId("composer-input").fill("use a skill to explain the code");
  await page.keyboard.press("Enter");
  await expect(tab.getByTestId("turn-result")).toHaveCount(1, { timeout: 15000 });

  // Every finished call has its time, right-aligned in a slot of the same width.
  const times = tab.getByTestId("tool-duration");
  await expect(times.first()).toHaveText(/^\d+(\.\d)? s$/);
  const widths = await times.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().width)),
  );
  expect(new Set(widths).size).toBe(1);

  // Chat time's section in the overview card: the breakdown of this chat, and More opens its tab.
  const section = tab.getByTestId("chat-overview").getByTestId("chat-overview-section");
  await expect(section).toContainText("Where the time went");
  const overview = section.getByTestId("chat-time-overview");
  await expect(overview.getByTestId("chat-time-overview-categories")).toContainText("Model");

  // It folds and opens from its header.
  const toggle = section.getByTestId("chat-overview-section-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // Show times off hides the durations.
  await hostCall(page, "config.update", { chat: { times: false } });
  await expect(tab.getByTestId("tool-duration")).toHaveCount(0);

  // More opens the chat's Chat time tab.
  await overview.getByTestId("chat-time-overview-more").click();
  await expect(page.getByTestId("chat-time-chat-tab")).toBeVisible();
});
