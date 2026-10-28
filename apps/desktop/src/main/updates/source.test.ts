import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git } from "../addons/repo";
import { sourceStatus, updateSource } from "./source";

const commit = (dir: string, message: string) =>
  git(dir, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-am", message]);

describe("updating Jig from its git clone", () => {
  it("fetches, fast-forwards, builds and keeps the previous build", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-update-"));
    const origin = join(root, "origin");
    await mkdir(join(origin, "apps", "desktop"), { recursive: true });
    await writeFile(join(origin, "apps", "desktop", "package.json"), "{}");
    await writeFile(join(origin, "version.txt"), "1");
    await writeFile(join(origin, ".gitignore"), "dist/\n");
    await writeFile(
      join(origin, "build.mjs"),
      'import { mkdirSync, readFileSync, writeFileSync } from "node:fs";\nmkdirSync("apps/desktop/dist", { recursive: true });\nwriteFileSync("apps/desktop/dist/v.txt", readFileSync("version.txt"));\n',
    );
    await git(origin, ["init", "-q", "-b", "main"]);
    await git(origin, ["add", "-A"]);
    await commit(origin, "v1");
    const clone = join(root, "clone");
    await git(root, ["clone", "-q", origin, clone]);
    const commands = { build: "node build.mjs", install: "node -e 0" };
    await updateSource(clone, commands, join(root, "prev"));
    expect(await sourceStatus(clone)).toMatchObject({ behind: 0, branch: "main" });

    await writeFile(join(origin, "version.txt"), "2");
    await commit(origin, "v2");
    expect((await sourceStatus(clone)).behind).toBe(1);
    const result = await updateSource(clone, commands, join(root, "prev"));
    expect(result.installed).toBe(false);
    expect(await readFile(join(clone, "apps", "desktop", "dist", "v.txt"), "utf8")).toBe("2");
    expect(await readFile(join(root, "prev", "apps", "desktop", "dist", "v.txt"), "utf8")).toBe("1");

    await writeFile(join(clone, "version.txt"), "local");
    await expect(updateSource(clone, commands, join(root, "prev"))).rejects.toThrow(/uncommitted changes/);
  });
});
