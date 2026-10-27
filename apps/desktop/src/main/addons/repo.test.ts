import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll, ensureRepo, history, rollback } from "./repo";

describe("add-ons repository", () => {
  it("initialises once, commits changes, lists history and rolls back", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "jig-repo-")), "addons");
    expect(await ensureRepo(dir)).toBe(true);
    expect(await ensureRepo(dir)).toBe(true);
    await mkdir(join(dir, "hello"));
    await writeFile(join(dir, "hello", "ui.tsx"), "v1");
    const first = await commitAll(dir, "Add hello", "hello");
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(await commitAll(dir, "Nothing changed", "hello")).toBeUndefined();
    await writeFile(join(dir, "hello", "ui.tsx"), "v2");
    await writeFile(join(dir, "hello", "extra.ts"), "new");
    await commitAll(dir, "Change hello", "hello");
    const log = await history(dir, "hello");
    expect(log.map((c) => c.message)).toEqual(["Change hello", "Add hello"]);
    await rollback(dir, "hello", first!);
    expect(await readFile(join(dir, "hello", "ui.tsx"), "utf8")).toBe("v1");
    await expect(readFile(join(dir, "hello", "extra.ts"), "utf8")).rejects.toThrow();
    expect((await history(dir, "hello"))[0]?.message).toMatch(/^Roll back hello to /);
    await expect(rollback(dir, "hello", "not-a-hash")).rejects.toThrow("Invalid commit");
  });
});
