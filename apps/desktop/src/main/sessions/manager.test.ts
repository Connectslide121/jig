import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatUpdate, SessionMeta } from "../../shared/engine";
import { FakeEngine } from "../engine/fake";
import { SessionManager, summarize } from "./manager";

let dir: string;
let updates: Array<{ id: string; updates: ChatUpdate[] }>;
let activity: string[];

function manager(engine = new FakeEngine(1)) {
  return new SessionManager({
    runShell: async (_cwd, command) => ({
      output: `ran ${command}`,
      exitCode: command.includes("bad") ? 2 : 0,
    }),
    dir,
    attachmentsDir: join(dir, "attachments"),
    engine,
    engineSettings: () => ({ claudePath: "", allowApiKey: false, env: {} }),
    appendSystemPrompt: () => "You are inside Jig.",
    onUpdate: (id, u) => updates.push({ id, updates: u }),
    onActivity: (e) => activity.push(`${e.kind}:${e.text}`),
  });
}

const create = (m: SessionManager) =>
  m.create({ projectId: "p1", cwd: dir, model: "", permissionMode: "default" });

async function until<T>(fn: () => Promise<T | undefined> | T | undefined, timeout = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
}

const metaOf = async (m: SessionManager, id: string): Promise<SessionMeta> => (await m.snapshot(id)).meta;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jig-sessions-"));
  process.env.JIG_HOME = dir;
  updates = [];
  activity = [];
});

