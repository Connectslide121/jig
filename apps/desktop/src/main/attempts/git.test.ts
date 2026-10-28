import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addWorktree,
  applyAttempt,
  attemptChanges,
  attemptDiff,
  headCommit,
  isDirty,
  removeWorktree,
} from "./git";

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "jig-attempts-"));
  const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.name", "Ann");
  g("config", "user.email", "ann@example.com");
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\n");
  g("add", ".");
  g("commit", "-q", "-m", "init");
  return { dir, g };
}

describe("attempts in worktrees", () => {
  it("runs an attempt in a worktree, lists its changes and applies it", async () => {
    const { dir, g } = await repo();
    const base = await headCommit(dir);
    const wt = join(await mkdtemp(join(tmpdir(), "jig-wt-")), "1");
    await addWorktree(dir, wt, "jig/attempt-x-1", base);
    await writeFile(join(wt, "cart.ts"), "export const total = 2;\n");
    await writeFile(join(wt, "discount.ts"), "export const off = 0.1;\n");

    const changes = await attemptChanges(1, wt, base);
    expect(changes.files).toEqual([
      { path: "cart.ts", status: "modified", insertions: 1, deletions: 1 },
      { path: "discount.ts", status: "added", insertions: 1, deletions: 0 },
    ]);
    expect(await attemptDiff(wt, base, "cart.ts")).toContain("+export const total = 2;");

    expect(await isDirty(dir)).toBe(false);
    await applyAttempt(dir, wt, base);
    expect(await readFile(join(dir, "cart.ts"), "utf8")).toBe("export const total = 2;\n");
    expect(await readFile(join(dir, "discount.ts"), "utf8")).toBe("export const off = 0.1;\n");

    await removeWorktree(dir, wt, "jig/attempt-x-1");
    expect(g("branch", "--list", "jig/*").trim()).toBe("");
  });

  it("refuses to apply over conflicting changes in the working copy", async () => {
    const { dir } = await repo();
    const base = await headCommit(dir);
    const wt = join(await mkdtemp(join(tmpdir(), "jig-wt-")), "1");
    await addWorktree(dir, wt, "jig/attempt-y-1", base);
    await writeFile(join(wt, "cart.ts"), "export const total = 2;\n");
    await writeFile(join(dir, "cart.ts"), "export const total = 3;\n");
    await expect(applyAttempt(dir, wt, base)).rejects.toThrow(/doesn't apply/);
    expect(await readFile(join(dir, "cart.ts"), "utf8")).toBe("export const total = 3;\n");
  });
});
