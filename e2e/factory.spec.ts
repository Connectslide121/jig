import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, hostCall, launchJig, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";

/** A project ("shop") made active, as Jig factory works on the active project. */
async function shop(page: Page, jigHome: string): Promise<string> {
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });
  return projectId;
}

const factory = (page: Page, method: string, args: Record<string, unknown>) =>
  hostCall(page, "addons.call", { id: "factory", method, args });

test("Jig factory: sample runs on the floor, a run's page and the inbox", async ({ page, jigHome }) => {
  await shop(page, jigHome);

  // Listed in View → Views; empty until the sample runs are loaded.
  await page.getByTestId("tools-group-View").click();
  await page.getByRole("menuitem", { name: "Views" }).hover();
  await page.getByRole("menuitem", { name: "Jig factory" }).click();
  const view = page.getByTestId("factory-view");
  await expect(view).toBeVisible({ timeout: 15000 });
  await view.getByTestId("factory-load-samples").click();
  await expect(view.getByTestId("factory-view-row")).toHaveCount(6);
  // Two gates wait for you: the top bar counts them.
  await expect(page.getByTestId("factory-topbar-count")).toHaveText("2");

  // The Floor: a card per run in its lane, fixed in place once shown.
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-floor").click();
  const floor = page.getByTestId("factory-floor");
  await expect(floor).toBeVisible();
  const cards = floor.locator("[data-testid=factory-card]:visible");
  await expect(cards).toHaveCount(6);
  await expect(floor.getByTestId("factory-lane-review").getByTestId("factory-card")).toHaveCount(2);
  await expect(floor.getByTestId("factory-kpis")).toContainText("Waiting for you");
  const card = floor.locator("[data-testid=factory-card][data-run=fx-sample-3]:visible");
  const before = await card.boundingBox();
  await page.waitForTimeout(500);
  expect(await card.boundingBox()).toEqual(before);

  // The whole card opens the run: its stage graph, outputs and timeline.
  const box = before!;
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  const run = page.getByTestId("factory-run");
  await expect(run).toBeVisible();
  await expect(run.getByTestId("factory-run-title")).toHaveText("Route planner");
  await expect(run.getByTestId("factory-node-G1")).toHaveAttribute("data-status", "waiting");
  await expect(run.getByTestId("factory-node-S1")).toHaveAttribute("data-status", "done");
  await expect(run.getByTestId("factory-output").first()).toBeVisible();
  await expect(run.getByTestId("factory-timeline")).not.toBeEmpty();

  // The inbox: everything waiting for a person, a pill for yours.
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-inbox").click();
  const inbox = page.getByTestId("factory-inbox");
  await expect(inbox.getByTestId("factory-inbox-row")).toHaveCount(5);
  await expect(inbox).toContainText("G1 · Demo review");
  await expect(inbox.getByTestId("factory-inbox-row").filter({ hasText: "Route planner" })).toContainText(
    "you",
  );
});

test("Jig factory: removing the sample runs empties the views", async ({ page, jigHome }) => {
  const projectId = await shop(page, jigHome);
  expect((await factory(page, "loadSamples", { projectId })) as { value: number }).toMatchObject({
    value: 6,
  });
  expect(((await factory(page, "runs", { projectId })) as { value: unknown[] }).value).toHaveLength(6);
  await factory(page, "clearSamples", { projectId });
  expect(((await factory(page, "runs", { projectId })) as { value: unknown[] }).value).toHaveLength(0);
});

interface RunLike {
  id: string;
  state: string;
  slug: string;
  worktree?: string;
  stages: Array<{ id: string; status: string; version?: number; chatId?: string; question?: string }>;
  gates: Array<{ id: string; status: string }>;
  outputs: Array<{ id: string; path: string; status: string }>;
  questions?: Array<{ id: string; stage: string; answer?: string }>;
}

