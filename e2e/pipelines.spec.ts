import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

const YAML = `trigger:
  - main

parameters:
  - name: deployTo
    displayName: Deploy to (manual runs only)
    type: string
    default: none
    values: [none, staging, production]
  - name: runTests
    displayName: Run tests
    type: boolean
    default: true

steps:
  - script: echo build
`;

/**
 * An `az` that answers like Azure DevOps for the contoso/Shop repository (one pipeline, one retired)
 * and writes the arguments of `az pipelines run` to az-run.json.
 */
function fakeAz(jigHome: string) {
  const out = JSON.stringify(join(jigHome, "az-run.json"));
  return `
const args = process.argv.slice(2);
const has = (...words) => words.every((w) => args.includes(w));
const say = (value) => { process.stdout.write(JSON.stringify(value)); process.exit(0); };
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
if (has("pipelines", "list") && !has("runs")) say([
  { id: 12, name: "Shop CI", queueStatus: "enabled" },
  { id: 13, name: "(old) Shop", queueStatus: "enabled" },
]);
if (has("pipelines", "show")) say({ process: { yamlFilename: "/azure-pipelines.yml" }, repository: { defaultBranch: "refs/heads/main" } });
if (has("pipelines", "runs", "list")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
if (has("pipelines", "runs", "list")) say([{
  id: 100, buildNumber: "20261029.1", status: "completed", result: "succeeded",
  sourceBranch: "refs/heads/main", reason: "manual", queueTime: ago(40), startTime: ago(35), finishTime: ago(12),
  requestedFor: { displayName: "Ann Demo" }, templateParameters: { deployTo: "staging", runTests: "True" },
  definition: { id: 12 },
}]);
if (has("devops", "invoke")) say({ records: [
  { type: "Stage", name: "Build", order: 1, state: "completed", result: "succeeded" },
  { type: "Stage", name: "Deploy to none", order: 2, state: "completed", result: "skipped" },
  { type: "Stage", name: "Deploy to staging", order: 3, state: "completed", result: "succeeded" },
]});
if (has("pipelines", "run")) {
  require("node:fs").writeFileSync(${out}, JSON.stringify(args));
  say({ id: 101, buildNumber: "20261029.2", status: "notStarted", sourceBranch: "refs/heads/develop" });
}
console.error("ERROR: Please run 'az login' to setup account.");
process.exit(1);
`;
}

test("Pipelines: your repositories' pipelines, the newest run and its stages, a Run form with the YAML's parameters", async ({
  page,
  jigHome,
}) => {
  // The fixture's az (first on PATH) answers like Azure DevOps from now on.
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), fakeAz(jigHome));
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${fakeAz(jigHome)}`);

  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  git(dir, "remote", "add", "origin", "https://dev.azure.com/contoso/Shop/_git/shop");
  await writeFile(join(dir, "azure-pipelines.yml"), YAML);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Add the pipeline");
  git(dir, "branch", "develop");
  await hostCall(page, "projects.add", { path: dir });

  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("show pipelines");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("pipelines-view");
  const card = view.getByTestId("pipeline-Shop CI");
  await expect(card).toBeVisible({ timeout: 20000 });
  // Grouped per repository; a retired pipeline isn't listed.
  await expect(view.getByTestId("pipelines-repo-shop")).toContainText("contoso/Shop");
  await expect(view).not.toContainText("(old) Shop");
  // Each pipeline shows it's loading until its newest run comes (az answers slowly here).
  await expect(card.getByTestId("pipeline-loading")).toBeVisible();
  // The newest run: when, branch, why, who, what it changed; its stages without the skipped one.
  await expect(card.getByTestId("pipeline-chip")).toContainText("✓ 12m");
  await expect(card).toContainText("main · manual · Ann Demo · Deploy to: staging");
  await expect(card.getByTestId("pipeline-stages")).toContainText("Build");
  await expect(card.getByTestId("pipeline-stages")).toContainText("Deploy to staging");
  await expect(card.getByTestId("pipeline-stages")).not.toContainText("Deploy to none");

  // The Run form (a modal, so the list doesn't move): branch picker, a picker per parameter, a checkbox for the boolean; nothing runs yet.
  await card.getByTestId("pipeline-run-Shop CI").click();
  const form = page.getByTestId("pipeline-form-Shop CI");
  await expect(form.getByTestId("pipeline-summary")).toContainText("on main with the defaults");
  await form.getByTestId("pipeline-branch").selectOption("develop");
  await form.getByTestId("pipeline-param-deployTo").selectOption("production");
  await form.getByTestId("pipeline-param-runTests").uncheck();
  await expect(form.getByTestId("pipeline-summary")).toContainText(
    "on develop with Deploy to: production · Run tests: false",
  );
  await form.getByTestId("pipeline-queue").click();
  await expect(page.getByTestId("toast")).toContainText("Shop CI queued");
  await expect(form).toHaveCount(0);
  const args = JSON.parse(await readFile(join(jigHome, "az-run.json"), "utf8")) as string[];
  expect(args).toEqual(
    expect.arrayContaining(["--id", "12", "--branch", "develop", "deployTo=production", "runTests=false"]),
  );
  expect(args[args.indexOf("--project") + 1]).toBe("Shop");
});
