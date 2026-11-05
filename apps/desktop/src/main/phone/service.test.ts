import { afterEach, describe, expect, it } from "vitest";
import type { ChatItem, PermissionDecision, SessionMeta } from "../../shared/engine";
import type { PhoneState } from "../../shared/phone";
import type { PermissionItem } from "./messages";
import { PhoneService, type PhoneSettings, type SavedPhone } from "./service";
import { type TelegramApi, TelegramError, type TelegramUpdate } from "./telegram";

const OWNER = 42;
const NOW = 1_700_000_000;

const meta = (over: Partial<SessionMeta> = {}) =>
  ({ id: "s1", title: "Shop", status: "needs_you", updatedAt: "2025-01-01", ...over }) as SessionMeta;

const bash = (status: PermissionItem["status"] = "pending") =>
  ({
    kind: "permission",
    id: "p1",
    request: { requestId: "r1", toolName: "Bash", input: { command: "npm test" }, canAlwaysAllow: false },
    status,
    at: "2025-01-01T00:00:00Z",
  }) as PermissionItem;

function setup(
  opts: {
    saved?: SavedPhone;
    settings?: Partial<PhoneSettings>;
    away?: boolean;
    topics?: boolean;
    concierge?: boolean;
  } = {},
) {
  let topicId = 500;
  const timers: Array<() => void> = [];
  const asked: string[] = [];
  const queue = {
    running: true,
    tasks: [
      { title: "Fix rounding", status: "done" },
      { title: "Card 29992 plan", status: "failed", report: { summary: "The build broke." } },
      { title: "Update docs", status: "running" },
      { title: "Release notes", status: "queued" },
    ],
  };
  const goneTopics = new Set<number>();
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let messageId = 100;
  const photos: Array<{ method: string; params: Record<string, unknown>; bytes: number }> = [];
  const voices: Array<{ params: Record<string, unknown>; bytes: number }> = [];
  const api: TelegramApi = {
    async voice<T>(params: Record<string, unknown>, ogg: Buffer) {
      voices.push({ params, bytes: ogg.length });
      return { message_id: ++messageId } as T;
    },
    async download(fileId: string) {
      return Buffer.from(`ogg:${fileId}`);
    },
    async photo<T>(method: string, params: Record<string, unknown>, photo: Buffer) {
      photos.push({ method, params, bytes: photo.length });
      return { message_id: ++messageId } as T;
    },
    async call<T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
      if (method === "getUpdates")
        return new Promise<T>((_, reject) =>
          signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      calls.push({ method, params });
      if (method === "getMe") {
        if (params && (api as { bad?: boolean }).bad) throw new TelegramError("Unauthorized", 401);
        return {
          id: 1,
          is_bot: true,
          first_name: "Bot",
          username: "shop_bot",
          has_topics_enabled: opts.topics ?? false,
        } as T;
      }
      if (method === "createForumTopic") return { message_thread_id: ++topicId } as T;
      if (method === "sendMessage") {
        if (goneTopics.has(Number(params.message_thread_id)))
          throw new TelegramError("Bad Request: message thread not found", 400);
        return { message_id: ++messageId } as T;
      }
      return true as T;
    },
  };
  const items = new Map<string, ChatItem[]>([["s1", [bash()]]]);
  const metas = new Map<string, SessionMeta>([["s1", meta()]]);
  const answers: Array<{ id: string; requestId: string; decision: PermissionDecision }> = [];
  const sent: Array<{ id: string; text: string }> = [];
  const saves: Array<SavedPhone | undefined> = [];
  const states: PhoneState[] = [];
  let enabled = false;
  const awake: boolean[] = [];
  const settings: PhoneSettings = {
    enabled: true,
    when: "always",
    awayMinutes: 5,
    finished: true,
    keepAwake: true,
    screenshots: true,
    ...opts.settings,
  };
  const service = new PhoneService({
    chats: {
      list: async () => [...metas.values()],
      snapshot: async (id) => {
        const m = metas.get(id);
        if (!m) throw new Error("not_found");
        return { meta: m, items: items.get(id) ?? [] };
      },
      send: async (id, text) => void sent.push({ id, text }),
      answer: async (id, requestId, decision) => void answers.push({ id, requestId, decision }),
    },
    store: { load: async () => opts.saved, save: async (s) => void saves.push(s), remembered: true },
    api: () => api,
    project: async (id) => (id === "p1" ? { name: "Podium", color: "info" } : undefined),
    ...(opts.concierge
      ? {
          concierge: {
            ask: async (text: string) => {
              asked.push(text);
              return "jig1";
            },
          },
        }
      : {}),
    voice: {
      transcribe: async (ogg: Buffer) => (ogg.toString() === "ogg:silence" ? "" : "how is it going"),
      speak: async (text: string) => Buffer.from(`spoken:${text}`),
    },
    screens: {
      window: async () => Buffer.from("window"),
      browser: async (id: string) => (id === "s1" ? Buffer.from("page") : undefined),
      file: async (_meta: SessionMeta, path: string) => {
        if (!path.endsWith(".png")) throw new Error(`there is no file at ${path}.`);
        return Buffer.from("file");
      },
    },
    projects: async () => [
      { id: "p1", name: "Podium" },
      { id: "p2", name: "Jig" },
    ],
    queues: {
      overview: async () => [
        { projectId: "p1", queued: 2, active: 1, needsYou: 0, running: queue.running },
        { projectId: "p2", queued: 0, active: 0, needsYou: 0, running: false },
      ],
      list: async (projectId) => {
        if (projectId !== "p1") throw new Error("not_found");
        return queue;
      },
      start: async () => {
        queue.running = true;
      },
      pause: async () => {
        queue.running = false;
      },
    },
    settings: () => settings,
    away: () => opts.away ?? false,
    keepAwake: (on) => void awake.push(on),
    enable: async () => {
      enabled = true;
    },
    onChange: (s) => states.push(s),
    code: () => "123456",
    now: () => NOW * 1000,
    pause: async () => undefined,
    later: (fn: () => void) => {
      timers.push(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
  });
  const handle = (update: Omit<TelegramUpdate, "update_id">) =>
    (service as unknown as { handle(u: TelegramUpdate): Promise<void> }).handle({ update_id: 1, ...update });
  const text = (body: string, over: Record<string, unknown> = {}) =>
    handle({
      message: {
        message_id: 1,
        date: NOW,
        chat: { id: OWNER, type: "private" },
        from: { id: OWNER, is_bot: false, first_name: "Alex" },
        text: body,
        ...over,
      },
    } as Omit<TelegramUpdate, "update_id">);
  const tap = (data: string, from = OWNER, thread?: number) =>
    handle({
      callback_query: {
        id: "cb",
        from: { id: from, is_bot: false, first_name: "X" },
        data,
        ...(thread
          ? {
              message: {
                message_id: 1,
                chat: { id: OWNER },
                message_thread_id: thread,
                is_topic_message: true,
              },
            }
          : {}),
      },
    } as Omit<TelegramUpdate, "update_id">);
  const messages = () => calls.filter((c) => c.method === "sendMessage").map((c) => String(c.params.text));
  return {
    service,
    api,
    calls,
    items,
    metas,
    answers,
    sent,
    saves,
    states,
    settings,
    handle,
    text,
    tap,
    messages,
    enabled: () => enabled,
    awake,
    goneTopics,
    queue,
    asked,
    photos,
    timers,
    voices,
  };
}

const paired: SavedPhone = { token: "t", bot: "shop_bot", owner: { chatId: OWNER, name: "Alex" } };
let current: PhoneService | undefined;
afterEach(() => current?.stop());

describe("PhoneService pairing", () => {
  it("connects with a token, then pairs with the code and turns sending on", async () => {
    const t = setup();
    current = t.service;
    await t.service.start();
    expect(t.service.state().status).toBe("off");
    const state = await t.service.connect(" 123:abc ");
    expect(state).toMatchObject({ status: "pairing", bot: "shop_bot", code: "123456" });
    expect(t.saves.at(-1)).toEqual({ token: "123:abc", bot: "shop_bot" });

    await t.text("000000");
    expect(t.service.state().status).toBe("pairing");
    await t.text("123 456");
    expect(t.service.state()).toMatchObject({ status: "connected", owner: "Alex" });
    expect(t.saves.at(-1)?.owner).toEqual({ chatId: OWNER, name: "Alex" });
    expect(t.enabled()).toBe(true);
    expect(t.messages().at(-1)).toContain("Paired with Jig");
  });

  it("refuses a token Telegram doesn't know", async () => {
    const t = setup();
    current = t.service;
    (t.api as { bad?: boolean }).bad = true;
    await expect(t.service.connect("1:x")).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("makes a new code after five wrong ones", async () => {
    const t = setup();
    current = t.service;
    let n = 0;
    (t.service as unknown as { deps: { code(): string } }).deps.code = () => `11111${n++}`;
    await t.service.connect("1:x");
    for (let i = 0; i < 5; i++) await t.text("999999");
    expect(t.service.state().code).toBe("111111");
  });

  it("forgets everything on disconnect", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.disconnect();
    expect(t.service.state().status).toBe("off");
    expect(t.saves.at(-1)).toBeUndefined();
  });
});

describe("PhoneService Jig → phone", () => {
  it("sends a waiting request with buttons, and edits it once answered on the computer", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    await t.service.permission(meta(), bash());
    expect(t.messages()).toHaveLength(1);
    expect(t.messages()[0]).toContain("npm test");
    await t.service.permission(meta(), bash("allowed"));
    const edit = t.calls.find((c) => c.method === "editMessageText");
    expect(edit?.params.text).toContain("Allowed</b> on the computer");
  });

  it("stays quiet while you're at the computer, and sends what waits once you're away", async () => {
    const t = setup({ saved: paired, settings: { when: "away" } });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    expect(t.messages()).toHaveLength(0);
    (t.service as unknown as { deps: { away(): boolean } }).deps.away = () => true;
    await t.service.sweep();
    expect(t.messages()).toHaveLength(1);
  });

  it("sends nothing while turned off", async () => {
    const t = setup({ saved: paired, settings: { enabled: false } });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    expect(t.messages()).toHaveLength(0);
    expect(await t.service.fromChat(meta(), "hi")).toContain("turned off");
  });

  it("tells a finished turn with Claude's reply", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    t.items.set("s1", [{ kind: "assistant", id: "a", text: "All tests pass." } as ChatItem]);
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(t.messages()).toEqual([expect.stringContaining("All tests pass.")]);
    expect(t.calls.at(-1)?.params.disable_notification).toBe(true);
  });

  it("buzzes for what waits for you, not for finished turns", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    expect(t.calls.at(-1)?.params).not.toHaveProperty("disable_notification");
  });

  it("keeps the computer awake while a chat works, and lets it sleep after", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.chatStatus(meta({ status: "working" }));
    expect(t.awake.at(-1)).toBe(true);
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(t.awake.at(-1)).toBe(false);
    t.settings.keepAwake = false;
    await t.service.chatStatus(meta({ status: "working" }));
    expect(t.awake.at(-1)).toBe(false);
  });

  it("remembers which message belongs to which chat across a restart", async () => {
    const first = setup({ saved: paired });
    current = first.service;
    await first.service.start();
    first.items.set("s1", []);
    await first.service.fromChat(meta(), "Deploy?");
    await first.service.flush();
    const saved = first.saves.at(-1);
    expect(saved?.replies).toEqual([[101, "s1"]]);
    first.service.stop();

    const t = setup({ saved: { ...saved!, targets: undefined } });
    current = t.service;
    await t.service.start();
    t.items.set("s1", []);
    await t.text("go ahead", {
      reply_to_message: { message_id: 101, date: NOW, chat: { id: OWNER, type: "private" } },
    });
    expect(t.sent).toEqual([{ id: "s1", text: "go ahead" }]);
  });
});

