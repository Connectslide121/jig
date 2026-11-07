import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, hostCall, launchJig, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";
import { fakeTelegram, TOKEN } from "./telegram";

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

test("Jig factory: the pack in the inbox: two forms side by side, a PDF, approve and reject per output (D-467)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const projectId = await gitShop(page, jigHome);
  const started = (await factory(page, "startRun", {
    projectId,
    brief: "shift-swap",
    outputs: ["stories", "deck", "deck-images"],
  })) as { value: RunLike };
  const id = started.value.id;
  // Approve the gates up to the demo; the pack's gates wait for the inbox.
  await expect
    .poll(
      async () => {
        const r = await runOf(page, projectId, id);
        for (const g of r.gates.filter((g) => g.status === "waiting" && ["G0", "GD", "G1"].includes(g.id)))
          await factory(page, "decide", { projectId, runId: id, gateId: g.id, kind: "approve" });
        return r.gates
          .filter((g) => g.status === "waiting")
          .map((g) => g.id)
          .sort()
          .join(",");
      },
      { timeout: 75_000, intervals: [300] },
    )
    .toBe("G2,G4");

  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-inbox").click();
  const inbox = page.getByTestId("factory-inbox");
  await inbox.getByTestId("factory-inbox-row").filter({ hasText: "Deck v1" }).click();
  const review = page.getByTestId("factory-output-review");
  const columns = review.getByTestId("factory-review-column");
  await expect(columns).toHaveCount(2);
  // The deck's page was printed to PDF with it; the image form sits beside it.
  await expect(
    columns.nth(0).getByTestId("factory-review-file").filter({ hasText: "deck.pdf" }),
  ).toBeVisible();
  await expect(columns.nth(1)).toContainText("Deck images v1");
  if (process.env.JIG_UI_SHOTS) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(SHOTS_DIR, "factory-pack-review.png") });
  }
  await columns.nth(0).getByTestId("factory-review-approve").click();
  await expect(columns.nth(0)).toContainText("Approved");
  await columns.nth(1).getByTestId("factory-review-reject").click();
  await page.getByTestId("factory-reject-note").fill("Too much text on the slides");
  await page.getByTestId("factory-reject-confirm").click();
  await expect(columns.nth(1)).toContainText("Rejected");
  // Nothing of G4 waits and the deck was approved: G4 is approved by itself.
  await expect
    .poll(async () => (await runOf(page, projectId, id)).gates.find((g) => g.id === "G4")?.status)
    .toBe("approved");
  const r = await runOf(page, projectId, id);
  expect(r.outputs.find((o) => o.path.endsWith("deck.pdf"))?.status).toBe("approved");
  await review.getByRole("button", { name: "Close", exact: true }).last().click();

  // Stories go to a board only when you ask; without a followed board, it says so.
  await inbox.getByTestId("factory-inbox-row").filter({ hasText: "User stories v1" }).click();
  await review.getByTestId("factory-review-cards").click();
  await expect(page.getByTestId("factory-cards-dialog")).toContainText("Follow the product's board");
  await page.getByTestId("factory-cards-dialog").getByRole("button", { name: "Cancel" }).click();
  await review.getByTestId("factory-review-approve").click();
  await expect
    .poll(async () => (await runOf(page, projectId, id)).gates.find((g) => g.id === "G2")?.status)
    .toBe("approved");
  await review.getByRole("button", { name: "Close", exact: true }).last().click();
  // Trust per output kind, from what was reviewed.
  const trust = inbox.getByTestId("factory-trust-row");
  if (process.env.JIG_UI_SHOTS) {
    await page.screenshot({ path: join(SHOTS_DIR, "factory-trust.png") });
  }
  await expect(trust.filter({ hasText: "Deck images" })).toContainText("0%");
  await expect(trust.filter({ hasText: "User stories" })).toContainText("100%");
});

