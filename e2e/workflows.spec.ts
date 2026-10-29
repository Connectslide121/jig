import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

test("Workflows: make one with a check and a command, run it step by step, export it as a skill", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("show workflows");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("workflows-view")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("workflow-new").click();

  const editor = page.getByTestId("workflow-editor");
  await editor.getByTestId("workflow-name").fill("Morning");
  await editor.getByTestId("workflow-add-step").click();
  await editor.getByTestId("step-title").first().fill("Read the build mail");
  await editor.getByTestId("workflow-add-step").click();
  const second = editor.getByTestId("workflow-edit-step").nth(1);
  await second.getByLabel("Kind").selectOption("command");
  await second.getByTestId("step-title").fill("Say hello");
  await second.getByTestId("step-command").fill("echo hello-from-jig");
  await second.getByTestId("step-mode").selectOption("auto");
  await editor.getByTestId("workflow-save").click();

  const steps = page.getByTestId("workflow-steps");
  await expect(steps).toContainText("Read the build mail");
  await expect(page.getByTestId("workflows-view")).toContainText("Morning");
  await page.getByTestId("workflow-run").click();
  // The check is yours; then Jig runs the command by itself.
  await page.getByTestId("step-done").click();
  await expect(page.getByTestId("step-output")).toContainText("hello-from-jig", { timeout: 15000 });
  await expect(page.getByTestId("workflow-result")).toHaveText("Done.");
  await expect(page.getByTestId("workflow-history")).toContainText("by you");

  await page.getByTestId("workflow-skill").click();
  const file = join(dir, ".claude", "skills", "morning", "SKILL.md");
  await expect
    .poll(() => readFile(file, "utf8").catch(() => ""), { timeout: 10000 })
    .toContain("name: morning");
  const skill = await readFile(file, "utf8");
  expect(skill).toContain("name: morning");
  expect(skill).toContain("2. Say hello: run `echo hello-from-jig`.");
});

test("Claude saves a process as a workflow from a chat, and runs it", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("great, save it as a workflow");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("chat")).toContainText("Saved as the workflow Write release notes.", {
    timeout: 15000,
  });
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("show workflows");
  await page.keyboard.press("Enter");
  await page.getByTestId("workflows-view").getByText("Write release notes").click({ timeout: 15000 });
  await expect(page.getByTestId("workflow-steps")).toContainText("Write the notes in Swedish for customers");
  await expect(page.getByTestId("workflow-step")).toHaveCount(4);
});
