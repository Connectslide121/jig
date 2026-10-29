import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { worktreeBranch } from "../../shared/worktrees";
import { WorktreeService } from "./service";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

describe("chats in a worktree", () => {
  it("names branches from what the chat is for", () => {
    expect(worktreeBranch("Try the new checkout!", "ab12cd")).toBe("jig/try-the-new-checkout-ab12cd");
    expect(worktreeBranch("", "x1")).toBe("jig/x1");
  });

  it("starts a chat in a worktree, applies its changes and removes it", async () => {
    const home = await mkdtemp(join(tmpdir(), "jig-wt-"));
    const repo = join(home, "repo");
    execFileSync("git", ["init", "-q", "-b", "main", repo]);
    git(repo, "config", "user.email", "a@b.c");
    git(repo, "config", "user.name", "A");
    await writeFile(join(repo, "a.txt"), "one\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    const sessions: Array<{ cwd: string; title: string }> = [];
    const s = new WorktreeService({
      file: join(home, "worktree-chats.json"),
      dir: join(home, "worktrees"),
      createSession: async (input) => {
        sessions.push(input);
        return { id: "s1" };
      },
      onChange: () => {},
    });
    const chat = await s.start({ repo, name: "Checkout" });
    expect(sessions[0]).toMatchObject({ cwd: chat.path, title: "Checkout" });
    expect(git(chat.path, "branch", "--show-current").trim()).toBe(chat.branch);
    await writeFile(join(chat.path, "a.txt"), "two\n");
    await s.apply("s1");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toBe("two\n");
    await s.remove("s1");
    expect(await s.list()).toEqual([]);
    await expect(stat(chat.path)).rejects.toThrow();
    expect(git(repo, "branch", "--list", chat.branch).trim()).toBe("");
  });
});
