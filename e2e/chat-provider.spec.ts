import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

// A new chat picks Claude or ChatGPT beside its model picker, until its first message (D-314).
// The fake engine stands in for Codex and reports ChatGPT as signed in.
test("a new chat switches to ChatGPT before its first message, then hands over through the dialog", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");

  const picker = page.getByTestId("provider-menu");
  await expect(picker).toContainText("Claude");
  await picker.click();
  await page.getByTestId("provider-codex").click();
  await expect(picker).toContainText("ChatGPT");
  // ChatGPT's families in the model picker, and Plan only (Jig's exit_plan tool, D-315).
  await expect(page.getByTestId("model-menu")).toContainText("Sol");
  await page.getByTestId("permission-menu").click();
  await expect(page.getByTestId("mode-plan")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("composer-input").fill("Hello");
  await page.keyboard.press("Enter");
  await expect(page.getByText("You said:")).toBeVisible({ timeout: 15000 });
  // Started: picking the other provider is a handover now, through its dialog (D-339).
  await picker.click();
  await expect(page.getByText("Hand this chat over to", { exact: true })).toBeVisible();
  await page.getByTestId("provider-claude").click();
  await expect(page.getByTestId("handover-dialog")).toBeVisible();
  await page.getByTestId("handover-dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(picker).toContainText("ChatGPT");
  await expect(page.getByTestId("user-message-edit")).toHaveCount(0);
});

test("Settings → Chats: new chats run on ChatGPT, with the default badge on its group", async ({ page }) => {
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-engine").click();
  const badge = (group: string) => page.getByTestId(group).getByTestId("settings-default-badge");
  await expect(badge("settings-claude-chats")).toBeVisible();
  await page.getByTestId("settings-chat-provider-codex").click();
  await expect
    .poll(
      async () =>
        ((await hostCall(page, "config.get")) as { value: { engine: { provider: string } } }).value.engine
          .provider,
    )
    .toBe("codex");
  await expect(badge("settings-chatgpt-chats")).toBeVisible();
  await expect(badge("settings-claude-chats")).toHaveCount(0);
});

test("Settings → Chats: Claude's reasoning effort is the default for new chats after the project's (D-390)", async ({
  page,
  jigHome,
}) => {
  const path = join(jigHome, "shop");
  await mkdir(path, { recursive: true });
  const project = (await hostCall(page, "projects.add", { path })) as { value: { id: string } };
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-engine").click();
  const picker = page.getByTestId("settings-claude-effort");
  await expect(picker).toHaveValue("");
  await picker.selectOption("high");
  const effortOfNewChat = async (provider?: "claude" | "codex") =>
    (
      (await hostCall(page, "sessions.create", { projectId: project.value.id, cwd: path, provider })) as {
        value: { effort?: string };
      }
    ).value.effort ?? "";
  await expect.poll(() => effortOfNewChat()).toBe("high");
  // A project that sets only a model still gets Jig's effort; its own effort wins.
  await hostCall(page, "projects.update", { id: project.value.id, model: "sonnet" });
  expect(await effortOfNewChat()).toBe("high");
  await hostCall(page, "projects.update", { id: project.value.id, effort: "low" });
  expect(await effortOfNewChat()).toBe("low");
  // ChatGPT chats keep their own default.
  await page.getByTestId("settings-codex-effort").selectOption("medium");
  await expect.poll(() => effortOfNewChat("codex")).toBe("medium");
});
