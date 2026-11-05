import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

/** Activity on three earlier days: the same two commands every morning. */
async function seed(jigHome: string) {
  const dir = join(jigHome, "activity");
  await mkdir(dir, { recursive: true });
  const now = new Date();
  for (const back of [1, 2, 3]) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.jsonl`;
    const t = (min: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, min).toISOString();
    const lines = [
      { at: t(0), kind: "terminal.command", text: "git pull", projectId: "p" },
      { at: t(1), kind: "terminal.command", text: "npm run dev", projectId: "p" },
      { at: t(30), kind: "terminal.command", text: "git pull", projectId: "p" },
      { at: t(31), kind: "terminal.command", text: "npm run dev", projectId: "p" },
    ];
    await writeFile(join(dir, name), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  }
}

test("Look for patterns now turns repeated activity into a suggestion; Build it starts a build", async ({
  page,
  jigHome,
}) => {
  await seed(jigHome);
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("look-for-patterns").click();
  await expect(page.getByTestId("suggestion")).toContainText("git pull → npm run dev", { timeout: 15000 });
  await expect(page.getByTestId("suggestions-badge")).toContainText("1");
  await page.getByRole("button", { name: "Evidence" }).click();
  await expect(page.getByTestId("suggestion")).toContainText("times on 3 day(s)");
  await page.getByTestId("suggestion-build").click();
  await expect(page.getByTestId("suggestion")).toContainText("Show the build");
  // The build's preview view may take the sidebar meanwhile (at any moment): come back and press
  // it as a DOM click, which doesn't wait for the sidebar to settle.
  await expect(async () => {
    await page.getByTestId("suggestions-badge").click();
    await page
      .getByRole("button", { name: "Show the build" })
      .dispatchEvent("click", undefined, { timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 20000 });
});

test("a risky practice becomes a suggestion that opens a chat to fix it", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await mkdir(join(jigHome, "activity"), { recursive: true });
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.jsonl`;
  const line = {
    at: d.toISOString(),
    kind: "prompt",
    text: "call the API with key «secret»",
    projectId: "p",
  };
  await writeFile(join(jigHome, "activity", name), `${JSON.stringify(line)}\n`);
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("look-for-patterns").click();
  const card = page.getByTestId("suggestion").filter({ hasText: "Keep keys out of your messages" });
  await expect(card).toContainText("better practice", { timeout: 15000 });
  await expect(card.getByTestId("suggestion-build")).toHaveText("Fix it with Claude");
  await card.getByTestId("suggestion-build").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(/Help me change this practice/, {
    timeout: 15000,
  });
});