describe("PhoneService phone → Jig", () => {
  it("answers a request from a tap and marks it answered from the phone", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    await t.tap("p:0:a");
    expect(t.answers).toEqual([{ id: "s1", requestId: "r1", decision: { behavior: "allow" } }]);
    await t.service.permission(meta(), bash("allowed"));
    const edit = t.calls.find((c) => c.method === "editMessageText");
    expect(edit?.params.text).toMatch(/Allowed<\/b>\.$/);
  });

  it("ignores taps from anyone else", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    await t.tap("p:0:a", 7);
    expect(t.answers).toHaveLength(0);
  });

  it("turns a reply into the waiting request's answer", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.permission(meta(), bash());
    await t.text("use pnpm", {
      reply_to_message: { message_id: 101, date: NOW, chat: { id: OWNER, type: "private" } },
    });
    expect(t.answers[0]?.decision).toMatchObject({
      behavior: "deny",
      message: expect.stringContaining("use pnpm"),
    });
  });

  it("never sends plain text to the last chat that wrote, only to one you picked", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    t.items.set("s1", []);
    await t.service.fromChat(meta(), "Deploy?");
    await t.text("how is it going?");
    expect(t.sent).toEqual([]);
    expect(t.messages().at(-1)).toContain("Pick a chat first");
  });

  it("asks which chat when there is none yet, and /chats picks one", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.text("hello");
    expect(t.messages().at(-1)).toContain("Pick a chat first");
    t.items.set("s1", []);
    await t.tap("c:s1");
    await t.text("hello");
    expect(t.sent).toEqual([{ id: "s1", text: "hello" }]);
  });

  it("ignores strangers, groups and old messages", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    t.items.set("s1", []);
    await t.service.fromChat(meta(), "Deploy?");
    await t.text("a", { chat: { id: 7, type: "private" } });
    await t.text("b", { chat: { id: OWNER, type: "group" } });
    await t.text("c", { date: NOW - 3600 });
    expect(t.sent).toHaveLength(0);
  });
});

