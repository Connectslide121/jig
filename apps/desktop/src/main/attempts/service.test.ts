import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import { AttemptService, attemptPrompt } from "./service";

async function setup() {
  const repo = await mkdtemp(join(tmpdir(), "jig-attempt-repo-"));
  const g = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.name", "Ann");
  g("config", "user.email", "ann@example.com");
  await writeFile(join(repo, "cart.ts"), "export const total = 1;\n");
  g("add", ".");
  g("commit", "-q", "-m", "init");
  const sent: Array<{ id: string; text: string }> = [];
  const stopped: string[] = [];
  const sessions: Array<{ id: string; cwd: string }> = [];
  const service = new AttemptService({
    dir: await mkdtemp(join(tmpdir(), "jig-attempts-")),
    createSession: async (input) => {
      const meta = { id: `s${sessions.length + 1}`, ...input } as unknown as SessionMeta;
      sessions.push({ id: meta.id, cwd: input.cwd });
      return meta;
    },
    send: async (id, text) => {
      sent.push({ id, text });
    },
    stop: async (id) => {
      stopped.push(id);
    },
    ask: async () => '{"winner": 2, "summary": "Two is tidier.", "notes": []}',
    onChange: () => {},
  });
  return { repo, g, service, sent, stopped, sessions };
}

describe("AttemptService", () => {
  it("starts chats in worktrees, judges, keeps one and cleans up", async () => {
    const { repo, g, service, sent, stopped, sessions } = await setup();
    const run = await service.start({
      projectId: "p",
      repo,
      task: "Change the total",
      hints: ["Small", "Clean"],
    });
    expect(run.attempts.map((a) => a.hint)).toEqual(["Small", "Clean"]);
    expect(sent.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(sent[0]!.text).toBe(attemptPrompt("Change the total", "Small", 1, 2));

    // The chats work in their worktrees.
    await writeFile(join(sessions[0]!.cwd, "cart.ts"), "export const total = 2;\n");
    await writeFile(join(sessions[1]!.cwd, "cart.ts"), "export const total = 3;\n");
    const changes = await service.changes(run.id);
    expect(changes.map((c) => c.files.map((f) => f.path))).toEqual([["cart.ts"], ["cart.ts"]]);
    expect((await service.judge(run.id)).winner).toBe(2);

    const kept = await service.keep(run.id, 2);
    expect(kept).toMatchObject({ status: "kept", kept: 2 });
    expect(await readFile(join(repo, "cart.ts"), "utf8")).toBe("export const total = 3;\n");
    expect(stopped).toEqual(["s1", "s2"]);
    expect(existsSync(sessions[0]!.cwd)).toBe(false);
    expect(g("branch", "--list", "jig/*").trim()).toBe("");
  });

  it("needs a task, 2 to 4 attempts and a commit to start from", async () => {
    const { repo, service } = await setup();
    await expect(service.start({ projectId: "p", repo, task: " ", hints: ["a", "b"] })).rejects.toThrow(
      /task/,
    );
    await expect(service.start({ projectId: "p", repo, task: "x", hints: ["a"] })).rejects.toThrow(/2 to 4/);
    const empty = await mkdtemp(join(tmpdir(), "jig-empty-"));
    execFileSync("git", ["init", "-q"], { cwd: empty });
    await expect(
      service.start({ projectId: "p", repo: empty, task: "x", hints: ["a", "b"] }),
    ).rejects.toThrow(/no commits/);
  });
});
