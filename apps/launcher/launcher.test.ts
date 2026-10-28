import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module
import { main, parseArgs, plan } from "./launcher.mjs";

/** A fake "app": a Node script that writes the ready file, crashes, or hangs. */
async function fakeApp(dir: string, name: string, behaviour: "ready" | "crash" | "hang") {
  const file = join(dir, `${name}.mjs`);
  const body = {
    ready: `require("node:fs").writeFileSync(process.env.JIG_READY_FILE, "ok"); setTimeout(() => {}, 100);`,
    crash: `process.exit(3);`,
    hang: `setTimeout(() => {}, 60000);`,
  }[behaviour];
  await writeFile(
    file,
    `import { createRequire } from "node:module"; const require = createRequire(import.meta.url); ${body}`,
  );
  return file;
}

describe("launcher", () => {
  it("parses arguments and plans new → previous → safe mode", () => {
    const args = parseArgs(["--electron", "e", "--app", "a", "--home", "h", "--timeout", "5"]);
    expect(args).toEqual({ electron: "e", app: "a", home: "h", timeout: 5 });
    expect(plan(args).map((s: { name: string }) => s.name)).toEqual(["new", "safe-mode"]);
  });

  it("keeps the new build when it reports ready", async () => {
    const home = await mkdtemp(join(tmpdir(), "jig-launcher-"));
    const app = await fakeApp(home, "new", "ready");
    expect(
      await main(["--electron", process.execPath, "--app", app, "--home", home, "--timeout", "10"]),
    ).toBe("new");
    expect(JSON.parse(await readFile(join(home, "launcher", "status.json"), "utf8")).result).toBe("new");
  });

  it("falls back to the previous build when the new one crashes, then to safe mode", async () => {
    const home = await mkdtemp(join(tmpdir(), "jig-launcher-"));
    const broken = await fakeApp(home, "broken", "crash");
    const previous = await fakeApp(home, "previous", "ready");
    expect(
      await main([
        "--electron",
        process.execPath,
        "--app",
        broken,
        "--previous",
        previous,
        "--home",
        home,
        "--timeout",
        "10",
      ]),
    ).toBe("previous");
    const hang = await fakeApp(home, "hang", "hang");
    const alsoBroken = await fakeApp(home, "broken2", "crash");
    expect(
      await main([
        "--electron",
        process.execPath,
        "--app",
        hang,
        "--previous",
        alsoBroken,
        "--home",
        home,
        "--timeout",
        "1",
      ]),
    ).toBe("failed");
    expect(await readFile(join(home, "launcher", "launcher.log"), "utf8")).toContain("did not report ready");
  }, 20000);
});
