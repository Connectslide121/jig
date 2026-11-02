import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

type Meta = {
  id: string;
  title: string;
  projectId?: string;
  pinned?: boolean;
  permissionMode: string;
  cwd: string;
};
const chats = async (page: Parameters<typeof hostCall>[0]) =>
  ((await hostCall(page, "sessions.list")) as { value: Meta[] }).value;

test("projects you manage: create with defaults, chats grouped, pinned, dragged and moved", async ({
  page,
  jigHome,
}) => {
  const repos = join(jigHome, "repos");
  await mkdir(join(repos, "shop", ".git"), { recursive: true });
  await mkdir(join(repos, "elearning", ".git"), { recursive: true });
  await hostCall(page, "workspaces.add", { path: repos });

  // A new project from the Projects view: name, default workspace and repository, defaults for chats.
  await page.getByTestId("view-tab-jig.projects").click();
  await page.getByTestId("projects-new").click();
  const dialog = page.getByTestId("project-dialog");
  await dialog.getByTestId("project-name").fill("Shop");
  await expect(dialog.getByTestId("project-workspace")).toHaveValue(repos);
  await dialog.getByTestId("project-repo").selectOption({ label: "shop" });
  await dialog.getByTestId("project-mode").selectOption("plan");
  await dialog.getByTestId("project-instructions").fill("Release notes in Swedish.");
  await dialog.getByTestId("project-starters").fill("Plan the next ticket\nFix the flaky test");
  await dialog.getByTestId("project-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("project-switcher")).toContainText("Shop");
  await expect(page.getByTestId("project-Shop")).toContainText("repos · shop");

  // Its Home: its starter prompts, and New chat opens a chat with its defaults in the picked folder.
  const home = page.getByTestId("home").first();
  await expect(home).toContainText("Plan the next ticket");
  await home.getByTestId("home-folder").selectOption(join(repos, "elearning"));
  await home.getByTestId("home-new-chat").click();
  const composer = page.locator("[data-tab-id]:not(.hidden)").getByTestId("composer-input");
  await composer.fill("hello");
  await composer.press("Enter");
  await expect.poll(async () => (await chats(page)).length).toBe(1);
  const [first] = await chats(page);
  expect(first).toMatchObject({ permissionMode: "plan", cwd: join(repos, "elearning") });
  const project = (
    (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string; name: string }> } }
  ).value.projects[0]!;
  expect(first!.projectId).toBe(project.id);

  // A second project and a chat in no project.
  const other = (
    (await hostCall(page, "projects.create", { name: "Elearning", path: repos })) as { value: { id: string } }
  ).value;
  await hostCall(page, "projects.setActive", { id: project.id });
  const createdLoosechat = (await hostCall(page, "sessions.create", { cwd: repos, title: "Loose chat" })) as {
    value: { id: string };
  };
  await hostCall(page, "sessions.send", { id: createdLoosechat.value.id, text: "Hello" });
  await page.getByTestId("view-tab-jig.sessions").click();
  const view = page.getByTestId("sessions-view");
  await expect(view.getByTestId("chat-group-No project")).toContainText("Loose chat");

  // Drag the loose chat onto Elearning; it moves there.
  await view.getByTestId("session-Loose chat").dragTo(view.getByTestId("chat-group-Elearning"));
  await expect
    .poll(async () => (await chats(page)).find((c) => c.title === "Loose chat")?.projectId)
    .toBe(other.id);

  // Pin the first chat: it stays on top of its project.
  const createdNewerchat = (await hostCall(page, "sessions.create", {
    projectId: project.id,
    title: "Newer chat",
  })) as { value: { id: string } };
  await hostCall(page, "sessions.send", { id: createdNewerchat.value.id, text: "Hello" });
  const shop = view.getByTestId("chat-group-Shop");
  await expect(shop.locator("[data-testid^=session-]").first()).toContainText("Newer chat");
  await shop.getByTestId(`session-${first!.title}`).hover();
  await shop.getByTestId(`session-pin-${first!.title}`).click();
  await expect(shop.locator("[data-testid^=session-]").first()).toContainText(first!.title);

  // Move it out of the project from its menu.
  await shop.getByTestId("session-Newer chat").click({ button: "right" });
  await page.getByTestId("session-move").hover();
  await page.getByTestId("session-move-none").click();
  await expect(view.getByTestId("chat-group-No project")).toContainText("Newer chat");

  // Removing a project moves its chats to "No project".
  await hostCall(page, "projects.remove", { id: other.id });
  await expect(view.getByTestId("chat-group-No project")).toContainText("Loose chat");
});

test("Claude can make a project and put the chat in it, with Undo", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "workspaces.add", { path: dir });
  const createdPlanning = (await hostCall(page, "sessions.create", { cwd: dir, title: "Planning" })) as {
    value: { id: string };
  };
  await hostCall(page, "sessions.send", { id: createdPlanning.value.id, text: "Hello" });
  await page.getByTestId("view-tab-jig.sessions").click();
  await page.getByTestId("session-Planning").click();
  await page.getByTestId("composer-input").fill("make a project for this chat");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat")).toContainText("put this chat in it", { timeout: 15000 });
  await expect(page.getByTestId("chat-group-Fake project")).toContainText("Planning");
  const [chat] = await chats(page);
  expect(chat).toMatchObject({ pinned: true });
  // Undo the move: the chat is back in "No project".
  await page.getByTestId("change-card").last().getByTestId("change-undo").click();
  await expect(page.getByTestId("chat-group-No project")).toContainText("Planning");
});