/** A Git repository with one commit, so runs get a worktree on their own branch. */
async function gitShop(page: Page, jigHome: string): Promise<string> {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "t@example.com",
  };
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  // The run's commits need an author, as on a real machine.
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# Shop\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "first"], { cwd: dir, env });
  return shop(page, jigHome);
}

const runOf = async (page: Page, projectId: string, runId: string) =>
  ((await factory(page, "run", { projectId, runId })) as { value: RunLike }).value;

test("Jig factory: a golden brief's run goes through every stage and gate with the fake roles", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const projectId = await gitShop(page, jigHome);
  const started = (await factory(page, "startRun", { projectId, brief: "shift-swap" })) as { value: RunLike };
  const id = started.value.id;
  expect(started.value.worktree).toBeTruthy();
  // Approve every gate as it opens, until the run is done.
  await expect
    .poll(
      async () => {
        const r = await runOf(page, projectId, id);
        for (const g of r.gates.filter((g) => g.status === "waiting"))
          await factory(page, "decide", { projectId, runId: id, gateId: g.id, kind: "approve" });
        return r.state;
      },
      { timeout: 75_000, intervals: [300] },
    )
    .toBe("done");
  const r = await runOf(page, projectId, id);
  // The critic failed v1, so the demo was built twice; every pack stage ran.
  expect(r.stages.find((s) => s.id === "S5")?.version).toBe(2);
  expect(r.outputs.find((o) => o.id === "demo-v1")?.status).toBe("superseded");
  expect(r.stages.filter((s) => s.id.startsWith("S7:")).every((s) => s.status === "done")).toBe(true);
  const folder = join(r.worktree!, "docs", "factory", r.slug);
  expect(await readFile(join(folder, "demo", "v2", "index.html"), "utf8")).toContain(
    "Prototype · sample data",
  );
  expect(await readFile(join(folder, "spec.md"), "utf8")).toMatch(/status: approved/);
  // Each stage's files are committed on the run's branch; the repository's checkout is untouched.
  const branch = execFileSync("git", ["-C", r.worktree!, "branch", "--show-current"]).toString().trim();
  expect(branch).toBe("factory/shift-swap");
  expect(execFileSync("git", ["-C", r.worktree!, "status", "--porcelain"]).toString()).toBe("");
  expect(
    execFileSync("git", ["-C", join(jigHome, "shop"), "branch", "--show-current"])
      .toString()
      .trim(),
  ).toBe("main");
});

test("Jig factory: a stage Jig closed in the middle of carries on after the restart", async ({
  app,
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const projectId = await shop(page, jigHome);
  const brief =
    (await readFile(
      fileURLToPath(new URL("../addons/factory/fixtures/briefs/shift-swap.md", import.meta.url)),
      "utf8",
    )) + "\n[hold scout]\n";
  const started = (await factory(page, "startRun", { projectId, briefText: brief })) as { value: RunLike };
  const id = started.value.id;
  const chatId = started.value.stages.find((s) => s.id === "S2")?.chatId;
  expect(chatId).toBeTruthy();
  await expect
    .poll(
      async () =>
        (
          (await hostCall(page, "addons.call", {
            id: "factory",
            method: "inspect",
            args: { projectId, runId: id },
          })) as { value: Array<{ kind: string }> }
        ).value.length,
      { timeout: 20000 },
    )
    .toBeGreaterThan(1);
  await page.waitForTimeout(1000);
  await app.close();
  const again = await launchJig(jigHome);
  try {
    const page2 = await again.firstWindow();
    await page2.waitForSelector("[data-testid=app-root] [data-testid=main-area]");
    await expect
      .poll(async () => (await runOf(page2, projectId, id)).gates.map((g) => `${g.id}:${g.status}`).join(), {
        timeout: 30000,
        intervals: [500],
      })
      .toBe("G0:waiting");
    const r = await runOf(page2, projectId, id);
    expect(r.stages.find((s) => s.id === "S2")).toMatchObject({ status: "done", chatId });
  } finally {
    await again.close();
  }
});

test("Jig factory: the interview asks two rounds of questions, then writes the brief", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(60_000);
  const projectId = await shop(page, jigHome);
  const started = (await factory(page, "startRun", { projectId, text: "Loyalty points for Shop" })) as {
    value: RunLike;
  };
  const id = started.value.id;
  expect(started.value.state).toBe("interview");
  for (const round of [3, 5]) {
    await expect
      .poll(async () => (await runOf(page, projectId, id)).questions?.length ?? 0, { timeout: 20000 })
      .toBe(round);
    await expect
      .poll(async () => (await runOf(page, projectId, id)).stages[0]?.status, { timeout: 20000 })
      .toBe("needs-you");
    const open = ((await runOf(page, projectId, id)).questions ?? []).filter((q) => !q.answer);
    await factory(page, "answer", {
      projectId,
      runId: id,
      stageId: "S1",
      answers: open.map((q) => ({ id: q.id, answer: "Yes" })),
    });
  }
  await expect
    .poll(async () => (await runOf(page, projectId, id)).stages.find((s) => s.id === "S2")?.status, {
      timeout: 20000,
    })
    .toMatch(/running|done/);
  const r = await runOf(page, projectId, id);
  expect(r.stages[0]?.status).toBe("done");
  expect(r.state).not.toBe("interview");
  expect(r.outputs.map((o) => o.id)).toContain("brief-v1");
});

