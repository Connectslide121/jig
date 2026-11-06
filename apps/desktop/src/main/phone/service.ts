import type { ChatItem, PermissionDecision, SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { isTeamsCredential, type PhoneChannelId, type PhoneState } from "../../shared/phone";
import {
  type Account,
  type Address,
  ChannelError,
  type MessageRef,
  type PhoneChannel,
  type PhoneCommand,
  type PhoneUpdate,
  type PhoneUser,
  type Place,
} from "./channel";
import {
  answeredLine,
  chatPicker,
  chatTitle,
  codeIn,
  escapeHtml,
  excerpt,
  findProject,
  HELP,
  HELP_TEAMS,
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
  rich,
  shortCopy,
  speakable,
  statusMessage,
  tapDecision,
  toTelegramHtml,
  usedBrowser,
} from "./messages";
import { chunkMarkdown, conciergeReply, historyItems, roomPieces } from "./mirror";
import { type TelegramApi, TelegramChannel } from "./telegram";

/**
 * What one channel keeps on this computer (D-377: each channel its own, in `phone.json`): the bot,
 * its credential (Telegram's token, the Teams relay's key; encrypted by the store) and who it is
 * paired with. Places and messages are the channel's own ids.
 */
export interface SavedPhone {
  token: string;
  bot: string;
  owner?: { chatId: Account; name: string };
  /** Message → the chat it was about (the latest), so replies still work after a restart. */
  replies?: Array<[MessageRef, string]>;
  /** Per place (a topic's id, 0 for the main chat): the chat plain text written there goes to. */
  targets?: Array<[Place, string]>;
  /** The places Jig made on the phone: its own and one per project. */
  topics?: { jig?: Place; projects?: Record<string, Place> };
  /** Chats open as rooms on your phone: chat id → its place. */
  rooms?: Record<string, Place>;
  /**
   * Channels with threads (Teams, D-380): each chat's thread (chat id → the thread and the place it
   * is in), made on the chat's first message there.
   */
  threads?: Record<string, { place: Place; parent: Place }>;
  /** The name each project's place was made or last renamed with: a renamed project renames it. */
  names?: Record<string, string>;
}

/** A chat open as a room: what was there when it opened, what it shows, your messages from the phone. */
interface Room {
  thread: Place;
  known: Set<string>;
  skip: Set<string>;
  echo: string[];
  shown: Map<string, { messageId: MessageRef; text?: string }>;
  syncing: Promise<void>;
  again: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** The commands the channel's menu offers when you type "/" (Teams: its app package's command list). */
export const COMMANDS: PhoneCommand[] = [
  { command: "status", description: "What every project is doing" },
  { command: "queue", description: "A project's task queue (/queue podium)" },
  { command: "pause", description: "Pause a project's queue" },
  { command: "resume", description: "Resume a project's queue" },
  { command: "screen", description: "A screenshot of Jig on your computer" },
  { command: "close", description: "Close this chat's room (the chat stays)" },
  { command: "chats", description: "Pick the chat your messages go to" },
  { command: "help", description: "What Jig on your phone does" },
];

const CHANNEL_NAMES: Record<PhoneChannelId, string> = { telegram: "Telegram", teams: "Teams" };

export interface PhoneSettings {
  /** The channel (`phone.channel`); missing = Telegram. */
  channel?: PhoneChannelId;
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
  /** Each channel's saved state, apart (`undefined` forgets that channel's). */
  store: {
    load(channel?: PhoneChannelId): Promise<SavedPhone | undefined>;
    save(saved: SavedPhone | undefined, channel?: PhoneChannelId): Promise<void>;
    remembered: boolean;
  };
  /** Telegram's Bot API with a token: the Telegram channel's transport. */
  api(token: string): TelegramApi;
  /** The other channels (Teams, D-370), from their credential; none: not in this version. */
  channel?(id: Exclude<PhoneChannelId, "telegram">, credential: string): PhoneChannel | undefined;
  /** A project's name and colour, for its topic. */
  project?(id: string): Promise<{ name: string; color?: string } | undefined>;
  /** Jig itself (D-350): sends what you wrote to today's chat with Jig; returns that chat's id. */
  concierge?: { ask(text: string): Promise<string> };
  /** Voice messages: what you said (Whisper), and an answer read aloud (Ogg Opus). */
  voice?: {
    transcribe(ogg: Buffer): Promise<string>;
    speak(text: string): Promise<Buffer>;
  };
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

interface SentRequest {
  key: string;
  sessionId: string;
  requestId: string;
  messageId: MessageRef;
  /** The place it was sent to (Teams updates a message in its conversation). */
  place?: Place;
  text: string;
  /** The short copy in the main chat (Teams: the full one is in the chat's thread), updated with it. */
  copy?: { messageId: MessageRef; text: string };
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
 * Jig on your phone (D-350): one bot of your own, paired with your own account by a code, through a
 * `PhoneChannel` (D-377: Telegram, or Teams later). It tells you when a chat needs you, finishes or
 * stops while you're away, takes Allow/Deny and answers from buttons, and sends what you write to a
 * chat. Only your account is listened to.
 */
export class PhoneService {
  /** The channel picked in `phone.channel`; `saved` and `channel` are its. */
  private kind: PhoneChannelId = "telegram";
  private saved: SavedPhone | undefined;
  private channel: PhoneChannel | undefined;
  private switching: Promise<void> | undefined;
  private code: string | undefined;
  private wrongCodes = 0;
  private error: string | undefined;
  private poll: AbortController | undefined;
  /** Ends the poll loop's current round (its poll or pause), so it asks the channel again at once. */
  private nudge: AbortController | undefined;
  /**
   * Per place (a topic, 0 for the main chat): the chat your messages there go to, the last one Jig
   * told you about there or the one you picked.
   */
  private readonly targets = new Map<Place, string>();
  /** The channel has places now (Telegram: the bot has topics on): one per project and one for Jig. */
  private topics = false;
  /** What limits the places, from the channel (Teams: no team yet, or General only). */
  private topicsNote: string | undefined;
  /** A thread → the place it is in (Teams: its channel), from what you wrote and the threads Jig made. */
  private readonly areas = new Map<Place, Place>();
  private readonly creating = new Map<string, Promise<Place | undefined>>();
  /** Jig's own chat with you, and the place you last wrote to it in (its answers go there). */
  private conciergeId: string | undefined;
  private conciergeThread: Place | undefined;
  private readonly rooms = new Map<string, Room>();
  /** Chats you last spoke to (a voice message): their next answer comes read aloud too. */
  private readonly spoken = new Set<string>();
  private readonly previous = new Map<string, SessionMeta["status"]>();
  /** Message → the chat it was about, so a reply goes there. */
  private readonly replies = new Map<MessageRef, string>();
  /** Waiting requests sent to the phone, by `chat/request` and by their buttons' key. */
  private readonly requests = new Map<string, SentRequest>();
  private readonly keys = new Map<string, SentRequest>();
  private readonly sending = new Set<string>();
  private readonly answeredHere = new Set<string>();
  private nextKey = 0;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly deps: PhoneDeps) {}

  async start(): Promise<void> {
    this.kind = this.deps.settings().channel ?? "telegram";
    await this.load();
    this.refresh();
    if (this.saved) await this.checkTopics().catch(() => undefined);
    if (this.saved?.owner) await this.setCommands();
  }

  /** Reads the picked channel's saved state: its credential, what was sent, its rooms. */
  private async load(): Promise<void> {
    this.saved = await this.deps.store.load(this.kind).catch(() => undefined);
    this.channel = this.saved ? this.open(this.saved.token) : undefined;
    this.replies.clear();
    this.targets.clear();
    this.rooms.clear();
    this.areas.clear();
    for (const [messageId, sessionId] of this.saved?.replies ?? []) this.replies.set(messageId, sessionId);
    for (const [thread, sessionId] of this.saved?.targets ?? []) this.targets.set(thread, sessionId);
    for (const [sessionId, { place, parent }] of Object.entries(this.saved?.threads ?? {})) {
      this.areas.set(place, parent);
      if (!this.targets.has(place)) this.targets.set(place, sessionId);
    }
    for (const [sessionId, thread] of Object.entries(this.saved?.rooms ?? {})) {
      const items = (await this.deps.chats.snapshot(sessionId).catch(() => undefined))?.items;
      if (items) this.rooms.set(sessionId, this.newRoom(thread, items));
    }
  }

  /** The picked channel with a credential; undefined when this version has no such channel. */
  private open(credential: string): PhoneChannel | undefined {
    if (this.kind === "telegram") return new TelegramChannel(this.deps.api(credential));
    return this.deps.channel?.(this.kind, credential);
  }

  /**
   * `phone.channel` changed: the old channel is parked (one at a time, D-370; D-3xx), the new one
   * read. Parking stops polling and drops what is in memory; nothing is sent, unpaired or deleted,
   * so the old channel's setup is still in `phone.json` when you switch back.
   */
  private async switchTo(kind: PhoneChannelId): Promise<void> {
    // Let a save already queued finish first: it writes the old channel's entry, under its own kind.
    await this.saving;
    this.park();
    this.kind = kind;
    await this.load();
    if (this.saved) await this.checkTopics().catch(() => undefined);
    if (this.saved?.owner) await this.setCommands();
  }

  /** The address of the paired account (a place of its chat); undefined before pairing. */
  private address(place?: Place, extra: Omit<Address, "chat" | "place"> = {}): Address | undefined {
    const chat = this.saved?.owner?.chatId;
    return chat === undefined ? undefined : { chat, ...(place !== undefined ? { place } : {}), ...extra };
  }

  /** The commands the channel offers in its menu when you type "/". */
  private async setCommands(): Promise<void> {
    if (!this.channel?.capabilities.commands || !this.channel.setCommands) return;
    await this.channel
      .setCommands(COMMANDS)
      .catch((error) => this.deps.log?.warn("Setting the bot's commands failed", error));
  }

  /**
   * Asks the channel whether it has places now (Telegram: whether your bot has topics turned on,
   * which you can switch in @BotFather any time).
   */
  async checkTopics(): Promise<void> {
    if (!this.channel) return;
    const me = await this.channel.identify();
    this.reached();
    const places = this.channel.capabilities.places && me.places;
    if (this.topics === places && this.topicsNote === me.note) return;
    this.topics = places;
    this.topicsNote = me.note;
    this.changed();
  }

  /** Each chat writes in a thread of its own inside its project's place (Teams, D-380). */
  private threads(): boolean {
    return Boolean(this.channel?.capabilities.threads);
  }

  /** What a chat's own place is called on this channel. */
  private roomWord(): "thread" | "topic" {
    return this.threads() ? "thread" : "topic";
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
      channel: this.kind,
      status: !s ? "off" : s.owner ? "connected" : "pairing",
      ...(s ? { bot: s.bot } : {}),
      ...(s?.owner ? { owner: s.owner.name } : {}),
      ...(s && !s.owner && this.code ? { code: this.code } : {}),
      remembered: this.deps.store.remembered,
      ...(s?.owner ? { topics: this.topics } : {}),
      ...(s?.owner && this.topicsNote ? { topicsNote: this.topicsNote } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** Checks the credential (Telegram's token) with the channel, keeps it and starts pairing with a new code. */
  async connect(token: string): Promise<PhoneState> {
    if (this.kind === "teams" && !isTeamsCredential(token))
      throw new JigError("invalid_token", "That isn't a Teams relay's address and key.");
    const channel = this.open(token.trim());
    if (!channel)
      throw new JigError("unavailable", `${CHANNEL_NAMES[this.kind]} isn't in this version of Jig yet.`);
    let me: { bot: string; places: boolean; note?: string };
    try {
      me = await channel.identify();
    } catch (error) {
      if (error instanceof ChannelError && error.reason === "auth")
        throw new JigError("invalid_token", error.message);
      throw new JigError(
        "unreachable",
        error instanceof ChannelError
          ? error.message
          : `${channel.name} can't be reached. Check the internet connection and try again.`,
      );
    }
    this.stop();
    this.saved = { token: token.trim(), bot: me.bot };
    this.channel = channel;
    this.topics = channel.capabilities.places && me.places;
    this.topicsNote = me.note;
    this.targets.clear();
    this.replies.clear();
    this.areas.clear();
    this.code = this.deps.code();
    this.wrongCodes = 0;
    this.error = undefined;
    await this.deps.store.save(this.saved, this.kind);
    this.refresh();
    return this.state();
  }

  /** Forgets the channel's state in memory only: the credential, pairing and places stay saved. */
  private park(): void {
    this.stop();
    this.saved = undefined;
    this.channel = undefined;
    this.code = undefined;
    this.error = undefined;
    this.targets.clear();
    this.topics = false;
    this.topicsNote = undefined;
    this.areas.clear();
    for (const room of this.rooms.values()) if (room.timer) clearTimeout(room.timer);
    this.rooms.clear();
    this.replies.clear();
    this.requests.clear();
    this.keys.clear();
    this.creating.clear();
  }

  async disconnect(): Promise<PhoneState> {
    const to = this.address();
    if (to && this.channel)
      await this.channel
        .send(to, { text: "Jig disconnected this bot. It won't message you any more." })
        .catch(() => undefined);
    if (this.channel?.unpair)
      await this.channel
        .unpair()
        .catch((error) => this.deps.log?.warn("The phone channel didn't forget the pairing", error));
    this.stop();
    this.saved = undefined;
    this.channel = undefined;
    this.code = undefined;
    this.error = undefined;
    this.targets.clear();
    this.topics = false;
    this.topicsNote = undefined;
    this.areas.clear();
    this.rooms.clear();
    this.replies.clear();
    this.requests.clear();
    this.keys.clear();
    await this.deps.store.save(undefined, this.kind);
    this.changed();
    return this.state();
  }

  /** Teams setup: what the relay has seen of the app; undefined without a channel that tells. */
  async installs(): Promise<{ app: boolean; team: boolean } | undefined> {
    return this.channel?.installs?.();
  }

  async test(): Promise<void> {
    if (!this.saved?.owner) throw new JigError("not_connected", "Pair your phone first.");
    await this.checkTopics().catch(() => undefined);
    await this.send(
      {
        text:
          this.topics && this.threads()
            ? "👋 A test from Jig. Each chat writes in its own thread of its project's channel in your Jig team; what needs you also shows up here."
            : this.topics
              ? "👋 A test from Jig. Each project's chats write in their own topic when they need you, finish or stop while you're away."
              : "👋 A test from Jig. When a chat needs you, finishes or stops while you're away, it shows up here.",
      },
      { thread: await this.threadFor() },
    );
  }

  /** Settings changed: the channel follows `phone.channel`, polling `phone.enabled`. */
  refresh(): void {
    const kind = this.deps.settings().channel ?? "telegram";
    if (this.switching) return;
    if (kind !== this.kind) {
      this.switching = this.switchTo(kind).finally(() => {
        this.switching = undefined;
        this.refresh();
      });
      return;
    }
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
    return Boolean(this.saved?.owner && this.channel && this.deps.settings().enabled);
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
    const thread = await this.threadFor(meta);
    await this.send(this.withOpen(message, meta), { sessionId: meta.id, thread }, photo);
    const reply = items && lastReply(items);
    if (meta.status === "idle" && reply) await this.speak(meta.id, reply, thread);
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
      const channel = this.channel;
      const to = this.address(sent.place);
      if (!to || !channel?.capabilities.edits) return;
      const line = answeredLine(item, where);
      await channel
        .edit(to, sent.messageId, { text: sent.text + line })
        .catch((error) => this.deps.log?.warn("Updating the phone's message failed", error));
      // Its copy in the main chat says the same, wherever it was answered.
      const main = this.address();
      if (sent.copy && main)
        await channel
          .edit(main, sent.copy.messageId, { text: sent.copy.text + line })
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
      // Teams: the full card is in the chat's thread; a short one in the main chat buzzes. Only one of
      // them notifies you: the thread's card mentions you only when there is no copy.
      const withCopy = this.threads() && thread !== undefined && !concierge;
      const messageId = await this.send(message, { sessionId: meta.id, thread, mention: !withCopy });
      if (messageId === undefined) return;
      let copy: SentRequest["copy"];
      if (withCopy) {
        const project = meta.projectId
          ? await this.deps.project?.(meta.projectId).catch(() => undefined)
          : undefined;
        const short = shortCopy(message, project?.name);
        const copyId = await this.send(short, { sessionId: meta.id });
        if (copyId !== undefined) copy = { messageId: copyId, text: short.text };
      }
      const request: SentRequest = {
        key,
        sessionId: meta.id,
        requestId: item.request.requestId,
        messageId,
        ...(thread !== undefined ? { place: thread } : {}),
        text: message.text,
        ...(copy ? { copy } : {}),
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
      { text: `💬 ${chatTitle(meta)}\n\n${rich(text, 3000)}\n\n<i>Reply to this message to answer.</i>` },
      { sessionId: meta.id, thread: await this.threadFor(meta) },
      photo,
    );
    if (id === undefined) return `${this.channelName()} didn't take the message; nothing was sent.`;
    return `Sent to the user's phone${photo ? " with the picture" : ""}.${note} Their reply, if any, arrives in this chat as their next message.`;
  }

  private channelName(): string {
    return this.channel?.name ?? CHANNEL_NAMES[this.kind];
  }

  /** /screen: what Jig's window shows right now. */
  private async screen(here: Place | undefined): Promise<void> {
    const photo = await this.deps.screens?.window().catch(() => undefined);
    if (!photo)
      return void (await this.send({ text: "Jig's window can't be captured right now." }, { thread: here }));
    await this.send({ text: "🖥 Jig on your computer, now." }, { thread: here }, photo);
  }

  /**
   * The topic a chat's messages go to: its project's (made the first time), or Jig's own for chats
   * without a project and for Jig itself. Undefined without topics: everything in one thread.
   */
  private async threadFor(
    meta?: Pick<SessionMeta, "projectId" | "id" | "title" | "kind">,
  ): Promise<Place | undefined> {
    if (!this.topics || !this.saved?.owner) return undefined;
    const room = meta?.id ? this.rooms.get(meta.id) : undefined;
    if (room) return room.thread;
    // Teams: a chat writes in its own thread; Jig itself and the rest stay in the 1:1 chat.
    if (this.threads()) return meta && isUserChat(meta) ? this.chatThread(meta) : undefined;
    return this.topicFor(meta?.projectId);
  }

  /** A project's place (made the first time, renamed with the project), or Jig's own. */
  private async topicFor(projectId: string | undefined): Promise<Place | undefined> {
    if (!this.saved?.owner) return undefined;
    const known = projectId ? this.saved.topics?.projects?.[projectId] : this.saved.topics?.jig;
    if (known !== undefined) return known;
    const key = projectId ?? "";
    let pending = this.creating.get(key);
    if (!pending) {
      pending = this.createTopic(projectId).finally(() => this.creating.delete(key));
      this.creating.set(key, pending);
    }
    return pending;
  }

  private async createTopic(projectId: string | undefined): Promise<Place | undefined> {
    const chatId = this.saved?.owner?.chatId;
    const channel = this.channel;
    if (!channel || chatId === undefined) return undefined;
    const project = projectId ? await this.deps.project?.(projectId).catch(() => undefined) : undefined;
    const name = projectId ? (project?.name ?? "Chats") : "Jig";
    try {
      const place = await channel.createPlace(chatId, {
        kind: projectId ? "project" : "jig",
        name,
        color: projectId ? (project?.color ?? "accent") : "jig",
      });
      if (!this.saved || this.channel !== channel) return undefined;
      const topics = this.saved.topics ?? {};
      this.saved = {
        ...this.saved,
        topics: projectId
          ? { ...topics, projects: { ...topics.projects, [projectId]: place } }
          : { ...topics, jig: place },
        ...(projectId ? { names: { ...this.saved.names, [projectId]: name } } : {}),
      };
      this.persist();
      return place;
    } catch (error) {
      this.deps.log?.warn("Making a topic on the phone failed", error);
      return undefined;
    }
  }

  /**
   * A chat's own thread in its project's place (Teams, D-380), made on its first message there with
   * a heading naming the chat and its project; what you write in it goes to the chat.
   */
  private async chatThread(
    meta: Pick<SessionMeta, "projectId" | "id" | "title">,
  ): Promise<Place | undefined> {
    const known = this.saved?.threads?.[meta.id];
    if (known) return known.place;
    const key = `chat:${meta.id}`;
    let pending = this.creating.get(key);
    if (!pending) {
      pending = this.createThread(meta).finally(() => this.creating.delete(key));
      this.creating.set(key, pending);
    }
    return pending;
  }

  private async createThread(
    meta: Pick<SessionMeta, "projectId" | "id" | "title">,
  ): Promise<Place | undefined> {
    const chatId = this.saved?.owner?.chatId;
    const parent = await this.topicFor(meta.projectId);
    const channel = this.channel;
    if (!channel || chatId === undefined || parent === undefined) return undefined;
    const project = meta.projectId
      ? await this.deps.project?.(meta.projectId).catch(() => undefined)
      : undefined;
    try {
      const place = await channel.createPlace(chatId, {
        kind: "chat",
        name: `💬 ${meta.title}`,
        color: project?.color ?? "jig",
        parent,
        heading: `💬 <b>${chatTitle(meta)}</b>${project ? ` · ${escapeHtml(project.name)}` : ""}`,
      });
      if (!this.saved || this.channel !== channel) return undefined;
      this.saved = { ...this.saved, threads: { ...this.saved.threads, [meta.id]: { place, parent } } };
      this.areas.set(place, parent);
      this.targets.set(place, meta.id);
      this.persist();
      return place;
    } catch (error) {
      // Its project's place was deleted: forget it, so the next message makes both again.
      if (error instanceof ChannelError && error.reason === "gone") this.forgetPlace(parent);
      this.deps.log?.warn("Making a chat's thread on the phone failed", error);
      return undefined;
    }
  }

  /**
   * Projects renamed since their places were made: the places follow (Telegram's topics, Teams'
   * channels; D-380). Runs when the projects change, and quietly does nothing for a channel that
   * can't rename.
   */
  async renameTopics(): Promise<void> {
    const chatId = this.saved?.owner?.chatId;
    const channel = this.channel;
    if (!channel?.renamePlace || chatId === undefined || !this.saved) return;
    for (const [projectId, place] of Object.entries(this.saved.topics?.projects ?? {})) {
      const project = await this.deps.project?.(projectId).catch(() => undefined);
      const before: string | undefined = this.saved?.names?.[projectId];
      if (!project || project.name === before || !this.saved) continue;
      // Places made before names were kept: remember the name, rename next time.
      if (before !== undefined)
        try {
          await channel.renamePlace(chatId, place, project.name);
        } catch (error) {
          this.deps.log?.warn("Renaming a project's place on the phone failed", error);
          continue;
        }
      this.saved = { ...this.saved, names: { ...this.saved.names, [projectId]: project.name } };
      this.persist();
    }
  }

  /**
   * You deleted a place on the phone (a topic, a channel) or the team went: forget it and what was
   * in it (chat threads, rooms), so the next message makes it again.
   */
  private forgetPlace(place: Place): void {
    const saved = this.saved;
    if (!saved) return;
    const topics = saved.topics ?? {};
    const projects = Object.fromEntries(Object.entries(topics.projects ?? {}).filter(([, t]) => t !== place));
    const inside = (p: { place: Place; parent: Place }) => p.place === place || p.parent === place;
    const threads = Object.fromEntries(Object.entries(saved.threads ?? {}).filter(([, t]) => !inside(t)));
    for (const [sessionId, t] of Object.entries(saved.threads ?? {}))
      if (inside(t)) {
        this.targets.delete(t.place);
        this.areas.delete(t.place);
        const room = this.rooms.get(sessionId);
        if (room?.thread === t.place) this.dropRoom(sessionId);
      }
    for (const [sessionId, room] of this.rooms)
      if (room.thread === place || this.areas.get(room.thread) === place) this.dropRoom(sessionId);
    this.saved = {
      ...this.saved!,
      topics: { ...(topics.jig === place ? {} : { jig: topics.jig }), projects },
      threads,
    };
    this.targets.delete(place);
    this.persist();
  }

  /** Forgets everything Jig made on the phone apart from the main chat (Teams: the team went). */
  private forgetPlaces(): void {
    if (!this.saved) return;
    for (const sessionId of [...this.rooms.keys()]) this.dropRoom(sessionId);
    for (const t of Object.values(this.saved.threads ?? {})) this.targets.delete(t.place);
    for (const t of Object.values(this.saved.topics?.projects ?? {})) this.targets.delete(t);
    this.areas.clear();
    this.saved = { ...this.saved, topics: {}, threads: {}, rooms: {} };
    this.persist();
  }

  /**
   * The project whose place this is, or whose place it is in (Teams: a post in its channel).
   * Undefined for Jig's own, no places, or a place several projects share (Teams' General).
   */
  private projectOfThread(thread: Place | undefined): string | undefined {
    if (thread === undefined) return undefined;
    const projects = Object.entries(this.saved?.topics?.projects ?? {});
    for (const place of [thread, this.areas.get(thread)]) {
      if (place === undefined) continue;
      const matches = projects.filter(([, t]) => t === place);
      if (matches.length) return matches.length === 1 ? matches[0]![0] : undefined;
    }
    return undefined;
  }

  private async send(
    message: OutMessage,
    to: { sessionId?: string; thread?: Place | undefined; mention?: boolean } = {},
    photo?: Buffer,
  ): Promise<MessageRef | undefined> {
    const channel = this.channel;
    const { sessionId } = to;
    const deliver = (place: Place | undefined) => {
      const address = this.address(place, to.mention ? { mention: true } : {});
      if (!channel || !address) return Promise.resolve(undefined);
      return channel.send(address, message, photo);
    };
    try {
      const sent = await deliver(to.thread).catch(async (error) => {
        if (!to.thread || !(error instanceof ChannelError) || error.reason !== "gone") throw error;
        // You deleted that place on the phone (a thread's: its channel): forget it, send to the main chat.
        const area = this.areas.get(to.thread);
        this.forgetPlace(to.thread);
        if (area !== undefined) this.forgetPlace(area);
        return deliver(undefined);
      });
      if (sent === undefined) return undefined;
      this.reached();
      if (sessionId) {
        this.remember(sent, sessionId);
        this.persist();
      }
      return sent;
    } catch (error) {
      this.deps.log?.warn("Sending to the phone failed", error);
      return undefined;
    }
  }

  private remember(messageId: MessageRef, sessionId: string) {
    this.replies.set(messageId, sessionId);
    if (this.replies.size > MAX_REMEMBERED) this.replies.delete(this.replies.keys().next().value!);
  }

  /** Keeps which message belongs to which chat, and the chat text goes to, in `phone.json`. */
  private persist(): void {
    const kind = this.kind;
    const channel = this.channel;
    this.saving = this.saving
      .then(async () => {
        // A parked or switched channel's entry is never written from here.
        if (!this.saved?.owner || this.kind !== kind || this.channel !== channel) return;
        this.saved = {
          ...this.saved,
          replies: [...this.replies],
          targets: [...this.targets],
        };
        await this.deps.store.save(this.saved, kind);
      })
      .catch((error) => this.deps.log?.warn("Saving the phone's messages failed", error));
  }

  // --- phone → Jig -------------------------------------------------------------------------------

  private async pollLoop(): Promise<void> {
    const controller = new AbortController();
    this.poll = controller;
    const pause = this.deps.pause ?? defaultPause;
    let failures = 0;
    for (let channel = this.channel; !controller.signal.aborted && channel; channel = this.channel) {
      const started = Date.now();
      // wake() aborts this round only: the poll or pause in progress ends and the loop asks again now.
      const nudge = new AbortController();
      this.nudge = nudge;
      const signal = AbortSignal.any([controller.signal, nudge.signal]);
      try {
        const updates = await channel.poll(signal);
        failures = 0;
        if (this.error) {
          this.error = undefined;
          this.changed();
        }
        for (const update of updates)
          await this.handle(update).catch((error) =>
            this.deps.log?.warn("A message from the phone failed", error),
          );
        if (!updates.length && Date.now() - started < 500) await pause(1000, signal);
      } catch (error) {
        if (controller.signal.aborted) break;
        // Woken (the computer resumed, or a send got through) while asking: ask again, no error.
        if (nudge.signal.aborted) {
          failures = 0;
          continue;
        }
        failures++;
        const reason = error instanceof ChannelError ? error.reason : "unreachable";
        // The credential and other-reader warnings are the channel's; anything else: it can't be reached.
        this.error =
          reason === "auth" || reason === "conflict" ? (error as Error).message : this.unreachable();
        this.changed();
        if (reason === "auth") break;
        await pause(Math.min(60_000, 2000 * 2 ** Math.min(failures, 5)), signal);
        if (nudge.signal.aborted) failures = 0;
      }
    }
    if (this.poll === controller) this.poll = undefined;
  }

  /** The poll loop's warning while the channel doesn't answer; any call that gets through clears it. */
  private unreachable(): string {
    return `${this.channelName()} can't be reached. Jig keeps trying.`;
  }

  /**
   * The computer woke from sleep or was unlocked: a poll begun before sleeping may hang until its
   * timeout and the pause after failures grows to a minute, so end both and ask the channel now.
   */
  wake(): void {
    this.nudge?.abort();
  }

  /** A call to the channel went through: an "unreachable" warning is stale (not a credential one). */
  private reached(): void {
    if (this.error !== this.unreachable()) return;
    this.error = undefined;
    this.changed();
    this.wake();
  }

  /** One update as the channel polled it. */
  private async handle(raw: unknown): Promise<void> {
    const update = this.channel?.read(raw);
    if (update?.kind === "tap") return this.handleTap(update);
    if (update?.kind === "places") return this.placesChanged(update);
    if (!update?.private) return;
    const now = (this.deps.now?.() ?? Date.now()) / 1000;
    if (now - update.date > STALE_SECONDS) return;
    const owner = this.saved?.owner;
    // The code counts only in the main chat with the bot.
    if (!owner)
      return update.place === undefined || !this.threads()
        ? this.pair(update.chat, update.from, update.text ?? "")
        : undefined;
    if (update.chat !== owner.chatId) return;
    if (update.place !== undefined && update.area !== undefined) this.areas.set(update.place, update.area);
    // Answers go to the place you wrote in.
    const here = update.place;
    let text = update.text?.trim() ?? "";
    let spoken = false;
    if (!text && update.voice) {
      text = (await this.listen(update.voice.file, update.id, here)) ?? "";
      if (!text) return;
      spoken = true;
    }
    if (!text) {
      // The channel's own notices (a topic was made, pinned…) are messages too: only answer things you sent.
      if (update.attachment)
        await this.send(
          {
            text: this.channel?.capabilities.voice
              ? "Jig reads text and voice messages."
              : "Jig reads text messages.",
          },
          { thread: here },
        );
      return;
    }
    if (spoken) this.speaking = true;
    try {
      await this.route(text, update.replyTo, here);
    } finally {
      this.speaking = false;
    }
  }

  /**
   * The bot was added to a team (it says hello in General), a place was deleted, or the team went
   * (Teams, D-380): forget what's gone and ask the channel what it has now.
   */
  private async placesChanged(update: Extract<PhoneUpdate, { kind: "places" }>): Promise<void> {
    if (!this.saved) return;
    if (update.reset) this.forgetPlaces();
    if (update.gone !== undefined) this.forgetPlace(update.gone);
    await this.checkTopics().catch(() => undefined);
    if (update.added !== undefined && this.saved?.owner && this.topics)
      await this.send(
        {
          text: this.topicsNote
            ? `👋 <b>Jig is in this team.</b>\n\nEach chat writes in a thread here, headed with its project: what it says, and what needs you (with a mention). Write in a chat's thread to talk to it.\n\n<i>${escapeHtml(this.topicsNote)}</i>`
            : "👋 <b>Jig is in this team.</b>\n\nEach project gets a channel here on its first message, and each chat a thread in it: what it says, and what needs you (with a mention). Write in a chat's thread to talk to it; a new post in a project's channel goes to Jig itself, for that project.",
          silent: true,
        },
        { thread: update.added },
      );
  }

  /** True while handling a voice message: the chat it goes to answers read aloud. */
  private speaking = false;

  /** A voice message as text (Whisper on this computer), shown back so you see what was understood. */
  private async listen(
    file: string,
    messageId: MessageRef,
    here: Place | undefined,
  ): Promise<string | undefined> {
    const channel = this.channel;
    const to = this.address(here);
    if (!this.deps.voice || !channel?.download || !to) {
      await this.send({ text: "Voice messages need Jig's speech on this computer." }, { thread: here });
      return undefined;
    }
    try {
      await channel.typing(to).catch(() => undefined);
      const text = (await this.deps.voice.transcribe(await channel.download(file))).trim();
      if (!text) {
        await this.send({ text: "🎙 I couldn't make out any words." }, { thread: here });
        return undefined;
      }
      await channel
        .send({ ...to, replyTo: messageId }, { text: `🎙 <i>${escapeHtml(text)}</i>`, silent: true })
        .catch(() => undefined);
      return text;
    } catch (error) {
      await this.send(
        { text: `🎙 Couldn't understand the voice message: ${excerpt((error as Error).message, 200)}` },
        { thread: here },
      );
      return undefined;
    }
  }

  /** Reads an answer aloud as a voice message, after a chat you spoke to answered. */
  private async speak(sessionId: string, text: string, thread: Place | undefined): Promise<void> {
    const channel = this.channel;
    const to = this.address(thread);
    if (!this.spoken.delete(sessionId) || !this.deps.voice || !channel?.sendVoice || !to) return;
    const clean = speakable(text);
    if (!clean) return;
    try {
      const ogg = await this.deps.voice.speak(clean);
      await channel.sendVoice(to, ogg);
    } catch (error) {
      this.deps.log?.warn("Reading the answer aloud failed", error);
    }
  }

  private async route(text: string, replyTo: MessageRef | undefined, here: Place | undefined): Promise<void> {
    const command = /^\/(\w+)/.exec(text)?.[1]?.toLowerCase();
    if (command === "start" || command === "help")
      return void (await this.send({ text: this.help() }, { thread: here }));
    const roomChat = this.roomOfThread(here);
    if (roomChat && command === "close") return this.closeRoom(roomChat);
    if (command === "close")
      return void (await this.send(
        { text: `/close works in a chat's ${this.roomWord()} that follows it live.` },
        { thread: here },
      ));
    if (roomChat && !command) return this.toChat(roomChat, text, replyTo, here);
    if (command === "chats") return void (await this.send(await this.picker(here), { thread: here }));
    if (command === "screen") return this.screen(here);
    if (command === "status") return void (await this.send(await this.overview(), { thread: here }));
    if (command === "queue" || command === "pause" || command === "resume")
      return this.queueCommand(command, text.replace(/^\/\w+(@\w+)?/, ""), here);
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
  private async askConcierge(text: string, here: Place | undefined): Promise<void> {
    const projectId = this.projectOfThread(here);
    const project = projectId ? await this.deps.project?.(projectId).catch(() => undefined) : undefined;
    const teams = this.threads();
    const where = projectId
      ? `the ${teams ? "channel" : "topic"} of project “${project?.name ?? projectId}” (id ${projectId})`
      : here === undefined
        ? "the bot's chat"
        : teams
          ? "the Jig team's General channel"
          : "Jig's topic";
    try {
      this.conciergeId = await this.deps.concierge!.ask(
        `[${this.speaking ? "Said in a voice message" : "Written"} on the phone, in ${where}]\n\n${text}`,
      );
      if (this.speaking) this.spoken.add(this.conciergeId);
      this.conciergeThread = here;
      const to = this.address(here);
      if (to) await this.channel?.typing(to).catch(() => undefined);
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
    if (reply) await this.speak(meta.id, reply, thread);
  }

  // --- rooms: a chat, whole and live, in a topic of its own -------------------------------------

  private newRoom(thread: Place, items: ChatItem[]): Room {
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

  private roomOfThread(thread: Place | undefined): string | undefined {
    if (thread === undefined) return undefined;
    for (const [sessionId, room] of this.rooms) if (room.thread === thread) return sessionId;
    return undefined;
  }

  /** "💬 Open chat" (Teams: "Open thread") under a chat's message, when it can have a room and has none yet. */
  private withOpen(message: OutMessage, meta: SessionMeta): OutMessage {
    if (!this.topics || this.rooms.has(meta.id) || !isUserChat(meta)) return message;
    const text = this.threads() ? "💬 Open thread" : "💬 Open chat";
    return {
      ...message,
      buttons: [...(message.buttons ?? []), [{ text, data: `o:${meta.id}` }]],
    };
  }

  /**
   * Opens a chat as a room on your phone: a topic of its own with its last turns, then everything
   * that happens in it, live; what you write there goes to the chat. Needs topics.
   */
  async openRoom(sessionId: string, from?: Place): Promise<void> {
    const chatId = this.saved?.owner?.chatId;
    if (!this.channel || chatId === undefined) throw new JigError("not_connected", "Pair your phone first.");
    await this.checkTopics().catch(() => undefined);
    const snapshot = await this.deps.chats.snapshot(sessionId).catch(() => undefined);
    if (!snapshot) return void (await this.send({ text: "That chat no longer exists." }, { thread: from }));
    const title = chatTitle(snapshot.meta);
    const teams = this.threads();
    const word = this.roomWord();
    if (!this.topics) {
      const text = teams
        ? "Chats open in their thread of your Jig team: add the Jig app to a private team of yours first (Settings → Phone says how)."
        : "Chats open in a topic of their own: turn on topics for your bot in @BotFather first (Settings → Phone says how).";
      await this.send({ text }, { thread: from });
      throw new JigError("no_topics", text);
    }
    const open = this.rooms.get(sessionId);
    if (open)
      return void (await this.send(
        { text: `💬 ${title} is already open in its own ${word}.` },
        { thread: from },
      ));
    const project = snapshot.meta.projectId
      ? await this.deps.project?.(snapshot.meta.projectId).catch(() => undefined)
      : undefined;
    const projectId = snapshot.meta.projectId;
    let place: Place | undefined;
    if (teams) {
      // Teams: the chat's own thread (made now if it has none) starts following it.
      place = await this.chatThread(snapshot.meta);
      if (place === undefined) {
        const text = "Jig couldn't make the chat's thread in your Jig team. Try again in a moment.";
        await this.send({ text }, { thread: from });
        throw new JigError("unavailable", text);
      }
    } else {
      const parent = projectId ? this.saved?.topics?.projects?.[projectId] : this.saved?.topics?.jig;
      place = await this.channel.createPlace(chatId, {
        kind: "chat",
        name: `💬 ${snapshot.meta.title}`,
        color: project?.color ?? "jig",
        ...(parent !== undefined ? { parent } : {}),
      });
    }
    const room = this.newRoom(place, snapshot.items);
    this.rooms.set(sessionId, room);
    this.saved = { ...this.saved!, rooms: { ...this.saved?.rooms, [sessionId]: room.thread } };
    this.persist();
    const thread = room.thread;
    await this.send(
      {
        text: teams
          ? "▶️ <b>Following the chat live.</b> Its replies, steps and screenshots arrive in this thread, and what you write here goes to it. /close stops following (the chat and the thread stay)."
          : `💬 <b>${title}</b>${project ? ` · ${escapeHtml(project.name)}` : ""}\n\nThis is the chat, live: its replies, steps and screenshots arrive here, and what you write here goes to it. /close closes the room (the chat stays).`,
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
      await this.send({ text: `💬 Opened ${title} in its own ${word}.`, silent: true }, { thread: from });
  }

  /** The topic you last wrote to Jig itself in (a chat it starts opens from there). */
  askedIn(): Place | undefined {
    return this.conciergeThread;
  }

  /** A room stops following its chat (closed, or its place is gone). */
  private dropRoom(sessionId: string): void {
    const room = this.rooms.get(sessionId);
    if (room?.timer) clearTimeout(room.timer);
    this.rooms.delete(sessionId);
    const { [sessionId]: _closed, ...rooms } = this.saved?.rooms ?? {};
    if (this.saved) this.saved = { ...this.saved, rooms };
    this.persist();
  }

  /**
   * /close in a room: the topic goes, the chat stays. Teams can't delete a thread: it stops following
   * the chat live and stays its thread (what you write there still goes to it).
   */
  async closeRoom(sessionId: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    this.dropRoom(sessionId);
    if (this.threads())
      return void (await this.send(
        {
          text: "⏹ Stopped following the chat live. Jig still writes here when it needs you, finishes or stops, and what you write here still goes to it.",
          silent: true,
        },
        { thread: room.thread },
      ));
    const chatId = this.saved?.owner?.chatId;
    if (chatId !== undefined)
      await this.channel
        ?.deletePlace(chatId, room.thread)
        .catch((error) => this.deps.log?.warn("Deleting the room's topic failed", error));
  }

  /**
   * Claude's `jig_phone_close_room`: what /close does in the room, asked from a chat. Only the room
   * goes; the chat and its work go on. Says so plainly when there is no room to close.
   */
  async closeRoomOf(sessionId: string): Promise<string> {
    if (!this.channel || this.saved?.owner?.chatId === undefined)
      return "The user's phone isn't connected to Jig, so there is no room to close.";
    const snapshot = await this.deps.chats.snapshot(sessionId).catch(() => undefined);
    if (!snapshot) return "No chat has that id, so there is no room to close.";
    const title = `“${snapshot.meta.title}”`;
    if (!this.rooms.has(sessionId))
      return `${title} has no room open on the user's phone (it's already closed or was never opened). Nothing changed.`;
    const teams = this.threads();
    await this.closeRoom(sessionId);
    return teams
      ? `The thread of ${title} on the user's phone stopped following the chat live (Teams keeps the thread; writing there still reaches the chat). The chat itself goes on.`
      : `Closed the room of ${title} on the user's phone. The chat itself goes on.`;
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
    const channel = this.channel;
    if (!snapshot || !channel || this.rooms.get(sessionId) !== room) return;
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
      } else if (shown.text !== piece.text && channel.capabilities.edits) {
        shown.text = piece.text;
        const to = this.address(room.thread);
        if (!to) continue;
        await channel.edit(to, shown.messageId, { text: piece.text! }).catch((error) => {
          if (!(error instanceof ChannelError && error.reason === "unchanged"))
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
    if (meta.status === "idle") {
      await this.send({ text: "✅ <b>Finished</b>" }, { sessionId: meta.id, thread: room.thread });
      const items = (await this.deps.chats.snapshot(meta.id).catch(() => undefined))?.items ?? [];
      const reply = lastReply(items);
      if (reply) await this.speak(meta.id, reply, room.thread);
    }
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
    here: Place | undefined,
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
  private async queueAction(action: "q" | "p" | "r", project: ProjectInfo, here: Place | undefined) {
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
    if (this.threads()) return HELP_TEAMS;
    return this.topics ? HELP_TOPICS : HELP;
  }

  /** The chats to pick from: in a project's topic only that project's. */
  private async picker(thread: Place | undefined) {
    const projectId = this.projectOfThread(thread);
    const chats = (await this.deps.chats.list()).filter((m) => !projectId || m.projectId === projectId);
    return chatPicker(
      chats,
      this.targets.get(thread ?? 0),
      8,
      Boolean(this.deps.concierge),
      this.topics,
      this.roomWord(),
    );
  }

  private async pair(chatId: Account, from: PhoneUser | undefined, text: string): Promise<void> {
    if (!this.saved || !this.code) return;
    if (codeIn(text) !== this.code) {
      if (++this.wrongCodes >= MAX_WRONG_CODES) {
        this.code = this.deps.code();
        this.wrongCodes = 0;
        this.changed();
      }
      return;
    }
    try {
      await this.channel?.pair?.(chatId);
    } catch (error) {
      this.deps.log?.warn("The phone channel refused the pairing", error);
      return;
    }
    this.saved = { ...this.saved, owner: { chatId, name: from?.name ?? "you" } };
    this.code = undefined;
    await this.deps.store.save(this.saved, this.kind);
    await this.deps.enable();
    await this.setCommands();
    await this.send({ text: `✅ Paired with Jig.\n\n${this.help()}` }, { thread: await this.threadFor() });
    this.changed();
  }

  /** Your text to a chat: the answer to what waits there, or a message (into the running turn). */
  private async toChat(
    sessionId: string,
    text: string,
    replyTo: MessageRef | undefined,
    here: Place | undefined,
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
    if (this.speaking) this.spoken.add(sessionId);
    const pending = snapshot.items.filter(
      (i): i is PermissionItem => i.kind === "permission" && i.status === "pending",
    );
    const replied = [...this.requests.values()].find(
      (r) => (r.messageId === replyTo || r.copy?.messageId === replyTo) && r.sessionId === sessionId,
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
          { text: `↩️ Sent to ${title}${busy ? ": Jig reads it at its next step" : ""}.`, silent: true },
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

  private async handleTap(tap: Extract<PhoneUpdate, { kind: "tap" }>): Promise<void> {
    const answer = (text?: string) => this.channel?.answerTap(tap.id, text).catch(() => undefined);
    const owner = this.saved?.owner;
    const parsed = tap.data ? parseTap(tap.data) : undefined;
    if (!owner || tap.from.id !== owner.chatId || !parsed) return void (await answer());
    const here = tap.place;
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
          text: `Talking to ${chatTitle(snapshot.meta)}. Your messages here go there.${reply ? `\n\n${rich(reply, 800)}` : ""}`,
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
