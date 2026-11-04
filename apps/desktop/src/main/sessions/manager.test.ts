import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type ChatUpdate, chatProvider, type SessionMeta } from "../../shared/engine";
import { FakeEngine } from "../engine/fake";
import { cleanTitle, SessionManager, summarize } from "./manager";

let dir: string;
let updates: Array<{ id: string; updates: ChatUpdate[] }>;
let activity: string[];
let sharedFiles: Array<{ images: number; files: number }>;
let dontAskWaitSeconds: number | undefined;

function manager(engine = new FakeEngine(1)) {
  return new SessionManager({
    runShell: async (_cwd, command) => ({
      output: `ran ${command}`,
      exitCode: command.includes("bad") ? 2 : 0,
    }),
    dir,
    attachmentsDir: join(dir, "attachments"),
    engine,
    engineSettings: () => ({ claudePath: "", allowApiKey: false, env: {}, dontAskWaitSeconds }),
    appendSystemPrompt: () => "You are inside Jig.",
    onUpdate: (id, u) => updates.push({ id, updates: u }),
    onActivity: (e) => {
      activity.push(`${e.kind}:${e.text}`);
      if (e.kind === "prompt")
        sharedFiles.push({ images: e.imageAttachments ?? 0, files: e.fileAttachments ?? 0 });
    },
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
  sharedFiles = [];
  dontAskWaitSeconds = undefined;
});

describe("SessionManager", () => {
  it("keeps unsent chats memory-only, even after model discovery or settings changes", async () => {
    const m = manager();
    const draft = await create(m);
    await m.setModel(draft.id, "sonnet");
    await m.commands(draft.id);
    expect((await m.snapshot(draft.id)).meta.draft).toBe(true);
    await m.shutdown();
    await expect(readFile(join(dir, `${draft.id}.json`))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await manager().list()).toEqual([]);
  });

  it("starts persistence with the first prompt and ignores legacy empty records without deleting them", async () => {
    const m = manager();
    const draft = await create(m);
    const old = { ...draft, id: "legacy-empty", draft: undefined };
    await writeFile(join(dir, "legacy-empty.json"), JSON.stringify({ meta: old, items: [], queue: [] }));
    await m.send(draft.id, "Keep this chat");
    await until(async () => (await metaOf(m, draft.id)).turns === 1);
    await m.shutdown();
    const saved = JSON.parse(await readFile(join(dir, `${draft.id}.json`), "utf8"));
    expect(saved.meta.draft).toBe(false);
    expect(saved.items.some((item: { kind: string }) => item.kind === "user")).toBe(true);
    expect((await manager().list()).map((meta) => meta.id)).toEqual([draft.id]);
    await expect(readFile(join(dir, "legacy-empty.json"))).resolves.toBeTruthy();
  });
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

  it("runs each chat on its provider's engine and keeps the provider on forks (D-309)", async () => {
    const claude = new FakeEngine(1);
    const codex = new FakeEngine(1, "codex");
    const started: string[] = [];
    for (const engine of [claude, codex]) {
      const start = engine.start.bind(engine);
      engine.start = (options, onEvent) => {
        started.push(engine.provider);
        return start(options, onEvent);
      };
    }
    const m = new SessionManager({
      dir,
      attachmentsDir: join(dir, "attachments"),
      engine: claude,
      engineFor: (provider) => (provider === "codex" ? codex : claude),
      engineSettings: () => ({ claudePath: "", allowApiKey: false, env: {} }),
      appendSystemPrompt: () => "",
      onUpdate: () => {},
    });
    const plain = await create(m);
    expect(plain.provider).toBe("claude");
    const chat = await m.create({ cwd: dir, model: "sol", permissionMode: "default", provider: "codex" });
    expect(chat.provider).toBe("codex");
    await m.send(chat.id, "Hello Codex");
    await until(async () => (await metaOf(m, chat.id)).turns === 1);
    expect(started).toEqual(["codex"]);
    expect((await m.fork(chat.id)).provider).toBe("codex");
    await m.shutdown();
  });

  it("changes the provider of a chat only until its first message (D-314)", async () => {
    const m = manager();
    const chat = await create(m);
    const switched = await m.setProvider(chat.id, "codex", {
      model: "sol",
      effort: "high",
      permissionMode: "default",
    });
    expect(switched).toMatchObject({
      provider: "codex",
      model: "sol",
      effort: "high",
      permissionMode: "default",
    });
    await m.send(chat.id, "Hello");
    await until(async () => (await metaOf(m, chat.id)).turns === 1);
    await expect(
      m.setProvider(chat.id, "claude", { model: "opus", permissionMode: "plan" }),
    ).rejects.toMatchObject({ code: "not_allowed" });
    expect((await metaOf(m, chat.id)).provider).toBe("codex");
    await m.shutdown();
  });

  it("moves a chat to another project with its defaults only until its first message (D-341)", async () => {
    const m = manager();
    const chat = await create(m);
    const target = {
      projectId: "p2",
      cwd: dir,
      provider: "codex" as const,
      model: "sol",
      effort: "high" as const,
      permissionMode: "acceptEdits" as const,
    };
    expect(await m.switchProject(chat.id, target)).toMatchObject(target);
    await m.send(chat.id, "Hello");
    await until(async () => (await metaOf(m, chat.id)).turns === 1);
    await expect(m.switchProject(chat.id, { ...target, projectId: "p1" })).rejects.toMatchObject({
      code: "not_allowed",
    });
    expect((await metaOf(m, chat.id)).projectId).toBe("p2");
    await m.shutdown();
  });

  it("reads chats saved without a provider as Claude chats", async () => {
    const m = manager();
    const old = await create(m);
    await m.send(old.id, "Hello");
    await until(async () => (await metaOf(m, old.id)).turns === 1);
    await m.shutdown();
    const file = join(dir, `${old.id}.json`);
    const saved = JSON.parse(await readFile(file, "utf8"));
    delete saved.meta.provider;
    await writeFile(file, JSON.stringify(saved));
    const again = manager();
    const meta = await metaOf(again, old.id);
    expect(meta.provider).toBeUndefined();
    expect(chatProvider(meta)).toBe("claude");
    await again.shutdown();
  });

  it("sends add-ons' context with each message, without showing it in the transcript", async () => {
    const sent: string[] = [];
    class Recording extends FakeEngine {
      override start(...args: Parameters<FakeEngine["start"]>) {
        const session = super.start(...args);
        const send = session.send.bind(session);
        session.send = (text, parts, priority) => {
          sent.push(text);
          return send(text, parts, priority);
        };
        return session;
      }
    }
    const m = new SessionManager({
      ...(manager() as unknown as { options: ConstructorParameters<typeof SessionManager>[0] }).options,
      engine: new Recording(1),
      turnContext: async (meta) => `Notes of ${meta.id}`,
    });
    const session = await create(m);
    await m.send(session.id, "Hello there");
    await until(async () => (await metaOf(m, session.id)).turns === 1);
    expect(sent[0]).toContain(`<jig-context>`);
    expect(sent[0]).toContain(`Notes of ${session.id}`);
    expect(sent[0]?.endsWith("Hello there")).toBe(true);
    const snap = await m.snapshot(session.id);
    expect(snap.items[0]).toMatchObject({ kind: "user", text: "Hello there" });
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
    expect(sharedFiles).toEqual([{ images: 1, files: 0 }]);
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

  it("edits a queued message in place, and refuses one already sent", async () => {
    const m = manager();
    const session = await create(m);
    await m.send(session.id, "slow please");
    await m.send(session.id, "later");
    await m.send(session.id, "after that");
    const [first, second] = (await m.snapshot(session.id)).queue;
    await m.editQueued(session.id, first!.id, "later, but changed");
    expect((await m.snapshot(session.id)).queue.map((q) => q.text)).toEqual([
      "later, but changed",
      "after that",
    ]);
    expect((await m.snapshot(session.id)).queue[1]!.id).toBe(second!.id);
    // Its files change with it; left out, it keeps them; text and files can't both go.
    const shot = { path: "shot.png", mime: "image/png", name: "shot.png", kind: "image" as const };
    await m.editQueued(session.id, second!.id, " with a screenshot ", [shot]);
    await m.editQueued(session.id, second!.id, "with a screenshot, again");
    expect((await m.snapshot(session.id)).queue[1]).toEqual({
      id: second!.id,
      text: "with a screenshot, again",
      attachments: [shot],
    });
    await m.editQueued(session.id, second!.id, "no files", []);
    expect((await m.snapshot(session.id)).queue[1]).toEqual({ id: second!.id, text: "no files" });
    await expect(m.editQueued(session.id, second!.id, " ", [])).rejects.toThrow("empty");
    await expect(m.editQueued(session.id, "gone", "x")).rejects.toThrow("already been sent");
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

  it("Don't ask: a safety check waits for you, then is declined unanswered (D-336)", async () => {
    dontAskWaitSeconds = 0.2;
    const m = manager();
    const session = await m.create({
      projectId: "p1",
      cwd: dir,
      model: "",
      permissionMode: "bypassPermissions",
    });
    await m.send(session.id, "do the safety check");
    const pending = await until(async () =>
      (await m.snapshot(session.id)).items.find((i) => i.kind === "permission" && i.status === "pending"),
    );
    expect(pending).toMatchObject({ declineAt: expect.any(String) });
    expect((await metaOf(m, session.id)).status).toBe("needs_you");
    await until(async () => (await metaOf(m, session.id)).status === "idle");
    const items = (await m.snapshot(session.id)).items;
    expect(items.find((i) => i.kind === "permission")).toMatchObject({ status: "denied", timedOut: true });
    expect(items.find((i) => i.kind === "tool")).toMatchObject({
      status: "error",
      output: expect.stringContaining("Declined automatically"),
    });
    expect(activity.some((a) => a.startsWith("friction:denied"))).toBe(false);
  });

  it("Don't ask: your answer in time wins and the timer is cleared (D-336)", async () => {
    dontAskWaitSeconds = 0.2;
    const m = manager();
    const session = await m.create({
      projectId: "p1",
      cwd: dir,
      model: "",
      permissionMode: "bypassPermissions",
    });
    await m.send(session.id, "do the safety check");
    const pending = await until(async () =>
      (await m.snapshot(session.id)).items.find((i) => i.kind === "permission" && i.status === "pending"),
    );
    await m.answerPermission(session.id, pending.kind === "permission" ? pending.request.requestId : "", {
      behavior: "allow",
    });
    await until(async () => (await metaOf(m, session.id)).status === "idle");
    await new Promise((r) => setTimeout(r, 300));
    const permission = (await m.snapshot(session.id)).items.find((i) => i.kind === "permission");
    expect(permission).toMatchObject({ status: "allowed" });
    expect(permission).not.toHaveProperty("timedOut");
  });

  it("Don't ask with no wait declines at once with a notice (D-293)", async () => {
    dontAskWaitSeconds = 0;
    const m = manager();
    const session = await m.create({
      projectId: "p1",
      cwd: dir,
      model: "",
      permissionMode: "bypassPermissions",
    });
    await m.send(session.id, "do the safety check");
    await until(async () => (await metaOf(m, session.id)).status === "idle");
    const items = (await m.snapshot(session.id)).items;
    expect(items.some((i) => i.kind === "permission")).toBe(false);
    expect(items.find((i) => i.kind === "notice")).toMatchObject({
      text: expect.stringContaining("Declined automatically in Don't ask mode"),
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

  it("cleans a model's chat name", () => {
    expect(cleanTitle('"Fix login redirect."')).toBe("Fix login redirect");
    expect(cleanTitle("\nTitle: **Auto-name new chats**\nBecause…")).toBe("Auto-name new chats");
    expect(cleanTitle("x".repeat(100))).toHaveLength(58);
    expect(cleanTitle("  ")).toBe("");
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

it("reloads selected skills only between turns, preserves resume, and follows a moved chat's project", async () => {
  const starts: Array<Parameters<FakeEngine["start"]>[0]> = [];
  class Recording extends FakeEngine {
    override start(...args: Parameters<FakeEngine["start"]>) {
      starts.push(args[0]);
      return super.start(...args);
    }
  }
  let version = "enabled";
  const m = new SessionManager({
    ...(manager() as unknown as { options: ConstructorParameters<typeof SessionManager>[0] }).options,
    engine: new Recording(1),
    configurationKey: (meta) => `${meta.projectId}:${version}`,
    plugins: (meta) =>
      version === "enabled" && meta.projectId === "p1" ? [{ type: "local", path: "/skills/design" }] : [],
    appendSystemPrompt: () => version,
  });
  const chat = await create(m);
  await m.send(chat.id, "Hello");
  await until(async () => (await metaOf(m, chat.id)).turns === 1);
  const resume = (await metaOf(m, chat.id)).engineSessionId;
  version = "disabled";
  // Looking up controls must not restart a process or interrupt a running turn.
  await m.commands(chat.id);
  expect(starts).toHaveLength(1);
  await m.send(chat.id, "Hello again");
  await until(async () => (await metaOf(m, chat.id)).turns === 2);
  expect(starts).toHaveLength(2);
  expect(starts[1]).toMatchObject({ resume, plugins: [], appendSystemPrompt: "disabled" });
  version = "enabled";
  await m.setProject(chat.id, "p2");
  await m.send(chat.id, "Hello in another project");
  await until(async () => (await metaOf(m, chat.id)).turns === 3);
  expect(starts[2]?.plugins).toEqual([]);
  await m.shutdown();
});

describe("limits (D-338)", () => {
  function twoEngines(policy: "ask" | "switch" | "wait", room = true) {
    const claude = new FakeEngine(1);
    const codex = new FakeEngine(1, "codex");
    const sent: Array<{ provider: string; text: string }> = [];
    for (const engine of [claude, codex]) {
      const start = engine.start.bind(engine);
      engine.start = (options, onEvent) => {
        const session = start(options, onEvent);
        const send = session.send.bind(session);
        session.send = (text, ...rest) => {
          sent.push({ provider: engine.provider, text });
          return send(text, ...rest);
        };
        return session;
      };
    }
    const m = new SessionManager({
      dir,
      attachmentsDir: join(dir, "attachments"),
      engine: claude,
      engineFor: (provider) => (provider === "codex" ? codex : claude),
      engineSettings: () => ({ claudePath: "", allowApiKey: false, env: {} }),
      appendSystemPrompt: () => "",
      onUpdate: () => {},
      limitPolicy: () => policy,
      providerRoom: () => (room ? { ok: true } : { ok: false, reason: "no room" }),
      providerDefaults: (meta, provider) => ({
        model: provider === "codex" ? "sol" : "opus",
        permissionMode: meta.permissionMode,
      }),
      diffStat: async () => " cart.ts | 2 +-",
    });
    return { m, sent };
  }

  it("asks on the card, holds queued messages, and continues with the other provider on request", async () => {
    const { m, sent } = twoEngines("ask");
    const chat = await create(m);
    await m.send(chat.id, "Fix the cart, then hit the limit");
    // Queued while the turn runs.
    await m.send(chat.id, "And the tests");
    await until(async () => (await metaOf(m, chat.id)).limit);
    const meta = await metaOf(m, chat.id);
    expect(meta.limit).toMatchObject({ provider: "claude", state: "ask" });
    const card = (await m.snapshot(chat.id)).items.find((i) => i.kind === "limit");
    expect(card).toMatchObject({ status: "open", provider: "claude" });
    await until(async () => ["idle", "error"].includes((await metaOf(m, chat.id)).status));
    // The turn its limit stopped leaves the queued message for later.
    expect((await m.snapshot(chat.id)).queue).toHaveLength(1);

    await m.limitAction(chat.id, card!.id, "continue");
    await until(async () => (await metaOf(m, chat.id)).turns >= 2);
    const after = await m.snapshot(chat.id);
    expect(after.meta).toMatchObject({ provider: "codex", model: "sol" });
    expect(after.meta.providers?.[0]).toMatchObject({ provider: "claude", reason: "limit" });
    expect(after.items.find((i) => i.kind === "limit")).toMatchObject({ status: "continued", to: "codex" });
    expect(after.items.some((i) => i.kind === "handoff")).toBe(true);
    const handed = sent.find((s) => s.provider === "codex")!.text;
    expect(handed).toContain("<jig-handoff>");
    expect(handed).toContain("> Fix the cart, then hit the limit");
    expect(handed).toContain("cart.ts | 2 +-");
    expect(handed).toContain("Carry on with this chat's work");
    // Rewinding stops at the handoff.
    const first = after.items.find((i) => i.kind === "user")!;
    await expect(m.rewind(chat.id, first.id, false)).rejects.toMatchObject({ code: "invalid_args" });
    await m.shutdown();
  });

  it("carries on by itself with `switch`, and waits for the reset when the other has no room", async () => {
    const { m } = twoEngines("switch");
    const chat = await create(m);
    await m.send(chat.id, "hit the limit");
    await until(
      async () => (await metaOf(m, chat.id)).provider === "codex" && (await metaOf(m, chat.id)).turns >= 2,
    );
    await m.shutdown();

    const waiting = twoEngines("switch", false);
    const other = await create(waiting.m);
    await waiting.m.send(other.id, "hit the limit");
    await until(async () => (await metaOf(waiting.m, other.id)).limit?.state === "waiting");
    const card = (await waiting.m.snapshot(other.id)).items.find((i) => i.kind === "limit");
    expect(card).toMatchObject({ status: "waiting" });
    expect(card?.kind === "limit" && card.resetsAt).toBeTruthy();
    await expect(waiting.m.limitAction(other.id, card!.id, "continue")).rejects.toMatchObject({
      code: "unavailable",
    });
    await waiting.m.limitAction(other.id, card!.id, "dismiss");
    expect((await metaOf(waiting.m, other.id)).limit).toBeUndefined();
    await waiting.m.shutdown();
  });
  it("hands over by hand between turns (D-339): a plan, a divider, and the next message brings the handoff", async () => {
    const { m, sent } = twoEngines("ask", false);
    const chat = await create(m);
    await m.send(chat.id, "Fix the cart total");
    // While the turn runs it can't be handed over.
    const busy = await m.handOverPlan(chat.id, "codex");
    expect(busy.blocked).toContain("hand over once this turn has finished");
    await expect(m.handOver(chat.id, "codex")).rejects.toMatchObject({ code: "invalid_args" });
    await until(async () => (await metaOf(m, chat.id)).status === "idle");

    const plan = await m.handOverPlan(chat.id, "codex");
    expect(plan).toMatchObject({
      from: "claude",
      to: "codex",
      after: { model: "sol" },
      room: { ok: false, reason: "no room" },
      messages: 1,
    });
    expect(plan.blocked).toBeUndefined();
    // No room on the other plan is a warning, not a stop.
    const meta = await m.handOver(chat.id, "codex");
    expect(meta).toMatchObject({ provider: "codex", model: "sol", status: "idle" });
    expect(meta.providers?.[0]).toMatchObject({ provider: "claude", reason: "manual" });
    const items = (await m.snapshot(chat.id)).items;
    expect(items.at(-1)).toMatchObject({ kind: "handoff", from: "claude", to: "codex", reason: "manual" });
    // Nothing is sent until you write.
    expect(sent.some((s) => s.provider === "codex")).toBe(false);
    await m.send(chat.id, "Carry on please");
    await until(async () => sent.some((s) => s.provider === "codex"));
    const handed = sent.find((s) => s.provider === "codex")!.text;
    expect(handed).toContain("The user moved it to you");
    expect(handed).toContain("> Fix the cart total");
    expect(handed).toContain("Carry on please");
    // Already there: nothing to do.
    expect((await m.handOverPlan(chat.id, "codex")).blocked).toContain("already runs on ChatGPT");
    await m.shutdown();
  });
});