describe("PhoneService topics", () => {
  const sends = (t: ReturnType<typeof setup>) => t.calls.filter((c) => c.method === "sendMessage");

  it("puts each project's chats in a topic of its own, made once", async () => {
    const t = setup({ saved: paired, topics: true });
    current = t.service;
    await t.service.start();
    expect(t.service.state().topics).toBe(true);
    await t.service.permission(meta({ projectId: "p1" }), bash());
    await t.service.fromChat(meta({ projectId: "p1" }), "Deploy?");
    const made = t.calls.filter((c) => c.method === "createForumTopic");
    expect(made).toEqual([
      {
        method: "createForumTopic",
        params: expect.objectContaining({ name: "Podium", icon_color: 7322096 }),
      },
    ]);
    expect(sends(t).map((c) => c.params.message_thread_id)).toEqual([501, 501]);
  });

  it("sends chats without a project, and the test, to Jig's own topic", async () => {
    const t = setup({ saved: paired, topics: true });
    current = t.service;
    await t.service.start();
    await t.service.test();
    await t.service.fromChat(meta(), "Hi");
    expect(t.calls.filter((c) => c.method === "createForumTopic")).toHaveLength(1);
    expect(t.calls.find((c) => c.method === "createForumTopic")?.params.name).toBe("Jig");
    expect(sends(t).map((c) => c.params.message_thread_id)).toEqual([501, 501]);
  });

  it("sends what you write in a topic to the chat you picked there, and answers in that topic", async () => {
    const t = setup({ saved: paired, topics: true });
    current = t.service;
    await t.service.start();
    t.items.set("s1", []);
    await t.service.fromChat(meta({ projectId: "p1" }), "Deploy?");
    await t.tap("c:s1", OWNER, 501);
    await t.text("yes", { message_thread_id: 501, is_topic_message: true });
    expect(t.sent).toEqual([{ id: "s1", text: "yes" }]);
    expect(sends(t).at(-1)?.params.message_thread_id).toBe(501);

    await t.text("hello?", { message_thread_id: 777, is_topic_message: true });
    expect(t.sent).toHaveLength(1);
    expect(t.messages().at(-1)).toContain("Pick a chat first");
  });

  it("makes a new topic when you deleted the old one", async () => {
    const t = setup({
      saved: { ...paired, topics: { projects: { p1: 400 } } },
      topics: true,
    });
    current = t.service;
    await t.service.start();
    t.goneTopics.add(400);
    await t.service.fromChat(meta({ projectId: "p1" }), "One");
    expect(sends(t).at(-1)?.params).not.toHaveProperty("message_thread_id");
    await t.service.fromChat(meta({ projectId: "p1" }), "Two");
    expect(sends(t).at(-1)?.params.message_thread_id).toBe(501);
  });

  it("keeps one thread when the bot has no topics", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.fromChat(meta({ projectId: "p1" }), "Deploy?");
    expect(t.calls.some((c) => c.method === "createForumTopic")).toBe(false);
    expect(sends(t)[0]?.params).not.toHaveProperty("message_thread_id");
  });
});

