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
  await page.getByText("Evidence").click();
  await expect(page.getByTestId("suggestion")).toContainText("times on 3 day(s)");
  await page.getByTestId("suggestion-build").click();
  await expect(page.getByTestId("suggestion")).toContainText("Show the build");
  await page.getByRole("button", { name: "Show the build" }).click();
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 20000 });
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
