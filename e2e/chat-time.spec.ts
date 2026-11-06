import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { seedChatTime } from "./chatTimeSeed";
import { expect, hostCall, test } from "./fixtures";

test("Chat time: in View → Views, a project or all projects, a chat's own tab and the AI tools", async ({
  page,
  jigHome,
}) => {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });
  // Two chats in the shop and one in a project that isn't open here.
  await seedChatTime(jigHome, [projectId], { count: 2 });
  await seedChatTime(jigHome, ["contoso-project"], { count: 1 });

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

  // A chat's own breakdown opens in a tab of its own.
  await view.getByTestId("chat-time-chat").first().click();
  const tab = page.getByTestId("chat-time-chat-tab");
  await expect(tab).toBeVisible();
  await expect(tab).toContainText("Others at once");
  await expect(tab.getByTestId("chat-time-categories")).toContainText("Browser checks");

  // The AI tools answer compact text.
  const tool = (await hostCall(page, "addons.call", {
    id: "chat-time",
    method: "toolBreakdown",
    args: { scope: "all", days: 7, top: 2 },
  })) as { value: string };
  expect(tool.value).toContain("All projects, last 7 days");
  expect(tool.value).toContain("Tests & builds |");
});