describe("PhoneService commands", () => {
  const last = (t: ReturnType<typeof setup>) => t.calls.filter((c) => c.method === "sendMessage").at(-1);

  it("/status tells what each project is doing", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    t.metas.set("s1", meta({ projectId: "p1", status: "needs_you", title: "Card 29992" }));
    await t.text("/status");
    const text = String(last(t)?.params.text);
    expect(text).toContain("<b>Podium</b>");
    expect(text).toContain("1 needs you");
    expect(text).toContain("queue ▶ 3 left");
    expect(text).toContain("❓ Card 29992");
    expect(text).not.toContain("<b>Jig</b>");
  });

  it("/queue podium shows its tasks, and Pause pauses it", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.text("/queue pod");
    const message = last(t)?.params;
    expect(String(message?.text)).toContain("Queue · Podium</b> · running, 2 of 4 done");
    expect(String(message?.text)).toContain("❌ Card 29992 plan\n      The build broke.");
    const markup = message?.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> };
    expect(markup.inline_keyboard[0]?.[0]?.callback_data).toBe("k:p:p1");
    await t.tap("k:p:p1");
    expect(t.queue.running).toBe(false);
    expect(String(last(t)?.params.text)).toContain("paused");
  });

  it("/queue without a project asks which, from those with tasks", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.text("/resume");
    const markup = last(t)?.params.reply_markup as { inline_keyboard: Array<Array<{ text: string }>> };
    expect(markup.inline_keyboard.map((r) => r[0]?.text)).toEqual(["Podium"]);
  });

  it("/queue in a project's topic is that project's", async () => {
    const t = setup({ saved: { ...paired, topics: { projects: { p1: 501 } } }, topics: true });
    current = t.service;
    await t.service.start();
    await t.text("/queue", { message_thread_id: 501, is_topic_message: true });
    expect(String(last(t)?.params.text)).toContain("Queue · Podium");
    expect(last(t)?.params.message_thread_id).toBe(501);
  });
});