test("Jig factory at sidebar, panel and tab widths, Dark and Light (JIG_UI_SHOTS=1)", async ({
  page,
  app,
  jigHome,
}) => {
  test.skip(!process.env.JIG_UI_SHOTS, "set JIG_UI_SHOTS=1 to take the design-check screenshots");
  test.setTimeout(240_000);
  const projectId = await shop(page, jigHome);
  await factory(page, "loadSamples", { projectId });
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
    await shootView(page, "addon.factory.factory", `factory-view-${theme}`, {
      ready: (panel) => expect(panel.getByTestId("factory-view-row").first()).toBeVisible(),
    });
    const main = page.getByTestId("main-area");
    const tab = async (item: string, testId: string, name: string) => {
      await page.getByTestId("factory-topbar").click();
      await page.getByTestId(item).click();
      await expect(main.getByTestId(testId)).toBeVisible();
      await page.waitForTimeout(400);
      await main.screenshot({
        path: join(SHOTS_DIR, `factory-${name}-${theme}.png`),
        animations: "disabled",
      });
    };
    for (const [width, label] of [
      [1600, "wide"],
      [820, "narrow"],
    ] as const) {
      await size(width, 900);
      await tab("factory-menu-floor", "factory-floor", `floor-${label}`);
      await main.locator("[data-testid=factory-card][data-run=fx-sample-5]:visible").click();
      await expect(main.getByTestId("factory-run")).toBeVisible();
      await page.waitForTimeout(800);
      await main.screenshot({
        path: join(SHOTS_DIR, `factory-run-${label}-${theme}.png`),
        animations: "disabled",
      });
      if (label === "wide") {
        // The run's modals: a stage's sheet and a gate's sheet.
        for (const node of ["S2", "G1"]) {
          await main.getByTestId(`factory-node-${node}`).click();
          const sheet = page.getByRole("dialog");
          await expect(sheet).toBeVisible();
          await page.waitForTimeout(1500);
          await page.screenshot({ path: join(SHOTS_DIR, `factory-sheet-${node}-${theme}.png`) });
          await sheet.getByRole("button", { name: "Close" }).first().click();
          await expect(sheet).toBeHidden();
        }
      }
      await tab("factory-menu-inbox", "factory-inbox", `inbox-${label}`);
    }
  }
});

