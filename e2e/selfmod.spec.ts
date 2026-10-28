import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, launchJig, test } from "./fixtures";

const run = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const electronPath = createRequire(import.meta.url)("electron") as unknown as string;

/** A tiny stand-in for Jig's repository with a passing check and a trivial build. */
async function fakeRepo(dir: string): Promise<string> {
  const repo = join(dir, "jig-src");
  await mkdir(join(repo, "apps", "desktop"), { recursive: true });
  await writeFile(join(repo, "AGENTS.md"), "# Rules\n");
  await writeFile(join(repo, ".gitignore"), "dist/\nnode_modules/\n");
  await writeFile(join(repo, "apps", "desktop", "package.json"), '{"name":"jig-desktop"}\n');
  await writeFile(
    join(repo, "build.mjs"),
    'import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("apps/desktop/dist", { recursive: true });\nwriteFileSync("apps/desktop/dist/built.txt", "ok");\n',
  );
  const git = (...args: string[]) => run("git", args, { cwd: repo });
  await git("init", "-q", "-b", "main");
  await git("add", "-A");
  await git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  return repo;
}

test("level 3: the builder changes Jig's source in a worktree; Accept merges it", async () => {
  const home = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  const repo = await fakeRepo(home);
  await writeFile(
    join(home, "config.json"),
    JSON.stringify({
      builder: { sourcePath: repo, checkCommand: "node -e 0", buildCommand: "node build.mjs" },
    }),
  );
  const app = await launchJig(home, { JIG_NO_RESTART: "1" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await page.keyboard.press("Control+Shift+B");
    await page.getByTestId("build-goal").fill("change jig itself: a notes page");
    await page.getByTestId("build-submit").click();
    await expect(page.getByTestId("app-change")).toContainText("No slot can change the window frame", {
      timeout: 20000,
    });
    await page.getByTestId("build-start-app").click();
    await expect(page.getByTestId("build-tab")).toContainText("Ready to review", { timeout: 30000 });
    await expect(page.getByTestId("build-tab")).toContainText("Checks pass");
    await expect(page.getByTestId("build-files")).toContainText("docs/builder-notes.md");
    await expect(page.getByTestId("build-open-preview")).toBeVisible();
    await page.getByTestId("build-accept").click();
    await expect(page.getByTestId("app-change")).toContainText("Restart Jig to use the change", {
      timeout: 20000,
    });
    expect(await readFile(join(repo, "docs", "builder-notes.md"), "utf8")).toContain("a notes page");
    expect(await readFile(join(repo, "apps", "desktop", "dist", "built.txt"), "utf8")).toBe("ok");
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("safe mode and preview instances say so in a banner", async () => {
  for (const [env, text] of [
    [{ JIG_SAFE_MODE: "1", JIG_STARTED_AFTER_FAILURE: "1" }, "Safe mode"],
    [{ JIG_PREVIEW: "abc" }, "Preview instance"],
  ] as const) {
    const home = await mkdtemp(join(tmpdir(), "jig-e2e-"));
    const app = await launchJig(home, env);
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("startup-banner")).toContainText(text, { timeout: 15000 });
    } finally {
      await app.close();
      await rm(home, { recursive: true, force: true });
    }
  }
});

test("the launcher waits for Jig's ready heartbeat, and falls back to the previous build", async () => {
  const home = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  const broken = join(home, "broken-build");
  await mkdir(broken, { recursive: true });
  await writeFile(join(broken, "package.json"), '{"name":"broken","main":"missing.js"}');
  const env = { ...process.env, JIG_ENGINE: "fake", JIG_HIDDEN: "1", ELECTRON_RUN_AS_NODE: "1" };
  const launch = async (app: string, previous?: string) => {
    const args = [join(root, "apps", "launcher", "launcher.mjs"), "--electron", electronPath, "--app", app];
    args.push("--home", home, "--timeout", "20");
    if (previous) args.push("--previous", previous);
    await run(electronPath, args, { env: { ...env, JIG_HOME: home }, timeout: 90000 });
    return JSON.parse(await readFile(join(home, "launcher", "status.json"), "utf8")).result as string;
  };
  const killStarted = async () => {
    const dir = join(home, "launcher");
    for (const f of (await readdir(dir)).filter((f) => f.startsWith("ready-"))) {
      const pid = Number(await readFile(join(dir, f), "utf8"));
      try {
        process.kill(pid);
      } catch {}
      await rm(join(dir, f));
    }
    await new Promise((r) => setTimeout(r, 1000));
  };
  try {
    expect(await launch(join(root, "apps", "desktop"))).toBe("new");
    await killStarted();
    expect(await launch(broken, join(root, "apps", "desktop"))).toBe("previous");
    await killStarted();
    expect(await readFile(join(home, "launcher", "launcher.log"), "utf8")).toContain("new exited");
  } finally {
    await killStarted().catch(() => {});
    await rm(home, { recursive: true, force: true });
  }
});