describe("PhoneService Jig itself", () => {
  const sends = (t: ReturnType<typeof setup>) => t.calls.filter((c) => c.method === "sendMessage");

  it("sends plain text to Jig itself, saying where it was written, and its answer back there", async () => {
    const t = setup({
      saved: { ...paired, topics: { projects: { p1: 501 } } },
      topics: true,
      concierge: true,
    });
    current = t.service;
    await t.service.start();
    await t.text("look at card 29992 and make a plan", { message_thread_id: 501, is_topic_message: true });
    expect(t.asked).toEqual([
      "[Written on the phone, in the topic of project “Podium” (id p1)]\n\nlook at card 29992 and make a plan",
    ]);
    expect(t.calls.at(-1)).toMatchObject({ method: "sendChatAction", params: { message_thread_id: 501 } });

    const jig = meta({ id: "jig1", kind: "concierge", title: "Jig on your phone" });
    t.metas.set("jig1", jig);
    t.items.set("jig1", [{ kind: "assistant", id: "a", text: "Started “Card 29992 plan”." } as ChatItem]);
    await t.service.chatStatus({ ...jig, status: "working" });
    await t.service.chatStatus({ ...jig, status: "idle" });
    const answer = sends(t).at(-1)?.params;
    expect(String(answer?.text)).toContain("🤖 <b>Jig</b> · AI");
    expect(String(answer?.text)).toContain("Card 29992 plan");
    expect(answer?.message_thread_id).toBe(501);
    expect(answer).not.toHaveProperty("disable_notification");
  });

  it("answers even while you're at the computer, and a reply to its answer goes back to it", async () => {
    const t = setup({ saved: paired, settings: { when: "away" }, away: false, concierge: true });
    current = t.service;
    await t.service.start();
    await t.text("how is everything going?");
    const jig = meta({ id: "jig1", kind: "concierge" });
    t.metas.set("jig1", jig);
    t.items.set("jig1", [{ kind: "assistant", id: "a", text: "All quiet." } as ChatItem]);
    await t.service.chatStatus({ ...jig, status: "working" });
    await t.service.chatStatus({ ...jig, status: "idle" });
    expect(t.messages().at(-1)).toContain("All quiet.");
    await t.text("and podium?", {
      reply_to_message: { message_id: 101, date: NOW, chat: { id: OWNER, type: "private" } },
    });
    expect(t.asked).toHaveLength(2);
    expect(t.sent).toEqual([]);
  });

  it("goes back to Jig itself from /chats", async () => {
    const t = setup({ saved: paired, concierge: true });
    current = t.service;
    await t.service.start();
    t.items.set("s1", []);
    await t.tap("c:s1");
    await t.text("to the chat");
    expect(t.sent).toEqual([{ id: "s1", text: "to the chat" }]);
    await t.tap("c:jig");
    await t.text("to Jig");
    expect(t.asked).toEqual(["[Written on the phone, in the bot's chat]\n\nto Jig"]);
  });

  it("doesn't tell finished turns of Jig's own chat as a chat's", async () => {
    const t = setup({ saved: paired, concierge: true });
    current = t.service;
    await t.service.start();
    const jig = meta({ id: "jig1", kind: "concierge" });
    t.items.set("jig1", []);
    await t.service.chatStatus({ ...jig, status: "working" });
    await t.service.chatStatus({ ...jig, status: "idle" });
    expect(t.messages().some((m) => m.includes("Finished"))).toBe(false);
  });
});

