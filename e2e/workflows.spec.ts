import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AZ_ARGV, expect, hostCall, test } from "./fixtures";

test("Workflows: make one with a check and a command, run it step by step, export it as a skill", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show workflows");
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
  // Saved: the tab is named after the workflow, and each step shows what it does.
  await expect(page.getByTestId("tab-addon.workflows.workflow")).toContainText("Morning");
  await expect(steps.getByTestId("step-detail")).toContainText("echo hello-from-jig");
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

test("Workflows: an AI step runs on the provider and model you pick, else the default (D-412)", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show workflows");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("workflows-view")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("workflow-new").click();

  const editor = page.getByTestId("workflow-editor");
  await editor.getByTestId("workflow-name").fill("Review");
  await editor.getByTestId("workflow-add-step").click();
  const step = editor.getByTestId("workflow-edit-step").first();
  await step.getByLabel("Kind").selectOption("claude");
  await step.getByTestId("step-title").fill("Review the cart");
  await step.getByLabel("Message to the AI").fill("Review the cart code");
  // Unset, it says Default; picking a model doesn't move the step's other fields.
  const runsOn = step.getByTestId("step-runs-on");
  await expect(runsOn).toContainText("Default");
  const titleBefore = await step.getByTestId("step-title").boundingBox();
  await runsOn.click();
  await page.getByTestId("workflow-runs-on-chatgpt").hover();
  await page.getByTestId("workflow-model-sol").click();
  await expect(runsOn).toContainText("ChatGPT · Sol");
  expect(await step.getByTestId("step-title").boundingBox()).toEqual(titleBefore);
  if (process.env.JIG_UI_SHOTS)
    await page.screenshot({ path: ".tmp/shots/workflow-step-runs-on-editor.png" });
  await editor.getByTestId("workflow-save").click();

  // The read view marks the step with the provider and model; Run it starts a chat on them.
  await expect(page.getByTestId("step-runs-on-badge")).toContainText("Sol");
  if (process.env.JIG_UI_SHOTS) await page.screenshot({ path: ".tmp/shots/workflow-step-runs-on-read.png" });
  await page.getByTestId("workflow-run").click();
  await page.getByTestId("step-run").click();
  await expect(page.getByTestId("step-output")).toContainText("Sent to a new chat on ChatGPT · Sol", {
    timeout: 15000,
  });
  type Meta = { id: string; provider?: string; model?: string; title?: string };
  await expect
    .poll(async () => {
      const list = ((await hostCall(page, "sessions.list")) as { value: Meta[] }).value;
      const chat = list.find((m) => m.provider === "codex" || m.provider === "chatgpt");
      return chat ? `${chat.provider} ${chat.model}` : "";
    })
    .toMatch(/sol$/);

  // Back to the default (the chat it started opened in front): nothing is stored, so later default
  // changes still apply.
  await page.getByTestId("tab-addon.workflows.workflow").click();
  await page.getByTestId("workflow-edit").click();
  await page.getByTestId("step-runs-on").click();
  await page.getByTestId("workflow-runs-on-default").click();
  await expect(page.getByTestId("step-runs-on")).toContainText("Default");
  await page.getByTestId("workflow-save").click();
  await expect(page.getByTestId("step-runs-on-badge")).toHaveCount(0);
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const project = projects.value.projects[0]!;
  const saved = (await hostCall(page, "addons.call", {
    id: "workflows",
    method: "list",
    args: { projectId: project.id },
  })) as { value: Array<{ steps: Array<Record<string, unknown>> }> };
  expect(saved.value[0]!.steps[0]!.provider).toBeUndefined();
  expect(saved.value[0]!.steps[0]!.model).toBeUndefined();
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
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show workflows");
  await page.keyboard.press("Enter");
  await page.getByTestId("workflows-view").getByText("Write release notes").click({ timeout: 15000 });
  await expect(page.getByTestId("workflow-steps")).toContainText("Write the notes in Swedish for customers");
  await expect(page.getByTestId("workflow-step")).toHaveCount(4);
});