test("Jig factory: pick a direction at GD, then review the demo in its frames, pin a change and approve (D-462)", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const projectId = await shop(page, jigHome);
  const started = (await factory(page, "startRun", { projectId, brief: "shift-swap" })) as { value: RunLike };
  const id = started.value.id;
  const waitGate = (gate: string) =>
    expect
      .poll(
        async () => {
          const r = await runOf(page, projectId, id);
          if (r.gates.find((g) => g.id === "G0")?.status === "waiting")
            await factory(page, "decide", { projectId, runId: id, gateId: "G0", kind: "approve" });
          return r.gates.find((g) => g.id === gate)?.status;
        },
        { timeout: 30_000, intervals: [300] },
      )
      .toBe("waiting");

  // GD: the three direction boards; the whole card picks one.
  await waitGate("GD");
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-floor").click();
  await page.locator(`[data-testid=factory-card][data-run="${id}"]:visible`).click();
  const run = page.getByTestId("factory-run");
  await run.getByTestId("factory-node-GD").click();
  const sheet = page.getByTestId("factory-gate-sheet");
  const cards = sheet.getByTestId("factory-direction");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1).locator("img")).toHaveAttribute("src", /^jig-file:/);
  if (process.env.JIG_UI_SHOTS) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS_DIR, "factory-gd.png") });
  }
  await cards.filter({ hasText: "Bold" }).click();
  await expect(sheet).toBeHidden();
  expect(((await runOf(page, projectId, id)) as RunLike & { direction?: string }).direction).toBe("2-bold");

  // G1: Review demo shows v1 and v2 (the critic failed v1), three frames and v2's scorecard.
  await waitGate("G1");
  await run.getByTestId("factory-run-review").click();
  const review = page.getByTestId("factory-review");
  await expect(review.getByTestId("factory-review-versions").getByRole("button")).toHaveCount(2);
  await expect(review.getByTestId("factory-review-score")).toContainText("4.3");
  await expect(review.getByTestId("factory-review-scorecard")).toContainText("Hierarchy", {
    ignoreCase: true,
  });
  await expect(review.getByTestId("factory-frame-desktop").locator("iframe")).toHaveAttribute(
    "src",
    /^jig-file:/,
  );
  await review.getByRole("button", { name: "v1" }).click();
  await expect(review.getByTestId("factory-review-scorecard")).toContainText("offer button");

  // A pin on the desktop frame, then Ask for changes sends it: S5 builds v3.
  await review.getByTestId("factory-review-pin").click();
  await review.getByTestId("factory-frame-desktop-overlay").click({ position: { x: 40, y: 30 } });
  await page.getByRole("dialog").getByRole("textbox").fill("Bigger title");
  await page.getByRole("dialog").getByRole("button", { name: "Add pin" }).click();
  await expect(review.getByTestId("factory-pins")).toContainText("Bigger title");
  if (process.env.JIG_UI_SHOTS) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS_DIR, "factory-review-wide.png") });
    await page.setViewportSize({ width: 900, height: 800 }).catch(() => undefined);
  }
  await review.getByTestId("factory-review-changes").click();
  const ask = page.getByTestId("factory-review-ask");
  await expect(ask.getByTestId("factory-pins")).toContainText("Bigger title");
  await ask.getByTestId("factory-review-send").click();
  await expect(ask).toBeHidden();
  await expect
    .poll(async () => (await runOf(page, projectId, id)).stages.find((s) => s.id === "S5")?.version, {
      timeout: 20000,
    })
    .toBe(3);
  await waitGate("G1");
  await expect(review.getByTestId("factory-review-versions").getByRole("button")).toHaveCount(3);
  // ⋯ → Show in Pages keeps the version picked (v3) as a page.
  await review.getByRole("button", { name: "v3" }).click();
  console.log(
    "DBG",
    JSON.stringify(await factory(page, "showInPages", { projectId, runId: id, version: 3 })),
  );
  await review.getByTestId("factory-review-open").click();
  await page.getByTestId("factory-review-pages").click();
  await expect(page.getByText("Demo v3 is in Pages")).toBeVisible({ timeout: 10000 });
  expect(((await runOf(page, projectId, id)) as RunLike & { demoPage?: string }).demoPage).toMatch(/^p_/);
  await review.getByTestId("factory-review-approve").click();
  await expect
    .poll(async () => (await runOf(page, projectId, id)).gates.find((g) => g.id === "G1")?.status)
    .toBe("approved");
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