describe("PhoneService pictures", () => {
  const tool = (name: string) =>
    ({ kind: "tool", id: "t", name, input: {}, status: "done", at: "" }) as ChatItem;

  it("a chat sends its browser page with its message, as the caption", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    const result = await t.service.fromChat(meta(), "Here's the new page. OK?", { browser: true });
    expect(result).toContain("with the picture");
    expect(t.photos).toEqual([
      {
        method: "sendPhoto",
        params: expect.objectContaining({ caption: expect.stringContaining("Here's the new page") }),
        bytes: 4,
      },
    ]);
  });

  it("a chat sends a picture file, and says when there is none", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.fromChat(meta(), "The chart", { path: "shot.png" });
    expect(t.photos).toHaveLength(1);
    expect(await t.service.fromChat(meta(), "Missing", { path: "notes.txt" })).toContain("Nothing was sent");
    expect(t.photos).toHaveLength(1);
  });

  it("sends a long text after its picture", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.service.fromChat(meta(), "x".repeat(1500), { browser: true });
    expect(t.photos[0]?.params).not.toHaveProperty("caption");
    expect(t.messages().at(-1)).toContain("xxxx");
  });

  it("/screen sends Jig's window", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await t.text("/screen");
    expect(t.photos[0]?.params.caption).toContain("Jig on your computer");
  });

  it("a finished turn that used the browser comes with its page; others don't", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    t.items.set("s1", [
      { kind: "user", id: "u", text: "fix it" } as ChatItem,
      tool("mcp__jig__jig_browser_screenshot"),
      { kind: "assistant", id: "a", text: "Fixed." } as ChatItem,
    ]);
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(t.photos[0]?.params.caption).toContain("Finished");

    t.items.set("s1", [{ kind: "user", id: "u", text: "again" } as ChatItem, tool("Bash")]);
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(t.photos).toHaveLength(1);
  });

  it("leaves the page out when screenshots are off", async () => {
    const t = setup({ saved: paired, settings: { screenshots: false } });
    current = t.service;
    await t.service.start();
    t.items.set("s1", [
      tool("mcp__jig__jig_browser_open"),
      { kind: "assistant", id: "a", text: "Done." } as ChatItem,
    ]);
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(t.photos).toHaveLength(0);
    expect(t.messages().at(-1)).toContain("Finished");
  });
});