test("A workflow runs by itself after you push", async ({ page, jigHome }) => {
  const origin = join(jigHome, "origin.git");
  const dir = join(jigHome, "shop");
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, dir]);
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  git(dir, "checkout", "-q", "-b", "main");
  await writeFile(join(dir, "README.md"), "# Shop\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Start");
  git(dir, "push", "-q", "-u", "origin", "main");
  await hostCall(page, "projects.add", { path: dir });

  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show workflows");
  await page.keyboard.press("Enter");
  await page.getByTestId("workflow-new").click();
  const editor = page.getByTestId("workflow-editor");
  await editor.getByTestId("workflow-name").fill("After push");
  await editor.getByTestId("workflow-add-step").click();
  const step = editor.getByTestId("workflow-edit-step").first();
  await step.getByLabel("Kind").selectOption("command");
  await step.getByTestId("step-title").fill("Note the push");
  await step.getByTestId("step-command").fill("echo pushed >> pushed.log");
  await step.getByTestId("step-mode").selectOption("auto");
  await editor.getByTestId("workflow-trigger").selectOption("push");
  await editor.getByTestId("workflow-trigger-branch").fill("main");
  await editor.getByTestId("workflow-save").click();
  await expect(page.getByTestId("workflows-view")).toContainText("After you push main");

  // The watcher (every minute; called directly here). The push before it was saved doesn't count.
  const check = () => hostCall(page, "addons.call", { id: "workflows", method: "checkSchedules", args: {} });
  // The command's lines (Windows' cmd echo leaves a space and CRLF).
  const pushed = async () =>
    (await readFile(join(dir, "pushed.log"), "utf8").catch(() => ""))
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  await check();
  await check();
  expect(await pushed()).toEqual([]);

  await writeFile(join(dir, "NEWS.md"), "news\n");
  git(dir, "add", "NEWS.md");
  git(dir, "commit", "-q", "-m", "News");
  git(dir, "push", "-q");
  await check();
  expect(await pushed()).toEqual(["pushed"]);
  await expect(page.getByTestId("toast").filter({ hasText: "After push ran" })).toBeVisible();
  // Once per push.
  await check();
  expect(await pushed()).toEqual(["pushed"]);
});

test("A workflow tells you when a pipeline fails", async ({ page, jigHome }) => {
  // An az (first on PATH) whose newest finished run of pipeline 12 is in run.json.
  const run = join(jigHome, "run.json");
  const az = `const args = ${AZ_ARGV};
if (args.includes("runs") && args.includes("list")) {
  process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(run)}, "utf8"));
  process.exit(0);
}
process.exit(1);`;
  await writeFile(join(jigHome, "fake-bin", "az-signed-out.cjs"), az);
  await writeFile(join(jigHome, "fake-bin", "az"), `#!/usr/bin/env node\n${az}`);
  await writeFile(run, JSON.stringify([{ id: 100, result: "failed" }]));
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });

  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show workflows");
  await page.keyboard.press("Enter");
  await page.getByTestId("workflow-new").click();
  const editor = page.getByTestId("workflow-editor");
  await editor.getByTestId("workflow-name").fill("Look at the failure");
  await editor.getByTestId("workflow-add-step").click();
  await editor.getByTestId("step-title").first().fill("Read the logs");
  await editor.getByTestId("workflow-trigger").selectOption("pipeline");
  await editor.getByLabel("Organisation").last().fill("https://dev.azure.com/contoso");
  await editor.getByLabel("Azure DevOps project").last().fill("Shop");
  await editor.getByLabel("Pipeline id").last().fill("12");
  await editor.getByTestId("workflow-trigger-result").selectOption("failed");
  await editor.getByTestId("workflow-save").click();
  await expect(page.getByTestId("workflows-view")).toContainText("When pipeline 12 fails");

  const check = () => hostCall(page, "addons.call", { id: "workflows", method: "checkSchedules", args: {} });
  await check(); // remembers run 100, which finished before
  await writeFile(run, JSON.stringify([{ id: 101, result: "succeeded" }]));
  await check(); // a success: not what it waits for
  await writeFile(run, JSON.stringify([{ id: 102, result: "failed" }]));
  await check();
  // A step is yours, so Jig tells you instead of running it.
  const toasts = page.getByTestId("toast").filter({ hasText: "Time for Look at the failure" });
  await expect(toasts).toHaveCount(1);
  await expect(toasts).toContainText("pipeline 12 finished (failed)");
  // Its button leads to Workflows, wherever you are (D-215).
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("task queue");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("workflows-view")).toBeHidden();
  await toasts.getByRole("button", { name: "Open Workflows" }).click();
  await expect(page.getByTestId("workflows-view")).toBeVisible();
});
