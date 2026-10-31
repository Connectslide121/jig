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
import { fileURLToPath, pathToFileURL } from "node:url";
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
  git(dir, "config", "user.name", "Alex Rivera");
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
  // Releases: a policy, a release, and unreleased work after it.
  const shop = join(ws, "webshop");
  await mkdir(join(shop, ".jig"), { recursive: true });
  await writeFile(
    join(shop, ".jig", "release.json"),
    `${JSON.stringify(
      {
        version: 1,
        style: "planned",
        scheme: "semver",
        versionFile: "package.json",
        tagFormat: "v{version}",
        changelog: { path: "CHANGELOG.md" },
        notes: [{ audience: "customers", language: "English" }],
        commitConvention: "conventional",
        environments: [
          { name: "stage", deploy: "manual", prerelease: "rc" },
          { name: "prod", deploy: "manual", production: true },
        ],
      },
      null,
      2,
    )}\n`,
  );
  git(shop, "add", ".");
  git(shop, "commit", "-q", "-m", "chore: release policy");
  git(shop, "tag", "-a", "v1.2.0", "-m", "Release 1.2.0");
  await writeFile(join(shop, "src", "discount.ts"), "export const codes = ['WELCOME10'];\n");
  git(shop, "add", ".");
  git(shop, "commit", "-q", "-m", "feat(checkout): discount codes AB#412");
  await writeFile(
    join(shop, "src", "round.ts"),
    "export const round = (n: number) => Math.round(n * 100) / 100;\n",
  );
  git(shop, "add", ".");
  git(shop, "commit", "-q", "-m", "fix: rounding in totals");
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

  // What Jig knows: a profile and notes Claude saved from chats.
  await writeFile(
    join(root, "jig", "profile.md"),
    "# How I work\n\n## Stack\n\n- .NET APIs and Vue front ends on Azure\n\n## How I release and deploy\n\n- Publishes the webshop and uploads it to a VM by hand\n\n## Tools I use outside Jig\n\n- Postman for the orders API\n\n## Preferences\n\n- Short answers, Swedish release notes for customers\n\n## What I already know well\n",
  );
  const noteAt = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString();
  await writeFile(
    join(root, "jig", "evidence.json"),
    JSON.stringify({
      notes: [
        {
          id: "n1",
          at: noteAt(6),
          category: "manual-work",
          text: "Deploys the webshop by hand: publish, then upload to the VM",
        },
        {
          id: "n2",
          at: noteAt(3),
          category: "outside-jig",
          text: "Checks the orders API responses in Postman",
        },
        {
          id: "n3",
          at: noteAt(1),
          category: "frustration",
          text: "Release notes for customers take a long time to write",
        },
      ],
    }),
  );
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

  // Dashboard.
  await page.getByTestId("project-repos").dblclick();
  await page.waitForTimeout(1200);
  await shot("dashboard");
  await key("Control+j");

  // Workspace Git with a diff.
  await key("Control+Shift+G");
  // Working in webshop, with orders-api shown next to it.
  const gitView = page.getByTestId("git-workspace");
  await expect(gitView).toContainText("changed", { timeout: 15000 });
  await gitView.getByTestId("git-repo-picker").click();
  await page.getByRole("menuitem", { name: "webshop", exact: true }).click();
  await gitView.getByTestId("git-shown-menu").click();
  await page.getByRole("menuitem", { name: "orders-api" }).click();
  await expect(gitView.getByTestId("git-repo-orders-api")).toBeVisible();
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
  await page.getByTestId("usage-status").hover();
  await expect(page.getByTestId("usage-card")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "usage.jpg"), type: "jpeg", quality: 82 });

  // Context window: a big read fills it; hover the meter (the Compact button shows from 70%).
  await page.mouse.move(10, 400);
  await page.getByTestId("composer-input").fill("now read the big file");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("compact-button")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("context-meter").hover();
  await expect(page.getByTestId("context-card")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "context.jpg"), type: "jpeg", quality: 82 });
  await page.mouse.move(10, 400);

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

  // What Jig can do: the overview, then the extension slots with one opened.
  await key("Control+Alt+B"); // close the right sidebar: the page needs the room
  await page.getByTestId("about-button").click();
  await page.waitForTimeout(800);
  await shot("about");
  await page.getByTestId("about-nav-slots").click();
  await page.waitForTimeout(900);
  await page.getByTestId("about-slot-view").locator("button").first().click();
  await page.waitForTimeout(500);
  await shot("slots");

  // A Markdown preview with a Mermaid diagram.
  await writeFile(
    join(ws, "webshop", "ARCHITECTURE.md"),
    "# Webshop architecture\n\nThe checkout runs in three steps. Prices come from the **orders-api**.\n\n```mermaid\nflowchart LR\n  Cart[Cart] --> Checkout[Checkout] --> Pay[Payment]\n  Checkout --> API[(orders-api)]\n```\n\n| Step | Owner | Status |\n|---|---|---|\n| Cart | Web | done |\n| Checkout | Web | in progress |\n| Payment | Payments | planned |\n",
  );
  await key("Control+Shift+G");
  await page.waitForTimeout(1500);
  await page.getByTestId("git-file-untracked-webshop/ARCHITECTURE.md").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Preview" }).click();
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("mermaid").locator("svg")).toBeVisible({
    timeout: 15000,
  });
  await shot("preview");

  // A guided tour of the webshop's changes.
  await page.getByTestId("git-claude-menu").nth(1).click();
  await page.getByRole("menuitem", { name: "Walk me through the changes" }).click();
  await expect(page.getByTestId("tour")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot("tour");

  // Try several ways, judged.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("Try a task several ways");
  await page.keyboard.press("Enter");
  await page.getByTestId("attempts-task").fill("Add a discount code to checkout and write notes.md about it");
  await page.getByTestId("attempts-start").click();
  for (const n of [1, 2, 3])
    await expect(page.getByTestId(`attempt-${n}`)).toContainText("1 file", { timeout: 30000 });
  await page.getByTestId("attempt-2").getByText("notes.md").click();
  await page.getByTestId("attempts-judge").click();
  await expect(page.getByTestId("attempts-verdict")).toBeVisible();
  await shot("attempts");

  // The chat at Claude Code's level: a todo list, an edit with its diff, a plan to approve.
  await page.keyboard.press("Control+N");
  const chatInput = page.locator("[data-tab-id]:not(.hidden)").getByTestId("composer-input");
  const results = page.locator("[data-tab-id]:not(.hidden)").getByTestId("turn-result");
  await chatInput.fill("make a todo list for the discount code");
  await page.keyboard.press("Enter");
  await expect(results).toHaveCount(1, { timeout: 20000 });
  await chatInput.fill("edit webshop/src/cart.ts");
  await page.keyboard.press("Enter");
  await expect(results).toHaveCount(2, { timeout: 20000 });
  await chatInput.fill("make a plan for the checkout");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("plan-card")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "chat-tools.jpg"), type: "jpeg", quality: 82 });
  await page.getByTestId("plan-approve").click();
  await expect(results).toHaveCount(3, { timeout: 20000 });

  // The chat overview: a small card at the chat's top right, with the full detail in a modal.
  await chatInput.fill("use a skill to explain the cart");
  await page.keyboard.press("Enter");
  await expect(results).toHaveCount(4, { timeout: 20000 });
  await chatInput.fill("ask a subagent to explore the cart");
  await page.keyboard.press("Enter");
  await expect(results).toHaveCount(5, { timeout: 20000 });
  const tab = page.locator("[data-tab-id]:not(.hidden)");
  await expect(tab.getByTestId("chat-overview")).toBeVisible();
  await page.waitForTimeout(400);
  await shot("chat-overview");
  await tab.getByTestId("chat-overview-details").click();
  await expect(page.getByTestId("chat-details-dialog")).toBeVisible();
  await page.waitForTimeout(400);
  await shot("chat-details");
  await page.keyboard.press("Escape");

  // Claude's browser: Claude checks the shop on a phone-sized page.
  const shopPage = join(ws, "webshop", "public", "index.html");
  await mkdir(join(ws, "webshop", "public"), { recursive: true });
  await writeFile(
    shopPage,
    `<!doctype html><html><head><title>Webshop</title><meta name="viewport" content="width=device-width"><style>
body{font-family:system-ui,sans-serif;margin:0;background:#faf7f2;color:#2b2622}
header{background:#2b2622;color:#f4b860;padding:16px 20px;font-weight:700;font-size:20px}
main{padding:20px}.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px #0002}
.price{color:#8a5a12;font-weight:600}button{background:#e8a33d;border:0;border-radius:8px;padding:10px 14px;font-weight:600;margin-top:8px}
.total{font-size:18px;font-weight:700;margin-top:10px}</style></head><body>
<header>Webshop</header><main>
<div class="card"><div>Oak cutting board</div><div class="price">€34.00</div><button onclick="add(34)">Add to cart</button></div>
<div class="card"><div>Walnut spoon set</div><div class="price">€18.50</div><button onclick="add(18.5)">Add to cart</button></div>
<div class="card"><div>Cart</div><div class="total" id="total">€0.00</div><input placeholder="Discount code" style="padding:8px;border:1px solid #ccc;border-radius:6px;width:90%"></div>
</main><script>let t=0;function add(p){t+=p;document.getElementById('total').textContent='€'+t.toFixed(2)}</script></body></html>`,
  );
  await hostCall(page, "browser.resize", { width: 390, height: 844 });
  await page.keyboard.press("Control+N");
  await page
    .locator("[data-tab-id]:not(.hidden)")
    .getByTestId("composer-input")
    .fill(`browse ${pathToFileURL(shopPage).href}`);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("tool-images").first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByTestId("browser-frame")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(800);
  await shot("browser");

  // Files and editing: the tree, a file open in the editor, and a preview beside it (split view).
  await key("Control+Alt+B"); // close the right sidebar: two panes need the room
  await key("Control+Shift+E");
  const files = page.getByTestId("files-view");
  await expect(files).toBeVisible({ timeout: 15000 });
  await files.getByTestId("files-entry-webshop").first().click();
  await files.getByTestId("files-entry-src").first().click();
  await files.getByTestId("files-entry-cart.ts").first().click();
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("code-editor")).toBeVisible({
    timeout: 15000,
  });
  await page.locator("[data-tab-id]:not(.hidden) .cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nexport const freeShippingFrom = 50;\n");
  await files.getByTestId("files-entry-ARCHITECTURE.md").first().click();
  await page.waitForTimeout(800);
  await page
    .getByTestId("tab-jig.preview")
    .filter({ hasText: "ARCHITECTURE" })
    .last()
    .click({ button: "right" });
  await page.getByTestId("tab-open-side").click();
  await page.getByTestId("tab-jig.preview").filter({ hasText: "cart.ts" }).first().click();
  await page.waitForTimeout(800);
  await shot("files");

  await page.getByTestId("main-pane-right").getByTestId("tab-jig.preview").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "One pane" }).click();

  // Releases: the webshop's unreleased work, drafted with Claude.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show releases");
  await page.keyboard.press("Enter");
  await page.getByTestId("releases-repo-repos/webshop").click({ timeout: 15000 });
  await page.getByTestId("release-prepare").click();
  await page.getByTestId("release-draft").click();
  await expect(page.getByTestId("release-reason")).toBeVisible({ timeout: 15000 });
  await shot("releases");

  // Workflows: a release workflow half-way.
  const projectId = (
    (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } }
  ).value.projects[0]!.id;
  await hostCall(page, "addons.call", {
    id: "workflows",
    method: "save",
    args: {
      workflow: {
        id: "wrelease",
        name: "Release webshop",
        goal: "Publish the webshop and put it on the VM, the same way every time",
        projectId,
        trigger: { kind: "schedule", every: "week", time: "15:30", day: 5 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            kind: "command",
            title: "Get the latest",
            command: "git status --short --branch",
            cwd: shop,
            mode: "auto",
          },
          {
            id: "s2",
            kind: "command",
            title: "Build",
            command: "echo Build succeeded",
            cwd: shop,
            mode: "auto",
          },
          { id: "s3", kind: "check", title: "Upload to the VM", mode: "manual" },
          {
            id: "s4",
            kind: "claude",
            title: "Write the release notes",
            prompt: "Write the release notes",
            mode: "ask",
          },
        ],
      },
    },
  });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show workflows");
  await page.keyboard.press("Enter");
  await page.getByTestId("workflows-view").getByText("Release webshop").click({ timeout: 15000 });
  await page.getByTestId("workflow-run").click();
  await expect(page.getByTestId("step-done")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot("workflows");

  // What Jig knows about me.
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("What Jig knows about me");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("knowledge-tab")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot("knowledge");
  await app.close();
});
