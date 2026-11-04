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
  const api: TelegramApi = {
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
