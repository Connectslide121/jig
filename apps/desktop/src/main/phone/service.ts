import type { ChatItem, PermissionDecision, SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import type { PhoneState } from "../../shared/phone";
import {
  answeredLine,
  chatPicker,
  chatTitle,
  codeIn,
  conciergeReply,
  escapeHtml,
  excerpt,
  findProject,
  HELP,
  HELP_TOPICS,
  isUserChat,
  lastReply,
  type OutMessage,
  optionDecision,
  overviewMessage,
  type PermissionItem,
  type ProjectInfo,
  parseTap,
  permissionMessage,
  projectPicker,
  type QueueCounts,
  type QueueView,
  queueMessage,
  replyDecision,
  statusMessage,
  tapDecision,
  usedBrowser,
} from "./messages";
import { chunkMarkdown, historyItems, roomPieces, toTelegramHtml } from "./mirror";
import {
  keyboard,
  nameOf,
  type TelegramApi,
  TelegramError,
  type TelegramUpdate,
  type TelegramUser,
} from "./telegram";

/** What is kept on this computer: the bot, its token (encrypted by the store) and who it is paired with. */
export interface SavedPhone {
  token: string;
  bot: string;
  owner?: { chatId: number; name: string };
  /** Telegram message → the chat it was about (the latest), so replies still work after a restart. */
  replies?: Array<[number, string]>;
  /** Per thread (a topic's id, 0 without topics): the chat plain text written there goes to. */
  targets?: Array<[number, string]>;
  /** The topics Jig made in your bot's chat: its own and one per project. */
  topics?: { jig?: number; projects?: Record<string, number> };
  /** Chats open as rooms on your phone: chat id → its topic. */
  rooms?: Record<string, number>;
}

/** A chat open as a room: what was there when it opened, what it shows, your messages from the phone. */
interface Room {
  thread: number;
  known: Set<string>;
  skip: Set<string>;
  echo: string[];
  shown: Map<string, { messageId: number; text?: string }>;
  syncing: Promise<void>;
  again: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** Telegram's topic colours, nearest to a project's colour. */
const TOPIC_COLOR: Record<string, number> = {
  jig: 16766590,
  accent: 13338331,
  info: 7322096,
  success: 9367192,
  warning: 16766590,
  danger: 16478047,
  muted: 16749490,
};

export interface PhoneSettings {
  enabled: boolean;
  when: "away" | "always";
  awayMinutes: number;
  finished: boolean;
  keepAwake: boolean;
  screenshots: boolean;
}

export interface PhoneDeps {
  chats: {
    list(): Promise<SessionMeta[]>;
    snapshot(id: string): Promise<{ meta: SessionMeta; items: ChatItem[] }>;
    send(id: string, text: string): Promise<void>;
    answer(id: string, requestId: string, decision: PermissionDecision): Promise<void>;
  };
  store: {
    load(): Promise<SavedPhone | undefined>;
    save(saved: SavedPhone | undefined): Promise<void>;
    remembered: boolean;
  };
  api(token: string): TelegramApi;
  /** A project's name and colour, for its topic. */
  project?(id: string): Promise<{ name: string; color?: string } | undefined>;
  /** Jig itself (D-350): sends what you wrote to today's chat with Jig; returns that chat's id. */
  concierge?: { ask(text: string): Promise<string> };
  /** Pictures for the phone: Jig's window, a chat's browser page, a file a chat names. */
  screens?: {
    window(): Promise<Buffer | undefined>;
    browser(sessionId: string): Promise<Buffer | undefined>;
    file(meta: SessionMeta, path: string): Promise<Buffer>;
  };
  /** Your projects, in order (for /status and /queue). */
  projects?(): Promise<ProjectInfo[]>;
  /** The Tasks add-on's queues; they throw when it's switched off. */
  queues?: {
    overview(): Promise<QueueCounts[]>;
    list(projectId: string): Promise<QueueView>;
    start(projectId: string): Promise<void>;
    pause(projectId: string): Promise<void>;
  };
  settings(): PhoneSettings;
  /** This computer has been idle for `minutes` or is locked. */
  away(minutes: number): boolean;
  /** Keep this computer from sleeping (a chat works while you're away and the phone is connected). */
  keepAwake?(on: boolean): void;
  /** Turns sending on once you pair (the `phone.enabled` setting). */
  enable(): Promise<void>;
  onChange(state: PhoneState): void;
  code(): string;
  now?(): number;
  /** Waits `ms`, then runs `fn` (a room collects a chat's changes for a moment before syncing). */
  later?(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  /** Wait between polls after an error, and after an empty answer that came back at once. */
  pause?(ms: number, signal: AbortSignal): Promise<void>;
  log?: { warn(message: string, error?: unknown): void };
}

/** Messages older than this when they arrive (Jig was closed or sending was off) are ignored. */
const STALE_SECONDS = 10 * 60;
const MAX_WRONG_CODES = 5;
const MAX_REMEMBERED = 300;
/** Telegram's longest caption under a picture. */
const CAPTION_MAX = 1024;

interface SentRequest {
  key: string;
  sessionId: string;
  requestId: string;
  messageId: number;
  text: string;
}

const defaultPause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Jig on your phone (D-350): one Telegram bot, paired with your own Telegram account by a code. It
 * tells you when a chat needs you, finishes or stops while you're away, takes Allow/Deny and answers
 * from buttons, and sends what you write to a chat. Only your account is listened to.
 */
export class PhoneService {
  private saved: SavedPhone | undefined;
  private api: TelegramApi | undefined;
  private code: string | undefined;
  private wrongCodes = 0;
  private error: string | undefined;
  private poll: AbortController | undefined;
  private offset = 0;
  /**
   * Per thread (a topic, 0 without topics): the chat your messages there go to, the last one Jig
   * told you about there or the one you picked.
   */
  private readonly targets = new Map<number, string>();
  /** Your bot has topics turned on (Bot API 9.3+): one per project and one for Jig. */
  private topics = false;
  private readonly creating = new Map<string, Promise<number | undefined>>();
  /** Jig's own chat with you, and the topic you last wrote to it in (its answers go there). */
  private conciergeId: string | undefined;
  private conciergeThread: number | undefined;
  private readonly rooms = new Map<string, Room>();
  private readonly previous = new Map<string, SessionMeta["status"]>();
  /** Telegram message → the chat it was about, so a reply goes there. */
  private readonly replies = new Map<number, string>();
  /** Waiting requests sent to the phone, by `chat/request` and by their buttons' key. */
  private readonly requests = new Map<string, SentRequest>();
  private readonly keys = new Map<string, SentRequest>();
  private readonly sending = new Set<string>();
  private readonly answeredHere = new Set<string>();
  private nextKey = 0;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly deps: PhoneDeps) {}

  async start(): Promise<void> {
    this.saved = await this.deps.store.load().catch(() => undefined);
    if (this.saved) this.api = this.deps.api(this.saved.token);
    for (const [messageId, sessionId] of this.saved?.replies ?? []) this.replies.set(messageId, sessionId);
    for (const [thread, sessionId] of this.saved?.targets ?? []) this.targets.set(thread, sessionId);
    for (const [sessionId, thread] of Object.entries(this.saved?.rooms ?? {})) {
      const items = (await this.deps.chats.snapshot(sessionId).catch(() => undefined))?.items;
      if (items) this.rooms.set(sessionId, this.newRoom(thread, items));
    }
    this.refresh();
    if (this.saved) await this.checkTopics().catch(() => undefined);
    if (this.saved?.owner) await this.setCommands();
  }

  /** The commands Telegram offers in its menu when you type "/". */
  private async setCommands(): Promise<void> {
    await this.api
      ?.call("setMyCommands", {
        commands: [
          { command: "status", description: "What every project is doing" },
          { command: "queue", description: "A project's task queue (/queue podium)" },
          { command: "pause", description: "Pause a project's queue" },
          { command: "resume", description: "Resume a project's queue" },
          { command: "screen", description: "A screenshot of Jig on your computer" },
          { command: "close", description: "Close this chat's room (the chat stays)" },
          { command: "chats", description: "Pick the chat your messages go to" },
          { command: "help", description: "What Jig on your phone does" },
        ],
      })
      .catch((error) => this.deps.log?.warn("Setting the bot's commands failed", error));
  }

  /** Asks Telegram whether your bot has topics turned on (you can switch it in @BotFather any time). */
  async checkTopics(): Promise<void> {
    if (!this.api) return;
    const me = await this.api.call<TelegramUser>("getMe");
    if (this.topics === (me.has_topics_enabled === true)) return;
    this.topics = me.has_topics_enabled === true;
    this.changed();
  }

  stop(): void {
    this.poll?.abort();
    this.poll = undefined;
  }

  /** Waits for what is being saved (tests, quitting). */
  flush(): Promise<void> {
    return this.saving;
  }

  state(): PhoneState {
    const s = this.saved;
    return {
      status: !s ? "off" : s.owner ? "connected" : "pairing",
      ...(s ? { bot: s.bot } : {}),
      ...(s?.owner ? { owner: s.owner.name } : {}),
      ...(s && !s.owner && this.code ? { code: this.code } : {}),
      remembered: this.deps.store.remembered,
      ...(s?.owner ? { topics: this.topics } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** Checks the token with Telegram, keeps it and starts pairing with a new code. */
  async connect(token: string): Promise<PhoneState> {
    const api = this.deps.api(token.trim());
    let me: TelegramUser;
    try {
      me = await api.call<TelegramUser>("getMe");
    } catch (error) {
      if (error instanceof TelegramError && (error.status === 401 || error.status === 404))
        throw new JigError(
          "invalid_token",
          "Telegram doesn't know this token. Copy it again from @BotFather.",
        );
      throw new JigError(
        "unreachable",
        "Telegram can't be reached. Check the internet connection and try again.",
      );
    }
    this.stop();
    this.saved = { token: token.trim(), bot: me.username ?? "your bot" };
    this.api = api;
    this.topics = me.has_topics_enabled === true;
    this.targets.clear();
    this.replies.clear();
    this.code = this.deps.code();
    this.wrongCodes = 0;
    this.error = undefined;
    this.offset = 0;
    await this.deps.store.save(this.saved);
    this.refresh();
    return this.state();
  }

  async disconnect(): Promise<PhoneState> {
    const owner = this.saved?.owner;
    if (owner && this.api)
      await this.api
        .call("sendMessage", {
          chat_id: owner.chatId,
          text: "Jig disconnected this bot. It won't message you any more.",
        })
        .catch(() => undefined);
    this.stop();
    this.saved = undefined;
    this.api = undefined;
    this.code = undefined;
    this.error = undefined;
    this.targets.clear();
    this.topics = false;
    this.replies.clear();
    this.requests.clear();
    this.keys.clear();
    await this.deps.store.save(undefined);
    this.changed();
    return this.state();
  }

  async test(): Promise<void> {
    if (!this.saved?.owner) throw new JigError("not_connected", "Pair your phone first.");
    await this.checkTopics().catch(() => undefined);
    await this.send(
      {
        text: this.topics
          ? "👋 A test from Jig. Each project's chats write in their own topic when they need you, finish or stop while you're away."
          : "👋 A test from Jig. When a chat needs you, finishes or stops while you're away, it shows up here.",
      },
      { thread: await this.threadFor() },
    );
  }

  /** Settings changed: polling follows `phone.enabled`. */
  refresh(): void {
    const s = this.saved;
    const wanted = Boolean(s && (!s.owner || this.deps.settings().enabled));
    if (wanted && !this.poll) void this.pollLoop();
    else if (!wanted) this.stop();
    this.updateKeepAwake();
    this.changed();
  }

  /** Awake while a chat works or waits for you, the phone is connected and the setting is on. */
  private updateKeepAwake(): void {
    const busy = [...this.previous.values()].some(
      (s) => s === "working" || s === "starting" || s === "needs_you",
    );
    this.deps.keepAwake?.(busy && this.connected() && this.deps.settings().keepAwake);
  }

  private connected(): boolean {
    return Boolean(this.saved?.owner && this.api && this.deps.settings().enabled);
  }

  /** Connected and sending, and (unless set to always) you're away from this computer. */
  private shouldTell(): boolean {
    const settings = this.deps.settings();
    return this.connected() && (settings.when === "always" || this.deps.away(settings.awayMinutes));
  }

  private changed(): void {
    this.deps.onChange(this.state());
  }

  // --- Jig → phone -------------------------------------------------------------------------------

  /** A chat's status changed: tell the phone when its turn finished or stopped. */
  async chatStatus(meta: SessionMeta): Promise<void> {
    const previous = this.previous.get(meta.id);
    this.previous.set(meta.id, meta.status);
    if (previous === meta.status) return;
    this.updateKeepAwake();
    if (meta.kind === "concierge") return this.conciergeStatus(previous, meta);
    if (this.rooms.has(meta.id)) return this.roomStatus(previous, meta);
    if (!this.shouldTell()) return;
    const settings = this.deps.settings();
    const items =
      meta.status === "idle" ? (await this.deps.chats.snapshot(meta.id).catch(() => undefined))?.items : [];
    const message = statusMessage(previous, meta, items && lastReply(items), settings.finished);
    if (!message) return;
    const photo =
      settings.screenshots && items && usedBrowser(items)
        ? await this.deps.screens?.browser(meta.id).catch(() => undefined)
        : undefined;
    await this.send(
      this.withOpen(message, meta),
      { sessionId: meta.id, thread: await this.threadFor(meta) },
      photo,
    );
  }

  /** A permission card changed in a chat: send it when it waits; update the phone's copy when answered. */
  async permission(meta: SessionMeta, item: PermissionItem): Promise<void> {
    if (meta.kind === "builder") return;
    const id = `${meta.id}/${item.request.requestId}`;
    const sent = this.requests.get(id);
    if (item.status !== "pending") {
      if (!sent) return;
      this.requests.delete(id);
      this.keys.delete(sent.key);
      const where = this.answeredHere.delete(sent.key) ? "phone" : "computer";
      await this.api
        ?.call("editMessageText", {
          chat_id: this.saved?.owner?.chatId,
          message_id: sent.messageId,
          text: sent.text + answeredLine(item, where),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        })
        .catch((error) => this.deps.log?.warn("Updating the phone's message failed", error));
      return;
    }
    const concierge = meta.kind === "concierge";
    const room = this.rooms.has(meta.id);
    if (sent || this.sending.has(id) || !(concierge || room ? this.connected() : this.shouldTell())) return;
    this.sending.add(id);
    try {
      const key = (this.nextKey++).toString(36);
      const message = this.withOpen(permissionMessage(meta, item, key), meta);
      if (room) await this.syncRoom(meta.id);
      const thread = concierge ? this.conciergeThread : await this.threadFor(meta);
      const messageId = await this.send(message, { sessionId: meta.id, thread });
      if (messageId === undefined) return;
      const request = {
        key,
        sessionId: meta.id,
        requestId: item.request.requestId,
        messageId,
        text: message.text,
      };
      this.requests.set(id, request);
      this.keys.set(key, request);
    } finally {
      this.sending.delete(id);
    }
  }

  /**
   * Every half minute: what has been waiting since before you left gets sent once you're away
   * (Claude asked while you were at the computer, then you went out).
   */
  async sweep(): Promise<void> {
    if (!this.shouldTell()) return;
    const waiting = (await this.deps.chats.list()).filter((m) => m.status === "needs_you");
    for (const meta of waiting) {
      const snapshot = await this.deps.chats.snapshot(meta.id).catch(() => undefined);
      for (const item of snapshot?.items ?? [])
        if (item.kind === "permission" && item.status === "pending") await this.permission(meta, item);
    }
  }

  /** Claude's `jig_phone_send`: a message from a chat; your reply goes back to it. */
  async fromChat(
    meta: SessionMeta,
    text: string,
    image: { path?: string; browser?: boolean } = {},
  ): Promise<string> {
    if (!this.saved?.owner)
      return "The user hasn't connected Jig to their phone (Settings → Phone), so nothing was sent.";
    if (!this.connected())
      return "The user has turned off messages to their phone in Settings → Phone, so nothing was sent.";
    let photo: Buffer | undefined;
    let note = "";
    try {
      if (image.path) photo = await this.deps.screens?.file(meta, image.path);
      else if (image.browser) {
        photo = await this.deps.screens?.browser(meta.id);
        if (!photo) note = " This chat has no browser page open, so it went without a screenshot.";
      }
    } catch (error) {
      return `Nothing was sent: ${(error as Error).message}`;
    }
    const id = await this.send(
      { text: `💬 ${chatTitle(meta)}\n\n${excerpt(text, 3000)}\n\n<i>Reply to this message to answer.</i>` },
      { sessionId: meta.id, thread: await this.threadFor(meta) },
      photo,
    );
    if (id === undefined) return "Telegram didn't take the message; nothing was sent.";
    return `Sent to the user's phone${photo ? " with the picture" : ""}.${note} Their reply, if any, arrives in this chat as their next message.`;
  }

  /** /screen: what Jig's window shows right now. */
  private async screen(here: number | undefined): Promise<void> {
    const photo = await this.deps.screens?.window().catch(() => undefined);
    if (!photo)
      return void (await this.send({ text: "Jig's window can't be captured right now." }, { thread: here }));
    await this.send({ text: "🖥 Jig on your computer, now." }, { thread: here }, photo);
  }

  /**
   * The topic a chat's messages go to: its project's (made the first time), or Jig's own for chats
   * without a project and for Jig itself. Undefined without topics: everything in one thread.
   */
  private async threadFor(meta?: Pick<SessionMeta, "projectId" | "id">): Promise<number | undefined> {
    if (!this.topics || !this.saved?.owner) return undefined;
    const room = meta?.id ? this.rooms.get(meta.id) : undefined;
    if (room) return room.thread;
    const projectId = meta?.projectId;
    const known = projectId ? this.saved.topics?.projects?.[projectId] : this.saved.topics?.jig;
    if (known) return known;
    const key = projectId ?? "";
    let pending = this.creating.get(key);
    if (!pending) {
      pending = this.createTopic(projectId).finally(() => this.creating.delete(key));
      this.creating.set(key, pending);
    }
    return pending;
  }

  private async createTopic(projectId: string | undefined): Promise<number | undefined> {
    const chatId = this.saved?.owner?.chatId;
    if (!this.api || chatId === undefined) return undefined;
    const project = projectId ? await this.deps.project?.(projectId).catch(() => undefined) : undefined;
    const name = projectId ? (project?.name ?? "Chats") : "Jig";
    try {
      const topic = await this.api.call<{ message_thread_id: number }>("createForumTopic", {
        chat_id: chatId,
        name: name.slice(0, 128),
        icon_color: TOPIC_COLOR[projectId ? (project?.color ?? "accent") : "jig"],
      });
      if (!this.saved) return undefined;
      const topics = this.saved.topics ?? {};
      this.saved = {
        ...this.saved,
        topics: projectId
          ? { ...topics, projects: { ...topics.projects, [projectId]: topic.message_thread_id } }
          : { ...topics, jig: topic.message_thread_id },
      };
      this.persist();
      return topic.message_thread_id;
    } catch (error) {
      this.deps.log?.warn("Making a topic on the phone failed", error);
      return undefined;
    }
  }

  /** You deleted a topic in Telegram: forget it, so the next message makes a new one. */
  private forgetTopic(thread: number): void {
    const topics = this.saved?.topics;
    if (!this.saved || !topics) return;
    const projects = Object.fromEntries(
      Object.entries(topics.projects ?? {}).filter(([, t]) => t !== thread),
    );
    this.saved = {
      ...this.saved,
      topics: { ...(topics.jig === thread ? {} : { jig: topics.jig }), projects },
    };
    this.targets.delete(thread);
    this.persist();
  }

  /** The project whose topic this is (undefined: Jig's own, or no topics). */
  private projectOfThread(thread: number | undefined): string | undefined {
    if (thread === undefined) return undefined;
    return Object.entries(this.saved?.topics?.projects ?? {}).find(([, t]) => t === thread)?.[0];
  }

  private async send(
    message: OutMessage,
    to: { sessionId?: string; thread?: number } = {},
    photo?: Buffer,
  ): Promise<number | undefined> {
    const chatId = this.saved?.owner?.chatId;
    const api = this.api;
    if (!api || chatId === undefined) return undefined;
    const { sessionId } = to;
    let thread = to.thread;
    const deliver = async (thread: number | undefined) => {
      const common = {
        chat_id: chatId,
        parse_mode: "HTML",
        ...(thread ? { message_thread_id: thread } : {}),
        ...(message.silent ? { disable_notification: true } : {}),
        ...(message.buttons?.length ? { reply_markup: keyboard(message.buttons) } : {}),
      };
      if (photo && message.text.length <= CAPTION_MAX)
        return api.photo<{ message_id: number }>("sendPhoto", { ...common, caption: message.text }, photo);
      if (photo)
        await api.photo(
          "sendPhoto",
          { chat_id: chatId, ...(thread ? { message_thread_id: thread } : {}), disable_notification: true },
          photo,
        );
      return api.call<{ message_id: number }>("sendMessage", {
        ...common,
        text: message.text,
        link_preview_options: { is_disabled: true },
      });
    };
    try {
      const sent = await deliver(thread).catch(async (error) => {
        if (!thread || !(error instanceof TelegramError) || !/thread not found/i.test(error.message))
          throw error;
        this.forgetTopic(thread);
        thread = undefined;
        return deliver(undefined);
      });
      if (sessionId) {
        this.remember(sent.message_id, sessionId);
        this.persist();
      }
      return sent.message_id;
    } catch (error) {
      this.deps.log?.warn("Sending to the phone failed", error);
      return undefined;
    }
  }

  private remember(messageId: number, sessionId: string) {
    this.replies.set(messageId, sessionId);
    if (this.replies.size > MAX_REMEMBERED) this.replies.delete(this.replies.keys().next().value!);
  }

  /** Keeps which message belongs to which chat, and the chat text goes to, in `phone.json`. */
  private persist(): void {
    this.saving = this.saving
      .then(async () => {
        if (!this.saved?.owner) return;
        this.saved = {
          ...this.saved,
          replies: [...this.replies],
          targets: [...this.targets],
        };
        await this.deps.store.save(this.saved);
      })
      .catch((error) => this.deps.log?.warn("Saving the phone's messages failed", error));
  }

  // --- phone → Jig -------------------------------------------------------------------------------

  private async pollLoop(): Promise<void> {
    const controller = new AbortController();
    this.poll = controller;
    const pause = this.deps.pause ?? defaultPause;
    let failures = 0;
    while (!controller.signal.aborted && this.api) {
      const started = Date.now();
      try {
        const updates = await this.api.call<TelegramUpdate[]>(
          "getUpdates",
          { offset: this.offset, timeout: 50, allowed_updates: ["message", "callback_query"] },
          AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]),
        );
        failures = 0;
        if (this.error) {
          this.error = undefined;
          this.changed();
        }
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handle(update).catch((error) =>
            this.deps.log?.warn("A message from the phone failed", error),
          );
        }
        if (!updates.length && Date.now() - started < 500) await pause(1000, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) break;
        failures++;
        const status = error instanceof TelegramError ? error.status : undefined;
        this.error =
          status === 401
            ? "Telegram no longer accepts the bot's token. Set the phone up again."
            : status === 409
              ? "Another program is reading this bot's messages. Use this bot only for Jig."
              : "Telegram can't be reached. Jig keeps trying.";
        this.changed();
        if (status === 401) break;
        await pause(Math.min(60_000, 2000 * 2 ** Math.min(failures, 5)), controller.signal);
      }
    }
    if (this.poll === controller) this.poll = undefined;
  }

  private async handle(update: TelegramUpdate): Promise<void> {
    const tap = update.callback_query;
    if (tap) return this.handleTap(tap);
    const message = update.message;
    if (message?.chat.type !== "private") return;
    const now = (this.deps.now?.() ?? Date.now()) / 1000;
    if (now - message.date > STALE_SECONDS) return;
    const owner = this.saved?.owner;
    if (!owner) return this.pair(message.chat.id, message.from, message.text ?? "");
    if (message.chat.id !== owner.chatId) return;
    // Answers go to the topic you wrote in.
    const here = message.is_topic_message ? message.message_thread_id : undefined;
    const text = message.text?.trim() ?? "";
    if (!text)
      return void (await this.send({ text: "Jig only reads text messages for now." }, { thread: here }));
    const command = /^\/(\w+)/.exec(text)?.[1]?.toLowerCase();
    if (command === "start" || command === "help")
      return void (await this.send({ text: this.help() }, { thread: here }));
    const roomChat = this.roomOfThread(here);
    if (roomChat && command === "close") return this.closeRoom(roomChat);
    if (roomChat && !command) return this.toChat(roomChat, text, message.reply_to_message?.message_id, here);
    if (command === "chats") return void (await this.send(await this.picker(here), { thread: here }));
    if (command === "screen") return this.screen(here);
    if (command === "status") return void (await this.send(await this.overview(), { thread: here }));
    if (command === "queue" || command === "pause" || command === "resume")
      return this.queueCommand(command, text.replace(/^\/\w+(@\w+)?/, ""), here);
    const replyTo = message.reply_to_message?.message_id;
    const sessionId =
      (replyTo !== undefined ? this.replies.get(replyTo) : undefined) ?? this.targets.get(here ?? 0);
    if (this.deps.concierge && (!sessionId || sessionId === this.conciergeId))
      return this.askConcierge(text, here);
    if (!sessionId) {
      const picker = await this.picker(here);
      return void (await this.send(
        { ...picker, text: `Pick a chat first, then send your message again.\n\n${picker.text}` },
        { thread: here },
      ));
    }
    await this.toChat(sessionId, text, replyTo, here);
  }

  /** Text for Jig itself: to today's chat with Jig, saying which topic it was written in. */
  private async askConcierge(text: string, here: number | undefined): Promise<void> {
    const projectId = this.projectOfThread(here);
    const project = projectId ? await this.deps.project?.(projectId).catch(() => undefined) : undefined;
    const where = projectId
      ? `the topic of project “${project?.name ?? projectId}” (id ${projectId})`
      : here === undefined
        ? "the bot's chat"
        : "Jig's topic";
    try {
      this.conciergeId = await this.deps.concierge!.ask(`[Written on the phone, in ${where}]\n\n${text}`);
      this.conciergeThread = here;
      await this.api
        ?.call("sendChatAction", {
          chat_id: this.saved?.owner?.chatId,
          action: "typing",
          ...(here ? { message_thread_id: here } : {}),
        })
        .catch(() => undefined);
    } catch (error) {
      await this.send(
        { text: `Couldn't ask Jig: ${excerpt((error as Error).message, 300)}` },
        { thread: here },
      );
    }
  }

  /** Jig's own chat ended a turn: its answer goes to the topic you asked in. */
  private async conciergeStatus(previous: SessionMeta["status"] | undefined, meta: SessionMeta) {
    if (previous !== "working" && previous !== "starting") return;
    if (!this.connected()) return;
    this.conciergeId = meta.id;
    const thread = this.conciergeThread;
    if (meta.status === "error")
      return void (await this.send(
        {
          text: `⚠️ Jig couldn't answer: ${excerpt(meta.lastError?.split("\n")[0] ?? "the turn failed.", 400)}`,
        },
        { sessionId: meta.id, thread },
      ));
    if (meta.status !== "idle") return;
    const items = (await this.deps.chats.snapshot(meta.id).catch(() => undefined))?.items ?? [];
    const reply = lastReply(items);
    if (reply) await this.send({ text: conciergeReply(reply) }, { sessionId: meta.id, thread });
  }

  // --- rooms: a chat, whole and live, in a topic of its own -------------------------------------

  private newRoom(thread: number, items: ChatItem[]): Room {
    return {
      thread,
      known: new Set(items.map((i) => i.id)),
      skip: new Set(),
      echo: [],
      shown: new Map(),
      syncing: Promise.resolve(),
      again: false,
    };
  }

  private roomOfThread(thread: number | undefined): string | undefined {
    if (thread === undefined) return undefined;
    for (const [sessionId, room] of this.rooms) if (room.thread === thread) return sessionId;
    return undefined;
  }

  /** "💬 Open chat" under a chat's message, when it can have a room and has none yet. */
  private withOpen(message: OutMessage, meta: SessionMeta): OutMessage {
    if (!this.topics || this.rooms.has(meta.id) || !isUserChat(meta)) return message;
    return {
      ...message,
      buttons: [...(message.buttons ?? []), [{ text: "💬 Open chat", data: `o:${meta.id}` }]],
    };
  }

  /**
   * Opens a chat as a room on your phone: a topic of its own with its last turns, then everything
   * that happens in it, live; what you write there goes to the chat. Needs topics.
   */
  async openRoom(sessionId: string, from?: number): Promise<void> {
    const chatId = this.saved?.owner?.chatId;
    if (!this.api || chatId === undefined) throw new JigError("not_connected", "Pair your phone first.");
    await this.checkTopics().catch(() => undefined);
    const snapshot = await this.deps.chats.snapshot(sessionId).catch(() => undefined);
    if (!snapshot) return void (await this.send({ text: "That chat no longer exists." }, { thread: from }));
    const title = chatTitle(snapshot.meta);
    if (!this.topics) {
      const text =
        "Chats open in a topic of their own: turn on topics for your bot in @BotFather first (Settings → Phone says how).";
      await this.send({ text }, { thread: from });
      throw new JigError("no_topics", text);
    }
    const open = this.rooms.get(sessionId);
    if (open)
      return void (await this.send(
        { text: `💬 ${title} is already open in its own topic.` },
        { thread: from },
      ));
    const project = snapshot.meta.projectId
      ? await this.deps.project?.(snapshot.meta.projectId).catch(() => undefined)
      : undefined;
    const topic = await this.api.call<{ message_thread_id: number }>("createForumTopic", {
      chat_id: chatId,
      name: `💬 ${snapshot.meta.title}`.slice(0, 128),
      icon_color: TOPIC_COLOR[project?.color ?? "jig"],
    });
    const room = this.newRoom(topic.message_thread_id, snapshot.items);
    this.rooms.set(sessionId, room);
    this.saved = { ...this.saved!, rooms: { ...this.saved?.rooms, [sessionId]: room.thread } };
    this.persist();
    const thread = room.thread;
    await this.send(
      {
        text: `💬 <b>${title}</b>${project ? ` · ${escapeHtml(project.name)}` : ""}\n\nThis is the chat, live: its replies, steps and screenshots arrive here, and what you write here goes to it. /close closes the room (the chat stays).`,
        silent: true,
      },
      { thread },
    );
    for (const item of historyItems(snapshot.items)) {
      if (item.kind === "user")
        await this.send({ text: `🧑 <i>You:</i>\n${toTelegramHtml(item.text)}`, silent: true }, { thread });
      else if (item.kind === "assistant")
        for (const chunk of chunkMarkdown(item.text))
          await this.send({ text: toTelegramHtml(chunk), silent: true }, { sessionId, thread });
    }
    for (const item of snapshot.items)
      if (
        item.kind === "permission" &&
        item.status === "pending" &&
        !this.requests.has(`${sessionId}/${item.request.requestId}`)
      )
        await this.permission(snapshot.meta, item);
    if (from !== undefined && from !== thread)
      await this.send({ text: `💬 Opened ${title} in its own topic.`, silent: true }, { thread: from });
  }

  /** The topic you last wrote to Jig itself in (a chat it starts opens from there). */
  askedIn(): number | undefined {
    return this.conciergeThread;
  }

  /** /close in a room: the topic goes, the chat stays. */
  async closeRoom(sessionId: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    this.rooms.delete(sessionId);
    const { [sessionId]: _closed, ...rooms } = this.saved?.rooms ?? {};
    if (this.saved) this.saved = { ...this.saved, rooms };
    this.persist();
    await this.api
      ?.call("deleteForumTopic", { chat_id: this.saved?.owner?.chatId, message_thread_id: room.thread })
      .catch((error) => this.deps.log?.warn("Deleting the room's topic failed", error));
  }

  /** A chat changed: its room syncs a moment later (changes come in bursts while Claude writes). */
  chatChanged(sessionId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room || room.timer || !this.connected()) return;
    const later = this.deps.later ?? setTimeout;
    room.timer = later(() => {
      room.timer = undefined;
      void this.syncRoom(sessionId).catch((error) => this.deps.log?.warn("Syncing a room failed", error));
    }, 1500);
  }

  /** Brings a room up to date: new messages sent, grown replies and steps edited, pictures sent once. */
  syncRoom(sessionId: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return Promise.resolve();
    room.syncing = room.syncing
      .then(() => this.syncNow(sessionId, room))
      .catch((error) => this.deps.log?.warn("Syncing a room failed", error));
    return room.syncing;
  }

  private async syncNow(sessionId: string, room: Room): Promise<void> {
    const snapshot = await this.deps.chats.snapshot(sessionId).catch(() => undefined);
    if (!snapshot || !this.api || this.rooms.get(sessionId) !== room) return;
    for (const item of snapshot.items)
      if (
        item.kind === "user" &&
        !room.known.has(item.id) &&
        !room.skip.has(item.id) &&
        !room.shown.has(`u:${item.id}`) &&
        room.echo[0] !== undefined &&
        item.text.trim() === room.echo[0]
      ) {
        room.skip.add(item.id);
        room.echo.shift();
      }
    const working = ["working", "starting"].includes(snapshot.meta.status);
    for (const piece of roomPieces(snapshot.items, room.known, room.skip, working)) {
      const shown = room.shown.get(piece.key);
      if (piece.photo) {
        if (shown) continue;
        const photo = await this.deps.screens?.file(snapshot.meta, piece.photo).catch(() => undefined);
        const messageId = photo
          ? await this.send({ text: "", silent: true }, { sessionId, thread: room.thread }, photo)
          : undefined;
        room.shown.set(piece.key, { messageId: messageId ?? 0 });
      } else if (!shown) {
        const messageId = await this.send(
          { text: piece.text!, silent: true },
          { sessionId, thread: room.thread },
        );
        if (messageId !== undefined) room.shown.set(piece.key, { messageId, text: piece.text });
      } else if (shown.text !== piece.text) {
        shown.text = piece.text;
        await this.api
          .call("editMessageText", {
            chat_id: this.saved?.owner?.chatId,
            message_id: shown.messageId,
            text: piece.text,
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          })
          .catch((error) => {
            if (!/not modified/i.test(String((error as Error).message)))
              this.deps.log?.warn("Editing a room's message failed", error);
          });
      }
    }
  }

  /** A room's chat ended a turn: the rest of it, then a line that buzzes. */
  private async roomStatus(previous: SessionMeta["status"] | undefined, meta: SessionMeta): Promise<void> {
    if (!this.connected()) return;
    const room = this.rooms.get(meta.id)!;
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = undefined;
    }
    await this.syncRoom(meta.id);
    if (previous !== "working" && previous !== "starting") return;
    if (meta.status === "idle")
      await this.send({ text: "✅ <b>Finished</b>" }, { sessionId: meta.id, thread: room.thread });
    if (meta.status === "error")
      await this.send(
        {
          text: `⚠️ <b>Stopped</b>\n\n${excerpt(meta.lastError?.split("\n")[0] ?? "The turn ended with an error.", 400)}`,
        },
        { sessionId: meta.id, thread: room.thread },
      );
  }

  /** /status: what every project is doing. */
  private async overview() {
    const [projects, chats, queues] = await Promise.all([
      this.deps.projects?.() ?? Promise.resolve([]),
      this.deps.chats.list(),
      this.deps.queues?.overview().catch(() => []) ?? Promise.resolve([]),
    ]);
    return overviewMessage(projects, chats, queues);
  }

  /** /queue, /pause, /resume: for the topic's project, or the one named ("/queue podium"). */
  private async queueCommand(
    command: "queue" | "pause" | "resume",
    words: string,
    here: number | undefined,
  ): Promise<void> {
    const projects = (await this.deps.projects?.()) ?? [];
    const topicProject = this.projectOfThread(here);
    const project =
      findProject(projects, words) ?? projects.find((p) => p.id === topicProject && !words.trim());
    const action = command === "queue" ? "q" : command === "pause" ? "p" : "r";
    if (!project) {
      const withQueues = await this.projectsWithQueues(projects);
      const text = words.trim()
        ? `No project is called “${words.trim()}”. Which one?`
        : "Which project's queue?";
      return void (await this.send(
        withQueues.length
          ? projectPicker(withQueues, action, text)
          : { text: "No project has tasks in its queue." },
        { thread: here },
      ));
    }
    await this.queueAction(action, project, here);
  }

  private async projectsWithQueues(projects: ProjectInfo[]): Promise<ProjectInfo[]> {
    const counts = (await this.deps.queues?.overview().catch(() => [])) ?? [];
    return projects.filter((p) => counts.some((c) => c.projectId === p.id && c.queued + c.active > 0));
  }

  /** Shows a project's queue, after pausing or resuming it if asked. */
  private async queueAction(action: "q" | "p" | "r", project: ProjectInfo, here: number | undefined) {
    const queues = this.deps.queues;
    if (!queues)
      return void (await this.send({ text: "The Tasks add-on isn't available." }, { thread: here }));
    try {
      if (action === "p") await queues.pause(project.id);
      if (action === "r") await queues.start(project.id);
      await this.send(queueMessage(project, await queues.list(project.id)), { thread: here });
    } catch (error) {
      await this.send(
        { text: `Couldn't reach the queue: ${excerpt((error as Error).message, 200)}` },
        { thread: here },
      );
    }
  }

  private help(): string {
    return this.topics ? HELP_TOPICS : HELP;
  }

  /** The chats to pick from: in a project's topic only that project's. */
  private async picker(thread: number | undefined) {
    const projectId = this.projectOfThread(thread);
    const chats = (await this.deps.chats.list()).filter((m) => !projectId || m.projectId === projectId);
    return chatPicker(chats, this.targets.get(thread ?? 0), 8, Boolean(this.deps.concierge), this.topics);
  }

  private async pair(chatId: number, from: TelegramUser | undefined, text: string): Promise<void> {
    if (!this.saved || !this.code) return;
    if (codeIn(text) !== this.code) {
      if (++this.wrongCodes >= MAX_WRONG_CODES) {
        this.code = this.deps.code();
        this.wrongCodes = 0;
        this.changed();
      }
      return;
    }
    this.saved = { ...this.saved, owner: { chatId, name: nameOf(from) } };
    this.code = undefined;
    await this.deps.store.save(this.saved);
    await this.deps.enable();
    await this.setCommands();
    await this.send({ text: `✅ Paired with Jig.\n\n${this.help()}` }, { thread: await this.threadFor() });
    this.changed();
  }

  /** Your text to a chat: the answer to what waits there, or a message (into the running turn). */
  private async toChat(
    sessionId: string,
    text: string,
    replyTo: number | undefined,
    here: number | undefined,
  ): Promise<void> {
    const snapshot = await this.deps.chats.snapshot(sessionId).catch(() => undefined);
    if (!snapshot) {
      this.targets.delete(here ?? 0);
      return void (await this.send(
        { text: "That chat no longer exists. /chats picks another." },
        { thread: here },
      ));
    }
    const title = chatTitle(snapshot.meta);
    const pending = snapshot.items.filter(
      (i): i is PermissionItem => i.kind === "permission" && i.status === "pending",
    );
    const replied = [...this.requests.values()].find(
      (r) => r.messageId === replyTo && r.sessionId === sessionId,
    );
    const waiting = pending.find((i) => i.request.requestId === replied?.requestId) ?? pending.at(-1);
    try {
      if (waiting) {
        const sent = this.requests.get(`${sessionId}/${waiting.request.requestId}`);
        if (sent) this.answeredHere.add(sent.key);
        await this.deps.chats.answer(
          sessionId,
          waiting.request.requestId,
          replyDecision(waiting.request, text),
        );
        await this.send({ text: `↩️ Answered in ${title}.`, silent: true }, { sessionId, thread: here });
      } else {
        const busy = ["working", "starting", "needs_you"].includes(snapshot.meta.status);
        this.rooms.get(sessionId)?.echo.push(text.trim());
        await this.deps.chats.send(sessionId, text);
        await this.send(
          { text: `↩️ Sent to ${title}${busy ? ": Claude reads it at its next step" : ""}.`, silent: true },
          { sessionId, thread: here },
        );
      }
    } catch (error) {
      await this.send(
        { text: `Couldn't send it: ${excerpt((error as Error).message, 300)}` },
        { thread: here },
      );
    }
  }

  private async handleTap(tap: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
    const answer = (text?: string) =>
      this.api
        ?.call("answerCallbackQuery", { callback_query_id: tap.id, ...(text ? { text } : {}) })
        .catch(() => undefined);
    const owner = this.saved?.owner;
    const parsed = tap.data ? parseTap(tap.data) : undefined;
    if (!owner || tap.from.id !== owner.chatId || !parsed) return void (await answer());
    const here = tap.message?.is_topic_message ? tap.message.message_thread_id : undefined;
    if (parsed.kind === "open") {
      await answer();
      return this.openRoom(parsed.sessionId, here);
    }
    if (parsed.kind === "queue") {
      await answer();
      const project = ((await this.deps.projects?.()) ?? []).find((p) => p.id === parsed.projectId);
      if (!project)
        return void (await this.send({ text: "That project no longer exists." }, { thread: here }));
      return this.queueAction(parsed.action, project, here);
    }
    if (parsed.kind === "chat" && parsed.sessionId === "jig") {
      await answer();
      this.targets.delete(here ?? 0);
      this.persist();
      return void (await this.send(
        { text: "🤖 Your messages here go to Jig itself again." },
        { thread: here },
      ));
    }
    if (parsed.kind === "chat") {
      const snapshot = await this.deps.chats.snapshot(parsed.sessionId).catch(() => undefined);
      await answer();
      if (!snapshot) return void (await this.send({ text: "That chat no longer exists." }, { thread: here }));
      this.targets.set(here ?? 0, parsed.sessionId);
      this.persist();
      const reply = lastReply(snapshot.items);
      return void (await this.send(
        {
          text: `Talking to ${chatTitle(snapshot.meta)}. Your messages here go there.${reply ? `\n\n${excerpt(reply, 800)}` : ""}`,
        },
        { sessionId: parsed.sessionId, thread: here },
      ));
    }
    const request = this.keys.get(parsed.key);
    const snapshot = request && (await this.deps.chats.snapshot(request.sessionId).catch(() => undefined));
    const item = snapshot?.items.find(
      (i): i is PermissionItem =>
        i.kind === "permission" && i.request.requestId === request?.requestId && i.status === "pending",
    );
    if (!request || !item) return void (await answer("This is no longer waiting."));
    const decision =
      parsed.kind === "option"
        ? optionDecision(item.request, parsed.index)
        : tapDecision(item.request, parsed.allow);
    if (!decision) return void (await answer());
    this.answeredHere.add(request.key);
    try {
      await this.deps.chats.answer(request.sessionId, request.requestId, decision);
      await answer("Done");
    } catch {
      this.answeredHere.delete(request.key);
      await answer("This is no longer waiting.");
    }
  }
}