test("Jig factory: Start Jig factory from a chat reply's menu and from a meeting (D-460)", async ({
  jigHome,
}) => {
  test.setTimeout(90_000);
  await mkdir(join(jigHome, "addon-data"), { recursive: true });
  await writeFile(
    join(jigHome, "addon-data", "meetings.json"),
    JSON.stringify({
      records: [
        {
          id: "1a2b3c4d-0000-4000-8000-0000000000f1",
          title: "Shop planning",
          joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
          startedAt: "2026-01-05T09:00:00.000Z",
          endedAt: "2026-01-05T09:45:00.000Z",
          status: "ended",
          capture: "Captions",
          captions: [],
          gaps: [],
          notes: "**Summary** Staff want to swap shifts from their phones.",
          actions: [],
        },
      ],
    }),
  );
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await shop(page, jigHome);

    // A chat reply's ⋯ → Start Jig factory from this: New idea opens with the reply's text.
    await page.keyboard.press("Control+N");
    await page.getByTestId("composer-input").fill("Gift cards for Shop");
    await page.keyboard.press("Enter");
    const reply = page.getByTestId("assistant-message").last();
    await expect(reply).toContainText("You said: Gift cards for Shop", { timeout: 20000 });
    await reply.hover();
    await reply.getByRole("button", { name: "Message options" }).click();
    await page.getByRole("menuitem", { name: "Start Jig factory from this" }).click();
    const dialog = page.getByTestId("factory-new-idea");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("factory-idea-text")).toHaveValue(/Gift cards for Shop/);
    // The picker lists the meetings in your history.
    await expect(dialog.getByTestId("factory-idea-meeting").locator("option")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // A meeting's ⋯ → Start Jig factory…: the workbench's New idea opens with the meeting's notes.
    await hostCall(page, "meetings.open", { tab: "meetings" });
    const find = () => app.windows().find((w) => w.url().includes("meetingLobby=1"));
    await expect.poll(() => Boolean(find()), { timeout: 30_000 }).toBe(true);
    const lobby = find()!;
    await lobby.getByTestId("meeting-more").click();
    await lobby.getByTestId("meeting-factory").click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("factory-idea-text")).toHaveValue(/swap shifts from their phones/);
  } finally {
    await app.close();
  }
});

