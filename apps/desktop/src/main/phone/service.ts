import type { ChatItem, PermissionDecision, SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import type { PhoneState } from "../../shared/phone";
import {
  answeredLine,
  chatPicker,
  chatTitle,
  codeIn,
  excerpt,
  HELP,
  lastReply,
  type OutMessage,
  optionDecision,
  type PermissionItem,
  parseTap,
  permissionMessage,
  replyDecision,
  statusMessage,
  tapDecision,
} from "./messages";
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
}

export interface PhoneSettings {
  enabled: boolean;
  when: "away" | "always";
  awayMinutes: number;
  finished: boolean;
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
  settings(): PhoneSettings;
  /** This computer has been idle for `minutes` or is locked. */
  away(minutes: number): boolean;
  /** Turns sending on once you pair (the `phone.enabled` setting). */
  enable(): Promise<void>;
  onChange(state: PhoneState): void;
  code(): string;
  now?(): number;
  /** Wait between polls after an error, and after an empty answer that came back at once. */
  pause?(ms: number, signal: AbortSignal): Promise<void>;
  log?: { warn(message: string, error?: unknown): void };
}

/** Messages older than this when they arrive (Jig was closed or sending was off) are ignored. */
const STALE_SECONDS = 10 * 60;
const MAX_WRONG_CODES = 5;
const MAX_REMEMBERED = 300;

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
 * Jig on your phone (D-348): one Telegram bot, paired with your own Telegram account by a code. It
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
  /** The chat your messages go to: the last one Jig told you about, or the one you picked. */
  private target: string | undefined;
  private readonly previous = new Map<string, SessionMeta["status"]>();
  /** Telegram message → the chat it was about, so a reply goes there. */
  private readonly replies = new Map<number, string>();
  /** Waiting requests sent to the phone, by `chat/request` and by their buttons' key. */
  private readonly requests = new Map<string, SentRequest>();
  private readonly keys = new Map<string, SentRequest>();
  private readonly sending = new Set<string>();
  private readonly answeredHere = new Set<string>();
  private nextKey = 0;

  constructor(private readonly deps: PhoneDeps) {}

  async start(): Promise<void> {
    this.saved = await this.deps.store.load().catch(() => undefined);
    if (this.saved) this.api = this.deps.api(this.saved.token);
    this.refresh();
  }

  stop(): void {
    this.poll?.abort();
    this.poll = undefined;
  }

  state(): PhoneState {
    const s = this.saved;
    return {
      status: !s ? "off" : s.owner ? "connected" : "pairing",
      ...(s ? { bot: s.bot } : {}),
      ...(s?.owner ? { owner: s.owner.name } : {}),
      ...(s && !s.owner && this.code ? { code: this.code } : {}),
      remembered: this.deps.store.remembered,
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
    this.target = undefined;
    this.replies.clear();
    this.requests.clear();
    this.keys.clear();
    await this.deps.store.save(undefined);
    this.changed();
    return this.state();
  }

  async test(): Promise<void> {
    if (!this.saved?.owner) throw new JigError("not_connected", "Pair your phone first.");
    await this.send({
      text: "👋 A test from Jig. When a chat needs you, finishes or stops while you're away, it shows up here.",
    });
  }

  /** Settings changed: polling follows `phone.enabled`. */
  refresh(): void {
    const s = this.saved;
    const wanted = Boolean(s && (!s.owner || this.deps.settings().enabled));
    if (wanted && !this.poll) void this.pollLoop();
    else if (!wanted) this.stop();
    this.changed();
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
    if (previous === meta.status || !this.shouldTell()) return;
    const settings = this.deps.settings();
    const items =
      meta.status === "idle" ? (await this.deps.chats.snapshot(meta.id).catch(() => undefined))?.items : [];
    const message = statusMessage(previous, meta, items && lastReply(items), settings.finished);
    if (message) await this.send(message, meta.id);
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
    if (sent || this.sending.has(id) || !this.shouldTell()) return;
    this.sending.add(id);
    try {
      const key = (this.nextKey++).toString(36);
      const message = permissionMessage(meta, item, key);
      const messageId = await this.send(message, meta.id);
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
  async fromChat(meta: SessionMeta, text: string): Promise<string> {
    if (!this.saved?.owner)
      return "The user hasn't connected Jig to their phone (Settings → Phone), so nothing was sent.";
    if (!this.connected())
      return "The user has turned off messages to their phone in Settings → Phone, so nothing was sent.";
    await this.send(
      { text: `💬 ${chatTitle(meta)}\n\n${excerpt(text, 3000)}\n\n<i>Reply to this message to answer.</i>` },
      meta.id,
    );
    return "Sent to the user's phone. Their reply, if any, arrives in this chat as their next message.";
  }

  private async send(message: OutMessage, sessionId?: string): Promise<number | undefined> {
    const chatId = this.saved?.owner?.chatId;
    if (!this.api || chatId === undefined) return undefined;
    try {
      const sent = await this.api.call<{ message_id: number }>("sendMessage", {
        chat_id: chatId,
        text: message.text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(message.buttons?.length ? { reply_markup: keyboard(message.buttons) } : {}),
      });
      if (sessionId) {
        this.remember(sent.message_id, sessionId);
        this.target = sessionId;
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
    const text = message.text?.trim() ?? "";
    if (!text) return void (await this.send({ text: "Jig only reads text messages for now." }));
    const command = /^\/(\w+)/.exec(text)?.[1]?.toLowerCase();
    if (command === "start" || command === "help") return void (await this.send({ text: HELP }));
    if (command === "chats")
      return void (await this.send(chatPicker(await this.deps.chats.list(), this.target)));
    const replyTo = message.reply_to_message?.message_id;
    const sessionId = (replyTo !== undefined ? this.replies.get(replyTo) : undefined) ?? this.target;
    if (!sessionId) {
      const picker = chatPicker(await this.deps.chats.list(), undefined);
      return void (await this.send({
        ...picker,
        text: `Pick a chat first, then send your message again.\n\n${picker.text}`,
      }));
    }
    await this.toChat(sessionId, text, replyTo);
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
    await this.send({ text: `✅ Paired with Jig.\n\n${HELP}` });
    this.changed();
  }

  /** Your text to a chat: the answer to what waits there, or a message (into the running turn). */
  private async toChat(sessionId: string, text: string, replyTo: number | undefined): Promise<void> {
    const snapshot = await this.deps.chats.snapshot(sessionId).catch(() => undefined);
    if (!snapshot) {
      this.target = undefined;
      return void (await this.send({ text: "That chat no longer exists. /chats picks another." }));
    }
    this.target = sessionId;
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
        await this.send({ text: `↩️ Answered in ${title}.` }, sessionId);
      } else {
        const busy = ["working", "starting", "needs_you"].includes(snapshot.meta.status);
        await this.deps.chats.send(sessionId, text);
        await this.send(
          { text: `↩️ Sent to ${title}${busy ? ": Claude reads it at its next step" : ""}.` },
          sessionId,
        );
      }
    } catch (error) {
      await this.send({ text: `Couldn't send it: ${excerpt((error as Error).message, 300)}` });
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
    if (parsed.kind === "chat") {
      const snapshot = await this.deps.chats.snapshot(parsed.sessionId).catch(() => undefined);
      await answer();
      if (!snapshot) return void (await this.send({ text: "That chat no longer exists." }));
      this.target = parsed.sessionId;
      const reply = lastReply(snapshot.items);
      return void (await this.send(
        {
          text: `Talking to ${chatTitle(snapshot.meta)}. Your messages go there.${reply ? `\n\n${excerpt(reply, 800)}` : ""}`,
        },
        parsed.sessionId,
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
    this.target = request.sessionId;
    try {
      await this.deps.chats.answer(request.sessionId, request.requestId, decision);
      await answer("Done");
    } catch {
      this.answeredHere.delete(request.key);
      await answer("This is no longer waiting.");
    }
  }
}