describe("SessionManager", () => {
  it("runs a turn: user item, streamed reply, result, title and persisted cache", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "Hello there");
    await until(
      async () =>
        (await metaOf(m, session.id)).status === "idle" && (await metaOf(m, session.id)).turns === 1,
    );
    const snap = await m.snapshot(session.id);
    expect(snap.meta.title).toBe("Hello there");
    expect(snap.meta.engineSessionId).toMatch(/^fake-/);
    expect(snap.meta.authSource).toBe("subscription");
    expect(snap.items.map((i) => i.kind)).toEqual(["user", "thinking", "assistant", "result"]);
    const reply = snap.items.find((i) => i.kind === "assistant");
    expect(reply?.kind === "assistant" && reply.text).toContain("You said: *Hello there*");
    expect(reply?.kind === "assistant" && reply.streaming).toBeFalsy();
    expect(updates.some((u) => u.updates.some((x) => x.op === "append"))).toBe(true);
    expect(activity).toEqual(["prompt:Hello there"]);
    await m.shutdown();
    await until(async () => {
      const file = JSON.parse(await readFile(join(dir, `${session.id}.json`), "utf8").catch(() => "{}"));
      return file.items?.length === 4;
    });
  });

  it("sends pasted images to Claude with the message and shows them on the user item", async () => {
    const m = manager();
    const session = await create(m);
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const image = await m.addAttachment(session.id, { data: png, mime: "image/png" });
    await m.send(session.id, "", [image]);
    await until(async () => (await metaOf(m, session.id)).turns === 1);
    const snap = await m.snapshot(session.id);
    expect(snap.meta.title).toBe("pasted");
    expect(snap.items[0]).toMatchObject({ kind: "user", text: "", attachments: [image] });
    const reply = snap.items.find((i) => i.kind === "assistant");
    expect(reply?.kind === "assistant" && reply.text).toContain("I see 1 image.");
    // Only this chat's attachments can be sent.
    await m.send(session.id, "x", [{ path: join(dir, "elsewhere.png"), mime: "image/png" }]);
    await until(async () => (await metaOf(m, session.id)).lastError);
    await m.delete(session.id);
    await expect(readFile(image.path)).rejects.toThrow();
  });

  it("queues messages sent while Claude is busy and sends them after the turn", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "first");
    await m.send(session.id, "second");
    expect((await m.snapshot(session.id)).queue.map((q) => q.text)).toEqual(["second"]);
    await until(async () => (await metaOf(m, session.id)).turns === 2);
    const users = (await m.snapshot(session.id)).items.filter((i) => i.kind === "user");
    expect(users.map((u) => u.kind === "user" && u.text)).toEqual(["first", "second"]);
    expect((await m.snapshot(session.id)).queue).toEqual([]);
  });

  it("sends what's still queued first when Claude stopped before reaching it", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "slow please");
    await m.send(session.id, "queued");
    await m.stopProcess(session.id);
    await until(async () => !["working", "starting"].includes((await metaOf(m, session.id)).status));
    expect((await m.snapshot(session.id)).queue.map((q) => q.text)).toEqual(["queued"]);
    await m.send(session.id, "new");
    await until(
      async () => (await m.snapshot(session.id)).items.filter((i) => i.kind === "user").length === 3,
    );
    const users = (await m.snapshot(session.id)).items.filter((i) => i.kind === "user");
    expect(users.map((u) => u.kind === "user" && u.text)).toEqual(["slow please", "queued", "new"]);
    await until(async () => (await m.snapshot(session.id)).queue.length === 0);
    await m.shutdown();
  });

  it("removes queued messages", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "slow please");
    await m.send(session.id, "later");
    const [queued] = (await m.snapshot(session.id)).queue;
    await m.removeQueued(session.id, queued!.id);
    expect((await m.snapshot(session.id)).queue).toEqual([]);
    await m.interrupt(session.id);
  });

  it("asks for permission and continues when allowed", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "run the tests");
    const permission = await until(async () =>
      (await m.snapshot(session.id)).items.find((i) => i.kind === "permission" && i.status === "pending"),
    ).then((p) => (p.kind === "permission" ? p.request.requestId : ""));
    expect((await metaOf(m, session.id)).status).toBe("needs_you");
    await m.answerPermission(session.id, permission, { behavior: "allow", always: true });
    await until(async () => (await metaOf(m, session.id)).status === "idle");
    const items = (await m.snapshot(session.id)).items;
    expect(items.find((i) => i.kind === "permission")).toMatchObject({ status: "always" });
    expect(items.find((i) => i.kind === "tool")).toMatchObject({
      status: "done",
      output: "Tests: 12 passed, 12 total",
    });
    expect(activity).toContain("tool:npm test");
    await expect(m.answerPermission(session.id, permission, { behavior: "deny" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("denied permissions mark the tool as failed", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "run it");
    const permission = await until(async () =>
      (await m.snapshot(session.id)).items.find((i) => i.kind === "permission"),
    );
    await m.answerPermission(
      session.id,
      permission.kind === "permission" ? permission.request.requestId : "",
      {
        behavior: "deny",
      },
    );
    await until(async () => (await metaOf(m, session.id)).status === "idle");
    expect((await m.snapshot(session.id)).items.find((i) => i.kind === "tool")).toMatchObject({
      status: "error",
    });
  });

  it("interrupts a running turn", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "slow");
    await until(async () => (await m.snapshot(session.id)).items.some((i) => i.kind === "assistant"));
    await m.interrupt(session.id);
    await until(async () => (await metaOf(m, session.id)).status === "error");
    const result = (await m.snapshot(session.id)).items.find((i) => i.kind === "result");
    expect(result).toMatchObject({ ok: false, error: "Interrupted" });
  });

  it("flags sessions that need a Claude Code login", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "login");
    await until(async () => (await metaOf(m, session.id)).needsLogin);
  });

  it("restores sessions from disk as idle, resumes with Claude Code's session id", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "hi");
    await until(async () => (await metaOf(m, session.id)).turns === 1);
    await m.rename(session.id, "Renamed");
    await m.setModel(session.id, "opus");
    await m.setPermissionMode(session.id, "plan");
    const engineSessionId = (await metaOf(m, session.id)).engineSessionId;
    await m.shutdown();
    await new Promise((r) => setTimeout(r, 50));
    const again = manager();
    const [restored] = await again.list();
    expect(restored).toMatchObject({
      id: session.id,
      title: "Renamed",
      model: "opus",
      permissionMode: "plan",
      status: "idle",
    });
    await again.send(session.id, "again");
    await until(async () => (await metaOf(again, session.id)).turns === 2);
    expect((await metaOf(again, session.id)).engineSessionId).toBe(engineSessionId);
    await again.delete(session.id);
    expect(await again.list()).toEqual([]);
  });

  it("archives, rejects empty titles and unknown sessions", async () => {
    const m = manager();
    const session = await create(m);
    await m.setArchived(session.id, true);
    expect((await metaOf(m, session.id)).archived).toBe(true);
    await expect(m.rename(session.id, " ")).rejects.toMatchObject({ code: "invalid_args" });
    await expect(m.send("nope", "x")).rejects.toMatchObject({ code: "not_found" });
  });

  it("summarises titles", () => {
    expect(summarize("  fix   the\nbug ")).toBe("fix the bug");
    expect(summarize("x".repeat(100))).toHaveLength(58);
    expect(summarize("")).toBe("New chat");
  });

  it("a chat deleted while Claude works stays deleted (its last events are ignored)", async () => {
    const m = manager(new FakeEngine(20));
    const session = await create(m);
    await m.send(session.id, "slow please");
    await until(async () => (await metaOf(m, session.id)).status === "working");
    await m.delete(session.id);
    const before = updates.length;
    await new Promise((r) => setTimeout(r, 800));
    expect(updates.length).toBe(before);
    await expect(readFile(join(dir, `${session.id}.json`), "utf8")).rejects.toThrow();
    expect(await m.list()).toEqual([]);
  });

  it("a message right after Stop runs in a new process the old one's exit can't disturb", async () => {
    const m = manager(new FakeEngine(20));
    const session = await create(m);
    await m.send(session.id, "slow please");
    await until(async () => (await metaOf(m, session.id)).status === "working");
    await m.stopProcess(session.id);
    expect((await metaOf(m, session.id)).status).toBe("idle");
    await m.send(session.id, "hello again");
    await until(
      async () => (await metaOf(m, session.id)).turns >= 1 && (await metaOf(m, session.id)).status === "idle",
      5000,
    );
    const items = (await m.snapshot(session.id)).items;
    expect(items.filter((i) => i.kind === "assistant").at(-1)).toMatchObject({
      text: expect.stringContaining("hello again"),
    });
    expect(m.runningCount()).toBe(1);
  });

  it("two quick sends start one turn and queue the other", async () => {
    const m = manager(new FakeEngine(5));
    const session = await create(m);
    await Promise.all([m.send(session.id, "first"), m.send(session.id, "second")]);
    expect((await m.snapshot(session.id)).queue.map((q) => q.text)).toEqual(["second"]);
    await until(async () => (await metaOf(m, session.id)).turns === 2, 5000);
  });

  it("a message sent with now joins the running turn instead of waiting", async () => {
    const m = manager(new FakeEngine(5));
    const session = await create(m);
    await m.send(session.id, "slow");
    await until(async () => (await metaOf(m, session.id)).status === "working");
    await m.send(session.id, "also check the footer", [], true);
    expect((await m.snapshot(session.id)).queue).toEqual([]);
    await m.interrupt(session.id);
    await until(async () => (await metaOf(m, session.id)).status !== "working");
    const users = (await m.snapshot(session.id)).items.filter((i) => i.kind === "user");
    expect(users.map((u) => u.kind === "user" && u.text)).toEqual(["slow", "also check the footer"]);
  });

  it("! commands run, show, and go with the next message in Claude Code's format", async () => {
    const m = manager();
    const session = await create(m);
    await m.runShell(session.id, "git status");
    const shell = (await m.snapshot(session.id)).items.find((i) => i.kind === "shell");
    expect(shell).toMatchObject({
      command: "git status",
      output: "ran git status",
      exitCode: 0,
      status: "done",
    });
    await m.send(session.id, "what changed?");
    await until(async () => (await metaOf(m, session.id)).turns === 1);
    const items = (await m.snapshot(session.id)).items;
    expect(items.find((i) => i.kind === "shell")).toMatchObject({ sent: true });
    const reply = items.find((i) => i.kind === "assistant");
    expect(reply?.kind === "assistant" && reply.text).toContain("<bash-input>git status</bash-input>");
  });

  it("rewinds the conversation to before a message and resumes at the turn before it", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "first");
    await until(async () => (await metaOf(m, session.id)).turns === 1);
    await m.send(session.id, "second");
    await until(async () => (await metaOf(m, session.id)).turns === 2);
    const snap = await m.snapshot(session.id);
    const second = snap.items.filter((i) => i.kind === "user")[1]!;
    const firstResult = snap.items.find((i) => i.kind === "result");
    const { text } = await m.rewind(session.id, second.id, false);
    expect(text).toBe("second");
    const after = await m.snapshot(session.id);
    expect(after.items.filter((i) => i.kind === "user").map((u) => u.kind === "user" && u.text)).toEqual([
      "first",
    ]);
    expect(after.items.at(-1)).toMatchObject({ kind: "notice" });
    expect(after.meta.resumeAt).toBe(firstResult?.kind === "result" && firstResult.chainUuid);
    expect(updates.some((u) => u.updates.some((x) => x.op === "reset"))).toBe(true);
    // The next message continues from there; the rewind point is used once.
    await m.send(session.id, "second, again");
    await until(async () => (await metaOf(m, session.id)).turns === 3);
    expect((await metaOf(m, session.id)).resumeAt).toBeUndefined();
  });

  it("rewinding to before the first message starts a new conversation", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "first");
    await until(async () => (await metaOf(m, session.id)).turns === 1);
    const before = (await metaOf(m, session.id)).engineSessionId;
    const first = (await m.snapshot(session.id)).items.find((i) => i.kind === "user")!;
    await m.rewind(session.id, first.id, false);
    expect((await metaOf(m, session.id)).resetPending).toBe(true);
    await m.send(session.id, "start over");
    await until(async () => (await metaOf(m, session.id)).turns === 2);
    expect((await metaOf(m, session.id)).engineSessionId).not.toBe(before);
  });

  it("lists commands and models, sets effort and folders", async () => {
    const m = manager();
    const session = await create(m);
    expect((await m.commands(session.id)).map((c) => c.name)).toContain("compact");
    expect((await m.models(session.id))[0]?.efforts).toContain("high");
    await m.setEffort(session.id, "high");
    expect((await metaOf(m, session.id)).effort).toBe("high");
    await m.setDirs(session.id, ["/tmp/other"]);
    expect((await metaOf(m, session.id)).addDirs).toEqual(["/tmp/other"]);
    expect((await m.mcpStatus(session.id)).map((s) => s.status)).toEqual(["connected", "needs-auth"]);
  });
});