test("Jig factory: a new idea, its interview with Good enough, and the Plan step", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(90_000);
  const projectId = await shop(page, jigHome);

  // New idea from the top bar: the idea, a new product; Start interview opens the Interview tab.
  await page.getByTestId("factory-topbar").click();
  await page.getByTestId("factory-menu-new-idea").click();
  const dialog = page.getByTestId("factory-new-idea");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("factory-idea-text").fill("Shift swap for Shop's staff");
  await dialog.getByTestId("factory-idea-product").selectOption("new");
  await dialog.getByTestId("factory-idea-start").click();
  const tab = page.getByTestId("factory-interview");
  await expect(tab).toBeVisible();

  // Round 1's three cards, prefilled with their suggestions; answering them all half-writes the brief.
  const cards = tab.getByTestId("factory-question");
  await expect(cards).toHaveCount(3, { timeout: 20000 });
  await expect(cards.first().getByTestId("factory-question-answer")).toHaveValue("Staff on their phones");
  const first = await cards.first().boundingBox();
  await expect(tab.getByTestId("factory-answer")).toHaveText("Answer all suggested");
  await cards.nth(1).getByTestId("factory-question-answer").fill("Nobody has to phone around");
  await expect(tab.getByTestId("factory-answer")).toHaveText("Send answers");
  await tab.getByTestId("factory-answer").click();
  await expect(cards).toHaveCount(2, { timeout: 20000 });
  // A new round replaces the cards in place.
  expect((await cards.first().boundingBox())?.y).toBe(first?.y);
  await expect(tab.getByTestId("factory-rounds")).toHaveText("Round 1 answered · 3 questions");
  await expect(tab.getByTestId("factory-coverage")).toContainText("4/9");

  // Good enough: the brief is written from what there is, its gaps listed.
  await tab.getByTestId("factory-enough").click();
  await expect(tab.getByTestId("factory-coverage")).toContainText("8/9", { timeout: 20000 });
  await expect(tab.getByTestId("factory-brief-gaps")).toContainText("What is out of scope");
  await expect(tab.getByTestId("factory-brief-languages")).toContainText("Sales Swedish");

  // The scout runs, G0 waits: Looks right approves it and opens the Plan step.
  await expect(tab.getByTestId("factory-looks-right")).toBeEnabled({ timeout: 20000 });
  await tab.getByTestId("factory-looks-right").click();
  const plan = page.getByTestId("factory-plan");
  await expect(plan).toBeVisible();
  await expect(plan.getByTestId("factory-plan-lang-sales")).toHaveValue("sv");
  await expect(plan.getByTestId("factory-plan-product")).toHaveValue("new");
  if (process.env.JIG_UI_SHOTS) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS_DIR, "factory-plan.png") });
  }
  await plan.getByTestId("factory-plan-output-stories").uncheck();
  await plan.getByTestId("factory-plan-level").selectOption("L2");
  await plan.getByTestId("factory-plan-start").click();

  // The run goes on from the plan: a new product starts with its three directions.
  await expect(page.getByTestId("factory-run")).toBeVisible();
  const runs = (await factory(page, "runs", { projectId })) as { value: RunLike[] };
  const id = runs.value[0]!.id;
  await expect
    .poll(async () => (await runOf(page, projectId, id)).stages.find((s) => s.id === "S4b")?.status, {
      timeout: 20000,
    })
    .toMatch(/running|done/);
  const r = (await runOf(page, projectId, id)) as RunLike & {
    level?: string;
    languages: Record<string, string>;
    plan?: { outputs: string[] };
  };
  expect(r.level).toBe("L2");
  expect(r.languages.sales).toBe("sv");
  expect(r.plan?.outputs).not.toContain("stories");
  expect(r.stages.find((s) => s.id === "S3")?.status).toBe("done");
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
      // A run in its interview opens its Interview tab.
      await tab("factory-menu-floor", "factory-floor", `floor-${label}`);
      await main.locator("[data-testid=factory-card][data-run=fx-sample-1]:visible").click();
      await expect(main.getByTestId("factory-interview")).toBeVisible();
      await expect(main.getByTestId("factory-question")).toHaveCount(3);
      await page.waitForTimeout(600);
      await main.screenshot({
        path: join(SHOTS_DIR, `factory-interview-${label}-${theme}.png`),
        animations: "disabled",
      });
    }
    await size(1600, 900);
    await page.getByTestId("factory-topbar").click();
    await page.getByTestId("factory-menu-new-idea").click();
    await expect(page.getByTestId("factory-new-idea")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS_DIR, `factory-new-idea-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("factory-new-idea")).toBeHidden();
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

test("Jig factory: approve a gate and ask for changes from the phone (D-468)", async ({ jigHome }) => {
  test.setTimeout(90_000);
  const telegram = await fakeTelegram();
  const app = await launchJig(jigHome, { JIG_TELEGRAM_API: telegram.url });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const connected = (await hostCall(page, "phone.connect", { token: TOKEN })) as {
      value: { code: string };
    };
    telegram.write(connected.value.code);
    await expect
      .poll(
        async () => ((await hostCall(page, "phone.state")) as { value: { status: string } }).value.status,
        {
          timeout: 15_000,
        },
      )
      .toBe("connected");
    const projectId = await gitShop(page, jigHome);
    const id = ((await factory(page, "startRun", { projectId, brief: "shift-swap" })) as { value: RunLike })
      .value.id;
    const card = (text: string) => telegram.sent.find((m) => String(m.text).includes(text));
    const button = (text: string, i: number) =>
      (
        card(text)?.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> } | undefined
      )?.inline_keyboard.flat()[i]?.callback_data ?? "";

    // The go / no-go waits: its card has Approve, Ask for changes and Open; Approve approves it.
    await expect
      .poll(() => telegram.texts().join("\n"), { timeout: 30_000 })
      .toContain("Go / no-go waits for you");
    telegram.tap(button("Go / no-go waits", 0));
    await expect
      .poll(async () => (await runOf(page, projectId, id)).gates.find((g) => g.id === "G0")?.status, {
        timeout: 15_000,
      })
      .toBe("approved");
    await expect.poll(() => telegram.edits.map((e) => String(e.text)).join("\n")).toContain("✅ Approved");

    // A direction is picked in Jig; then the demo's card (with its screenshot) asks for changes.
    await expect.poll(() => telegram.texts().join("\n"), { timeout: 30_000 }).toContain("Pick a direction");
    await factory(page, "decide", {
      projectId,
      runId: id,
      gateId: "GD",
      kind: "approve",
      direction: "2-bold",
    });
    await expect.poll(() => telegram.texts().join("\n"), { timeout: 45_000 }).toContain("is ready");
    expect(card("is ready")?.photo).toBe(true);
    telegram.tap(button("is ready", 1));
    await expect.poll(() => telegram.texts().join("\n"), { timeout: 15_000 }).toContain("write your answer");
    telegram.write("Make the offer button bigger");
    await expect
      .poll(async () => (await runOf(page, projectId, id)).stages.find((s) => s.id === "S5")?.version, {
        timeout: 15_000,
      })
      .toBe(3);
    await expect
      .poll(() => telegram.edits.map((e) => String(e.text)).join("\n"))
      .toContain("Changes asked: Make the offer button bigger");
  } finally {
    await app.close();
    await telegram.close();
  }
});
