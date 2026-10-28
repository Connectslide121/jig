/**
 * Regenerates the screenshots of the "What Jig can do" page (renderer/features/about/shots/*.jpg) from
 * the real app with the fake engine and a demo workspace. Skipped unless JIG_SCREENSHOTS=1:
 *   JIG_SCREENSHOTS=1 npm run e2e -- e2e/screenshots.spec.ts
 * With JIG_SCREENSHOT_ICONS=<folder of the Material Icon Theme extension>, file icons look like VS Code's.
 */
import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { expect, hostCall, launchJig, test } from "./fixtures";

const OUT = fileURLToPath(new URL("../apps/desktop/src/renderer/features/about/shots/", import.meta.url));
const ICON = fileURLToPath(new URL("../apps/desktop/build/icon.png", import.meta.url));

test.skip(!process.env.JIG_SCREENSHOTS, "set JIG_SCREENSHOTS=1 to regenerate the About page screenshots");
test.setTimeout(240_000);

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd });

async function repo(dir: string, files: Record<string, string>) {
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Jon Mendizabal");
  git(dir, "config", "user.email", "jon@example.com");
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, ".."), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Initial commit");
}

test("screenshots for the About page", async () => {
  // A short, stable path: it shows on the dashboard.
  const root = join(tmpdir(), "jig-demo");
  await rm(root, { recursive: true, force: true });
  const home = join(root, "home");
  if (process.env.JIG_SCREENSHOT_ICONS) {
    await mkdir(join(home, ".vscode", "extensions"), { recursive: true });
    await cp(
      process.env.JIG_SCREENSHOT_ICONS,
      join(home, ".vscode", "extensions", "pkief.material-icon-theme-5.40.0"),
      {
        recursive: true,
      },
    );
    await mkdir(join(home, ".config", "Code", "User"), { recursive: true });
    await writeFile(
      join(home, ".config", "Code", "User", "settings.json"),
      '{"workbench.iconTheme":"material-icon-theme"}',
    );
  }
  const ws = join(root, "repos");
  await repo(join(ws, "webshop"), {
    "package.json": JSON.stringify({
      scripts: {
        dev: "node -e \"console.log('Local: http://localhost:5173'); setInterval(()=>{},1000)\"",
        test: "vitest",
      },
    }),
    "src/cart.ts":
      "export function total(items: number[]) {\n  let sum = 0;\n  for (const i of items) sum += i;\n  return sum;\n}\n",
  });
  await repo(join(ws, "orders-api"), {
    "Program.cs": "class Program {}\n",
    "Orders.csproj": "<Project />\n",
  });
  await repo(join(ws, "client-a", "portal"), { "README.md": "# Portal\n" });
  await repo(join(ws, "client-a", "functions"), { "host.json": "{}\n" });
  await writeFile(
    join(ws, "webshop", "src", "cart.ts"),
    "export function total(items: number[], discount = 0) {\n  const sum = items.reduce((a, b) => a + b, 0);\n  return sum * (1 - discount);\n}\n",
  );
  await writeFile(join(ws, "webshop", "src", "checkout.ts"), "export const steps = ['cart', 'pay'];\n");
  await copyFile(ICON, join(ws, "webshop", "logo.png"));
  git(join(ws, "orders-api"), "rm", "-q", "--cached", "Orders.csproj");

  // A few mornings of the same two commands, for the suggestions.
  const activity = join(root, "jig", "activity");
  await mkdir(activity, { recursive: true });
  for (const back of [1, 2, 3, 4]) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const at = (m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, m).toISOString();
    const lines = [0, 30].flatMap((m) => [
      { at: at(m), kind: "terminal.command", text: "git pull", projectId: "p" },
      { at: at(m + 1), kind: "terminal.command", text: "npm run dev", projectId: "p" },
    ]);
    await writeFile(
      join(activity, `${d.toISOString().slice(0, 10)}.jsonl`),
      `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`,
    );
  }

  const app = await launchJig(join(root, "jig"), {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    JIG_FAKE_DELAY: "5",
  });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-testid=app-root]");
  await hostCall(page, "projects.add", { path: ws });
  const key = async (k: string) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(k);
  };
  const shot = async (name: string) => {
    await page.waitForTimeout(400);
    for (let i = 0; i < 6 && (await page.getByTestId("toast").count()) > 0; i++)
      await page
        .getByTestId("toast")
        .first()
        .locator("button")
        .last()
        .click()
        .catch(() => {});
    await page.mouse.move(640, 450);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
  };

  // Dashboard with a running script.
  await page.getByTestId("project-repos").dblclick();
  await expect(page.getByTestId("script-run-dev")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("script-run-dev").click();
  await page.waitForTimeout(1200);
  await shot("dashboard");
  await key("Control+j");

  // Workspace Git with a diff.
  await key("Control+Shift+G");
  await expect(page.getByTestId("git-workspace")).toContainText("with changes", { timeout: 15000 });
  await page.getByTestId("git-file-unstaged-webshop/src/cart.ts").click();
  await expect(page.getByTestId("git-diff-split")).toBeVisible();
  await shot("git");

  // A chat with attachments and a permission prompt.
  await key("Control+N");
  const docx = zipSync({
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Plan</w:t></w:r></w:p></w:body></w:document>",
    ),
  });
  const png = (await import("node:fs")).readFileSync(ICON).toString("base64");
  await page.getByTestId("composer").evaluate(
    (el, list) => {
      const data = new DataTransfer();
      for (const f of list)
        data.items.add(
          new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }),
        );
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    },
    [
      { name: "screenshot.png", type: "image/png", b64: png },
      {
        name: "checkout-plan.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b64: Buffer.from(docx).toString("base64"),
      },
    ],
  );
  await page
    .getByTestId("composer-input")
    .fill("Here is the plan and a screenshot of the bug. Can you have a look?");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-result").last()).toBeVisible({ timeout: 20000 });
  await page.getByTestId("composer-input").fill("please run the tests");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("permission-card")).toBeVisible({ timeout: 15000 });
  await shot("chat");
  await page.getByTestId("permission-allow").click();

  // Claude configures Jig.
  await page.getByTestId("composer-input").fill("switch Jig to the light theme");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("change-card")).toBeVisible({ timeout: 15000 });
  await shot("configure");
  await page.getByTestId("change-card").getByTestId("change-undo").click();

  // Plan usage card.
  await page.getByTestId("usage-ring").hover();
  await expect(page.getByTestId("usage-card")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "usage.jpg"), type: "jpeg", quality: 82 });

  // Builder: a new add-on ready to review, then a proposal.
  await key("Control+Shift+B");
  await page.getByTestId("build-goal").fill("A button that runs the tests of the active project");
  await page.getByTestId("build-submit").click();
  await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 30000 });
  await shot("build");

  // Suggestions.
  await page.getByTestId("suggestions-badge").click();
  await page.getByTestId("look-for-patterns").click();
  await page.waitForTimeout(1500);
  await shot("suggestions");

  // Settings → Appearance.
  await key("Control+,");
  await shot("settings");
  await app.close();
});