test("Jig factory: a stage that asks waits for your reply, then carries on", async ({ page, jigHome }) => {
  test.setTimeout(60_000);
  const projectId = await shop(page, jigHome);
  const brief =
    (await readFile(
      fileURLToPath(new URL("../addons/factory/fixtures/briefs/shift-swap.md", import.meta.url)),
      "utf8",
    )) + "\n[ask scout]\n";
  const started = (await factory(page, "startRun", { projectId, briefText: brief })) as { value: RunLike };
  const id = started.value.id;
  const stage = async () => (await runOf(page, projectId, id)).stages.find((s) => s.id === "S2");
  await expect.poll(async () => (await stage())?.status, { timeout: 20000 }).toBe("needs-you");
  expect(await stage()).toMatchObject({ question: "Which shift types should scout cover?" });
  await factory(page, "answer", { projectId, runId: id, stageId: "S2", reply: "Day and night" });
  await expect.poll(async () => (await stage())?.status, { timeout: 20000 }).toBe("done");
  expect((await stage())?.question).toBeUndefined();
});

test("Jig factory: start from a brief, answer a stage, approve a gate and inspect, all by clicking", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(60_000);
  const projectId = await shop(page, jigHome);
  const brief =
    (await readFile(
      fileURLToPath(new URL("../addons/factory/fixtures/briefs/shift-swap.md", import.meta.url)),
      "utf8",
    )) + "\n[ask scout]\n";

  // Start from the top bar: a modal with a pasted brief; the run's page opens.
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-start").click();
  const start = page.getByTestId("factory-start");
  await expect(start).toBeVisible();
  await start.getByTestId("factory-start-text").fill(brief);
  await start.getByTestId("factory-start-go").click();
  const run = page.getByTestId("factory-run");
  await expect(run.getByTestId("factory-run-title")).toHaveText("Shift swap");

  // The scout asks: its node waits for you; its sheet takes the answer.
  const scout = run.getByTestId("factory-node-S2");
  await expect(scout).toHaveAttribute("data-status", "needs-you", { timeout: 20000 });
  await scout.click();
  const sheet = page.getByTestId("factory-stage-sheet");
  await expect(sheet.getByTestId("factory-stage-question")).toHaveText(
    "Which shift types should scout cover?",
  );
  await sheet.getByTestId("factory-stage-reply").fill("Day and night");
  await sheet.getByTestId("factory-stage-send").click();
  await expect(scout).toHaveAttribute("data-status", "done", { timeout: 20000 });
  await expect(sheet.getByTestId("factory-stage-report")).not.toBeEmpty();
  await sheet.getByRole("button", { name: "Close" }).first().click();
  await expect(sheet).toBeHidden();

  // G0 waits for you: approve it from its sheet; the run goes on.
  const g0 = run.getByTestId("factory-node-G0");
  await expect(g0).toHaveAttribute("data-status", "waiting", { timeout: 20000 });
  await g0.click();
  const gate = page.getByTestId("factory-gate-sheet");
  await expect(gate.getByTestId("factory-sheet-output").first()).toBeVisible();
  await gate.getByTestId("factory-gate-approve").click();
  await expect(gate).toBeHidden();
  await expect(g0).toHaveAttribute("data-status", "done", { timeout: 10000 });

  // The Inspector lists the prompts sent and the decisions.
  await run.getByTestId("factory-run-more").click();
  await page.getByTestId("factory-run-inspector").click();
  const inspector = page.getByTestId("factory-inspector");
  await expect(inspector.getByTestId("factory-inspector-log")).toContainText("Go / no-go: approve");
  await inspector.getByRole("button", { name: "Close" }).click();
  await expect(inspector).toBeHidden();

  // Stop the run from ⋯, after confirming.
  await run.getByTestId("factory-run-more").click();
  await page.getByTestId("factory-run-stop").click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect
    .poll(async () => ((await factory(page, "runs", { projectId })) as { value: RunLike[] }).value[0]?.state)
    .toBe("stopped");
});