test("asking piece by piece becomes a prompting tip comparing your prompt with a better one", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await mkdir(join(jigHome, "activity"), { recursive: true });
  const asks = [
    "write a function that validates orders",
    "now write an endpoint for it",
    "ok now add a service that calls it",
    "then create the tests",
  ];
  for (const back of [1, 2]) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.jsonl`;
    const lines = asks.map((text, i) =>
      JSON.stringify({
        at: new Date(d.getTime() + i * 60_000).toISOString(),
        kind: "prompt",
        text,
        projectId: "p",
        detail: { chat: `chat${back}` },
      }),
    );
    await writeFile(join(jigHome, "activity", name), `${lines.join("\n")}\n`);
  }
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("look-for-patterns").click();
  const card = page.getByTestId("suggestion").filter({ hasText: "Ask for the whole feature in one go" });
  await expect(card).toContainText("prompting tip", { timeout: 15000 });
  await expect(card.getByTestId("suggestion-build")).toHaveText("Compare prompts");
  await card.getByTestId("suggestion-build").click();
  const compare = page.getByTestId("prompt-compare");
  await expect(compare.getByTestId("prompt-before")).toContainText("now write an endpoint for it");
  await expect(compare.getByTestId("prompt-after")).toContainText("Add order validation to the Shop API");
  await expect(compare).toContainText("Why yours fell short");
  await expect(compare.getByTestId("prompt-changes")).toContainText("Claude checks its own work");
  await compare.getByTestId("prompt-try").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(/Add order validation to the Shop API/, {
    timeout: 15000,
  });
});

test("Not now hides a suggestion, and the same pattern isn't suggested again", async ({ page, jigHome }) => {
  await seed(jigHome);
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("look-for-patterns").click();
  await expect(page.getByTestId("suggestion")).toHaveCount(1, { timeout: 15000 });
  await page.getByTestId("suggestion-snooze").click();
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
  // The next run doesn't suggest the snoozed pattern again (it may find another one).
  await page.getByTestId("look-for-patterns").click();
  await expect(page.getByTestId("look-for-patterns")).toBeEnabled();
  await expect(page.getByTestId("suggestion").filter({ hasText: "git pull → npm run dev" })).toHaveCount(0);
  const saved = JSON.parse(await readFile(join(jigHome, "suggestions.json"), "utf8"));
  expect(saved.suggestions[0].status).toBe("snoozed");
});

test("activity is recorded locally and can be deleted", async ({ page, jigHome }) => {
  const dir = join(jigHome, "proj");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+`");
  // Typed at the shell's prompt: a command counts once the shell echoes it, so not before it started.
  await expect(page.locator(".jig-xterm:visible .xterm-rows")).toContainText(/[>$#%]/, { timeout: 15000 });
  await page.locator(".jig-xterm:visible").click();
  await page.keyboard.type("echo recorded-command\r");
  await expect
    .poll(async () => {
      const files = await readdir(join(jigHome, "activity")).catch(() => []);
      const texts = await Promise.all(files.map((f) => readFile(join(jigHome, "activity", f), "utf8")));
      return texts.join("");
    })
    .toContain("echo recorded-command");
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-learning").click();
  await page.getByTestId("delete-activity").click();
  await page.getByTestId("dialog-confirm").click();
  await expect.poll(async () => (await readdir(join(jigHome, "activity"))).length).toBe(0);
});

test("Claude notes manual work from a chat; it becomes a workflow suggestion and a profile addition", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("I deploy the webshop by hand on the VM every Friday");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("change-card").first();
  await expect(card).toContainText("Noted for suggestions", { timeout: 15000 });
  await expect(card).toContainText("publish, then upload to the VM");
  await expect(card.getByTestId("change-undo")).toHaveText("Remove");

  // The weekly reflection gets the note: a workflow, and something to add to the profile.
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("look-for-patterns").click();
  const workflow = page.getByTestId("suggestion").filter({ hasText: "A workflow for deploying" });
  await expect(workflow).toContainText("Upload to the VM", { timeout: 15000 });
  await workflow.getByText("Evidence").click();
  await expect(workflow.getByTestId("suggestion-note")).toContainText("upload to the VM");
  // Draft a workflow: the Workflows editor opens with the steps.
  await workflow.getByTestId("suggestion-build").click();
  await expect(page.getByTestId("workflow-editor").getByTestId("workflow-name")).toHaveValue(
    "A workflow for deploying the webshop",
  );
  await expect(page.getByTestId("workflow-edit-step")).toHaveCount(3);
  await page.getByTestId("workflow-save").click();
  await expect(page.getByTestId("workflow-steps")).toContainText("Upload to the VM");
  await page.getByTestId("suggestions-badge").click();
  const profile = page.getByTestId("suggestion").filter({ hasText: "Add to what Jig knows about you" });
  await profile.getByTestId("suggestion-build").click();
  await expect(profile.getByTestId("suggestion-build")).toHaveCount(0);
  expect(await readFile(join(jigHome, "profile.md"), "utf8")).toContain(
    "- Deploys the webshop to a VM by hand",
  );

  // What Jig knows about me: the profile and the note, which can be deleted.
  await page.getByTestId("open-knowledge").click();
  await expect(page.getByTestId("knowledge-tab")).toContainText("Deploys the webshop to a VM by hand");
  await expect(page.getByTestId("knowledge-note")).toContainText("upload to the VM");
  await page.getByTestId("knowledge-note-delete").click();
  await expect(page.getByTestId("knowledge-note")).toHaveCount(0);
});

test("the weekly check-in starts a chat that adds to the profile, with Undo", async ({ page, jigHome }) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await hostCall(page, "config.update", { learning: { checkIn: "weekly" } });
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("checkin-start").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(/Weekly check-in \(Jig\)/, { timeout: 15000 });
  await page.keyboard.press("Enter");
  const card = page.getByTestId("change-card").first();
  await expect(card).toContainText("Added to what Jig knows about you", { timeout: 15000 });
  expect(await readFile(join(jigHome, "profile.md"), "utf8")).toContain(
    "## How I release and deploy\n\n- Publishes the webshop",
  );
  await card.getByTestId("change-undo").click();
  await expect(card).toContainText("Undone");
  expect(await readFile(join(jigHome, "profile.md"), "utf8")).not.toContain("Publishes the webshop");
  await expect(page.getByTestId("checkin-card")).toHaveCount(0);
});

test("an empty profile offers a chat where Claude interviews you and fills it in", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("open-knowledge").click();
  await expect(page.getByTestId("knowledge-tab")).toContainText("Not written yet");
  await page.getByTestId("profile-interview").click();
  await expect(page.getByTestId("composer-input")).toHaveValue(/Profile interview \(Jig\)/, {
    timeout: 15000,
  });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("change-card").first()).toContainText("Added to what Jig knows about you", {
    timeout: 15000,
  });
  expect(await readFile(join(jigHome, "profile.md"), "utf8")).toContain("Publishes the webshop");
});

test("Suggestions has a centered readable width in a wide main panel", async ({ page, app, jigHome }) => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith("jig-app:"))!
      .setContentSize(2000, 1000);
  });
  await page.getByTestId("suggestions-badge").click();
  const view = page.getByTestId("suggestions-view");
  await expect(view).toBeVisible();
  const bounds = (await view.boundingBox())!;
  const main = (await page.getByTestId("main-area").boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(768);
  expect(bounds.x + bounds.width / 2).toBeCloseTo(main.x + main.width / 2, 0);
  if (process.env.JIG_SCREENSHOTS) {
    await seed(jigHome);
    await page.getByTestId("look-for-patterns").click();
    await expect(page.getByTestId("suggestion")).toContainText("git pull → npm run dev", { timeout: 15000 });
    await page.screenshot({
      path: "apps/desktop/src/renderer/features/about/shots/suggestions.jpg",
      type: "jpeg",
      quality: 90,
    });
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith("jig-app:"))!
      .setContentSize(800, 700);
  });
  await expect.poll(() => view.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