describe("PhoneService rooms", () => {
  const user = (id: string, text: string, extra: Record<string, unknown> = {}) =>
    ({ kind: "user", id, text, at: "", ...extra }) as ChatItem;
  const said = (id: string, text: string) => ({ kind: "assistant", id, text }) as ChatItem;
  const step = (
    id: string,
    name: string,
    input: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => ({ kind: "tool", id, name, input, status: "done", at: "", ...extra }) as ChatItem;
  const inRoom = (t: ReturnType<typeof setup>, thread: number) =>
    t.calls.filter((c) => c.method === "sendMessage" && c.params.message_thread_id === thread);

  async function opened(opts: Parameters<typeof setup>[0] = {}) {
    const t = setup({ saved: paired, topics: true, ...opts });
    current = t.service;
    await t.service.start();
    t.items.set("s1", [user("u1", "fix the login"), said("a1", "On it.")]);
    await t.service.openRoom("s1");
    return t;
  }

  it("opens a chat in a topic of its own with its last turns", async () => {
    const t = await opened();
    expect(t.calls.find((c) => c.method === "createForumTopic")?.params.name).toBe("💬 Shop");
    const texts = inRoom(t, 501).map((c) => String(c.params.text));
    expect(texts[0]).toContain("This is the chat, live");
    expect(texts.slice(1)).toEqual(["🧑 <i>You:</i>\nfix the login", "On it."]);
    expect(t.saves.at(-1)?.rooms).toEqual({ s1: 501 });
  });

  it("follows the chat live: your messages from the computer, replies growing, steps and screenshots", async () => {
    const t = await opened();
    const before = inRoom(t, 501).length;
    t.items.set("s1", [
      user("u1", "fix the login"),
      said("a1", "On it."),
      user("u2", "and the logout"),
      step("t1", "Read", { file_path: "src/auth.ts" }),
      step(
        "t2",
        "mcp__jig__jig_browser_screenshot",
        {},
        { images: [{ path: "C:/shots/page.png", mime: "image/png" }] },
      ),
      said("a2", "Looking"),
    ]);
    t.service.chatChanged("s1");
    expect(t.timers).toHaveLength(1);
    t.timers.shift()!();
    await t.service.syncRoom("s1");
    const texts = inRoom(t, 501)
      .slice(before)
      .map((c) => String(c.params.text));
    expect(texts[0]).toBe("🖥 <i>You, on the computer:</i>\nand the logout");
    expect(texts[1]).toContain("✓ Read <code>auth.ts</code>");
    expect(texts.at(-1)).toBe("Looking");
    expect(t.photos).toHaveLength(1);

    // The reply grows: its message is edited, not sent again.
    t.items.set("s1", [...t.items.get("s1")!.slice(0, -1), said("a2", "Looking at the logout handler.")]);
    await t.service.syncRoom("s1");
    expect(inRoom(t, 501).slice(before)).toHaveLength(texts.length);
    expect(t.calls.filter((c) => c.method === "editMessageText").at(-1)?.params.text).toBe(
      "Looking at the logout handler.",
    );
    expect(t.photos).toHaveLength(1);
  });

  it("sends what you write in the room to the chat, and doesn't show it back", async () => {
    const t = await opened();
    await t.text("also check the tests", { message_thread_id: 501, is_topic_message: true });
    expect(t.sent).toEqual([{ id: "s1", text: "also check the tests" }]);
    const before = inRoom(t, 501).length;
    t.items.set("s1", [...t.items.get("s1")!, user("u3", "also check the tests"), said("a3", "Will do.")]);
    await t.service.syncRoom("s1");
    expect(
      inRoom(t, 501)
        .slice(before)
        .map((c) => String(c.params.text)),
    ).toEqual(["Will do."]);
  });

  it("tells a finished turn in the room, also while you're at the computer", async () => {
    const t = await opened({ settings: { when: "away" }, away: false });
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(String(inRoom(t, 501).at(-1)?.params.text)).toBe("✅ <b>Finished</b>");
  });

  it("puts what waits in the room, with its buttons", async () => {
    const t = await opened({ settings: { when: "away" }, away: false });
    t.items.set("s1", [...t.items.get("s1")!, bash()]);
    await t.service.permission(meta(), bash());
    const card = inRoom(t, 501).at(-1)?.params;
    expect(String(card?.text)).toContain("npm test");
    expect(card?.reply_markup).toBeDefined();
  });

  it("/close deletes the room's topic; the chat goes back to its project's topic", async () => {
    const t = await opened();
    await t.text("/close", { message_thread_id: 501, is_topic_message: true });
    expect(t.calls.find((c) => c.method === "deleteForumTopic")?.params.message_thread_id).toBe(501);
    expect(t.saves.at(-1)?.rooms).toEqual({});
  });

  it("offers Open chat under a chat's messages, and opens it from the button", async () => {
    const t = setup({ saved: paired, topics: true });
    current = t.service;
    await t.service.start();
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    const markup = t.calls.filter((c) => c.method === "sendMessage").at(-1)?.params.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    };
    expect(markup.inline_keyboard.at(-1)?.[0]?.callback_data).toBe("o:s1");
    await t.tap("o:s1");
    expect(t.calls.some((c) => c.method === "createForumTopic" && c.params.name === "💬 Shop")).toBe(true);
  });

  it("can't open rooms without topics", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    await expect(t.service.openRoom("s1")).rejects.toThrow(/topics/);
  });
});

