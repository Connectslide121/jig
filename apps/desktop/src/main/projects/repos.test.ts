import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRepos } from "./repos";

describe("findRepos", () => {
  it("finds repositories one and two levels down, not inside repos or build folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-ws-"));
    const repo = async (...parts: string[]) => mkdir(join(root, ...parts, ".git"), { recursive: true });
    await repo("webshop");
    await repo("Api");
    await repo("client-a", "portal");
    await repo("client-a", "functions");
    await repo("webshop", "vendor-copy"); // inside a repo: not listed
    await repo("deep", "er", "still"); // three levels: too deep
    await repo("node_modules", "pkg");
    await repo(".hidden");
    await mkdir(join(root, "worktree"), { recursive: true });
    await writeFile(join(root, "worktree", ".git"), "gitdir: ../webshop/.git/worktrees/x"); // a worktree counts
    await mkdir(join(root, "notes"), { recursive: true });
    expect((await findRepos(root)).map((r) => r.name)).toEqual([
      "Api",
      "client-a/functions",
      "client-a/portal",
      "webshop",
      "worktree",
    ]);
    expect((await findRepos(root))[0]?.path).toBe(join(root, "Api"));
    expect((await findRepos(root, 1)).map((r) => r.name)).toEqual(["Api", "webshop", "worktree"]);
  });
});
