import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

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
  await check();
  await check();
  expect(await readFile(join(dir, "pushed.log"), "utf8").catch(() => "")).toBe("");

  await writeFile(join(dir, "NEWS.md"), "news\n");
  git(dir, "add", "NEWS.md");
  git(dir, "commit", "-q", "-m", "News");
  git(dir, "push", "-q");
  await check();
  expect(await readFile(join(dir, "pushed.log"), "utf8")).toBe("pushed\n");
  await expect(page.getByTestId("toast").filter({ hasText: "After push ran" })).toBeVisible();
  // Once per push.
  await check();
  expect(await readFile(join(dir, "pushed.log"), "utf8")).toBe("pushed\n");
});

test("A workflow tells you when a pipeline fails", async ({ page, jigHome }) => {
  // An az (first on PATH) whose newest finished run of pipeline 12 is in run.json.
  const run = join(jigHome, "run.json");
  const az = `const args = process.argv.slice(2);
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
});