describe("PhoneService notices", () => {
  it("ignores Telegram's own notices, and says so for a picture", async () => {
    const t = setup({ saved: paired, concierge: true });
    current = t.service;
    await t.service.start();
    await t.text("", { text: undefined, forum_topic_created: { name: "Jig" } });
    expect(t.messages()).toEqual([]);
    await t.text("", { text: undefined, photo: [{ file_id: "p" }] });
    expect(t.messages()).toEqual(["Jig reads text and voice messages."]);
    expect(t.asked).toEqual([]);
  });
});

describe("PhoneService voice", () => {
  const voiceNote = (t: ReturnType<typeof setup>, fileId: string, over: Record<string, unknown> = {}) =>
    t.text("", { text: undefined, voice: { file_id: fileId, duration: 3 }, ...over });

  it("hears a voice message, shows what it understood, and answers aloud", async () => {
    const t = setup({ saved: paired, concierge: true });
    current = t.service;
    await t.service.start();
    await voiceNote(t, "v1");
    expect(t.messages().at(-1)).toBe("🎙 <i>how is it going</i>");
    expect(t.asked).toEqual(["[Said in a voice message on the phone, in the bot's chat]\n\nhow is it going"]);

    const jig = meta({ id: "jig1", kind: "concierge" });
    t.metas.set("jig1", jig);
    t.items.set("jig1", [{ kind: "assistant", id: "a", text: "All **quiet**: `0` tasks." } as ChatItem]);
    await t.service.chatStatus({ ...jig, status: "working" });
    await t.service.chatStatus({ ...jig, status: "idle" });
    expect(t.voices).toHaveLength(1);
    expect(t.voices[0]!.bytes).toBe(Buffer.from("spoken:All quiet: 0 tasks.").length);

    // A typed message gets a typed answer only.
    await t.text("and now?");
    await t.service.chatStatus({ ...jig, status: "working" });
    await t.service.chatStatus({ ...jig, status: "idle" });
    expect(t.voices).toHaveLength(1);
  });

  it("says when it heard no words", async () => {
    const t = setup({ saved: paired, concierge: true });
    current = t.service;
    await t.service.start();
    await voiceNote(t, "silence");
    expect(t.messages().at(-1)).toContain("couldn't make out any words");
    expect(t.asked).toEqual([]);
  });

  it("answers a voice reply to a chat aloud when it finishes", async () => {
    const t = setup({ saved: paired });
    current = t.service;
    await t.service.start();
    t.items.set("s1", []);
    await t.service.fromChat(meta(), "Deploy?");
    await voiceNote(t, "v2", {
      reply_to_message: { message_id: 101, date: NOW, chat: { id: OWNER, type: "private" } },
    });
    expect(t.sent).toEqual([{ id: "s1", text: "how is it going" }]);
    t.items.set("s1", [{ kind: "assistant", id: "a", text: "Deployed." } as ChatItem]);
    await t.service.chatStatus(meta({ status: "working" }));
    await t.service.chatStatus(meta({ status: "idle" }));
    expect(t.voices).toHaveLength(1);
  });
});
