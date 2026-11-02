import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectScripts } from "../../shared/terminals";
import { discoverScriptsAndDirs } from "./discover";
import { createScriptWatcher } from "./watch";

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});

async function until(check: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
}

describe("createScriptWatcher", () => {
  it("emits when a script appears, once, and not for unrelated files", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-scriptwatch-"));
    roots.push(root);
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts", "a.sh"), "");
    const load = async () => {
      const { scripts, dirs } = await discoverScriptsAndDirs(root, "linux");
      return { result: { projectId: "p", scripts, groups: [] } as ProjectScripts, dirs };
    };
    const seen: ProjectScripts[] = [];
    const watcher = createScriptWatcher(load, (r) => seen.push(r));
    watcher.track("p", await load());

    await writeFile(join(root, "notes.txt"), "x");
    await new Promise((r) => setTimeout(r, 900));
    expect(seen).toHaveLength(0);

    await writeFile(join(root, "scripts", "backend.sh"), "");
    await until(() => seen.length > 0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.scripts.map((s) => s.name)).toEqual(["a.sh", "backend.sh"]);

    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    await until(() => seen.length > 1);
    expect(seen[1]?.scripts.some((s) => s.name === "dev")).toBe(true);
    watcher.stopAll();
  });
});
