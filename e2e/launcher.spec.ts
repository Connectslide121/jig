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

test("safe mode and a fallback start say so in a banner", async () => {
  for (const [env, text] of [
    [{ JIG_SAFE_MODE: "1", JIG_STARTED_AFTER_FAILURE: "1" }, "Safe mode"],
    [{ JIG_STARTED_AFTER_FAILURE: "1" }, "didn't start"],
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
