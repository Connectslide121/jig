import {
  MAX_IMAGE_BYTES,
  MAX_WAIT_S,
  READER_HEADER,
  RELAY_KEY_HEADER,
  type RelayUpdate,
  type SendRequest,
  type SendResult,
  type SendTarget,
  type UpdateRequest,
} from "../../../../../relay/teams/src/protocol";
import { PHONE_CHANNEL_CAPABILITIES, parseTeamsCredential } from "../../shared/phone";
import {
  type Account,
  type Address,
  ChannelError,
  type MessageRef,
  type PhoneChannel,
  type PhoneCommand,
  type PhoneUpdate,
  type Place,
} from "./channel";
import { type Button, escapeHtml, type OutMessage } from "./messages";

/**
 * Jig on your phone through your own Teams bot (D-370, phase 27): Microsoft delivers what you write
 * to the bot's relay (an Azure Function of yours, `relay/teams/`), and Jig long-polls the relay with
 * its key, like Telegram's `getUpdates`, so nothing on this computer listens to the internet. The
 * contract is `relay/teams/src/protocol.ts`. This session's channel is the 1:1 chat with the bot;
 * the team, its channels and threads come next (places, session 4).
 */

/** The relay's address; only the fake engine (tests) may point it elsewhere. */
export function teamsRelayBase(url: string, env: Record<string, string | undefined> = process.env): string {
  return env.JIG_ENGINE === "fake" && env.JIG_TEAMS_RELAY ? env.JIG_TEAMS_RELAY : url;
}

/** The relay refused a call: its HTTP status and short error code (`relay_key`, `another_reader`…). */
export class RelayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface RelayApi {
  request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T>;
}

/**
 * The relay's endpoints with its key (and which Jig polls: a stable id, so a second Jig on the same
 * relay is told apart). The key goes only in its header: never in a URL, a message or the log.
 */
export function relayApi(url: string, key: string, reader: string, base = teamsRelayBase(url)): RelayApi {
  const root = base.replace(/\/+$/, "");
  return {
    async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
      let response: Response;
      try {
        response = await fetch(`${root}/api/${path}`, {
          method,
          headers: {
            [RELAY_KEY_HEADER]: key,
            [READER_HEADER]: reader,
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: signal ?? AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new RelayError("The Teams relay can't be reached.");
      }
      const parsed = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok)
        throw new RelayError(
          `The Teams relay answered ${response.status}${parsed.error ? ` (${parsed.error})` : ""}.`,
          response.status,
          parsed.error,
        );
      return parsed as T;
    },
  };
}

// --- rendering ------------------------------------------------------------------------------------

const unescapeHtml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const PRE = /<pre>([\s\S]*?)<\/pre>/g;

/** Jig's markup as a Teams message (`textFormat: "xml"`, the same subset): line breaks as `<br>`. */
export function teamsHtml(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(PRE)) {
    out += text.slice(last, match.index).replace(/\n/g, "<br>") + match[0];
    last = match.index + match[0].length;
  }
  return out + text.slice(last).replace(/\n/g, "<br>");
}

/** Jig's markup as an Adaptive Card's Markdown (bold, italic, links; code stays plain). */
function cardMarkdown(html: string): string {
  return unescapeHtml(
    html
      .replace(/<b>([\s\S]*?)<\/b>/g, "**$1**")
      .replace(/<i>([\s\S]*?)<\/i>/g, "_$1_")
      .replace(
        /<a href="([^"]*)">([\s\S]*?)<\/a>/g,
        (_, href: string, label: string) => `[${label}](${href})`,
      )
      .replace(/<[^>]+>/g, ""),
  );
}

/** Jig's markup as plain text: the notification's preview of a card. */
export function plainText(html: string): string {
  return unescapeHtml(html.replace(/<[^>]+>/g, ""));
}

/** The card's text: a TextBlock per paragraph, `<pre>` blocks in monospace. */
function cardBlocks(text: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const prose = (part: string) => {
    for (const paragraph of part.split(/\n{2,}/)) {
      const markdown = cardMarkdown(paragraph).trim();
      if (markdown) blocks.push({ type: "TextBlock", text: markdown, wrap: true });
    }
  };
  let last = 0;
  for (const match of text.matchAll(PRE)) {
    prose(text.slice(last, match.index));
    blocks.push({
      type: "TextBlock",
      text: unescapeHtml(match[1]!.replace(/<[^>]+>/g, "")),
      wrap: true,
      fontType: "Monospace",
    });
    last = match.index + match[0].length;
  }
  prose(text.slice(last));
  return blocks;
}

/**
 * A message with buttons as an Adaptive Card 1.5 (the highest every Teams client renders, phones
 * included): its text, then a row of `Action.Submit` per row of buttons, each carrying the same
 * data as Telegram's callback (`{ jig: "p:3:a" }`), so the service reads both the same way.
 */
export function adaptiveCard(text: string, buttons: Button[][] = []): Record<string, unknown> {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      ...cardBlocks(text),
      ...buttons
        .filter((row) => row.length)
        .map((row) => ({
          type: "ActionSet",
          actions: row.map((b) => ({ type: "Action.Submit", title: b.text, data: { jig: b.data } })),
        })),
    ],
    msteams: { width: "Full" },
  };
}

/**
 * The fixed commands for the app package's `commandLists` (Teams offers them where you type in the
 * 1:1 chat; at most 10). Picking one sends its title, without a slash: `read` makes it a command.
 */
export function teamsCommandLists(commands: PhoneCommand[]) {
  return [
    {
      scopes: ["personal"],
      commands: commands
        .slice(0, 10)
        .map((c) => ({ title: c.command.slice(0, 32), description: c.description.slice(0, 128) })),
    },
  ];
}

/** Commands picked from Teams' menu arrive bare ("status", "queue shop"): only these, only like that. */
const BARE_COMMAND = /^(status|screen|close|chats|help)$/i;
const ARG_COMMAND = /^(queue|pause|resume)(\s+\S+){0,3}$/i;

/**
 * What you wrote, as text: Teams sends HTML-ish text with @mentions and, for a quoted reply, the
 * quote (whose `itemid` is the message it answers).
 */
export function readTeamsText(raw: string): { text: string; replyTo?: string } {
  const quote = /<blockquote[^>]*itemid="([^"]+)"[^>]*>[\s\S]*?<\/blockquote>/i.exec(raw);
  const text = plainText(
    raw
      .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
      .replace(/<at>[\s\S]*?<\/at>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p>/gi, "\n"),
  ).trim();
  const command = BARE_COMMAND.test(text) || ARG_COMMAND.test(text) ? `/${text}` : text;
  return { text: command, ...(quote ? { replyTo: quote[1]! } : {}) };
}

// --- the channel ----------------------------------------------------------------------------------

/** Taps older than this (Jig was closed) aren't answered: the request is long gone. */
const STALE_TAP_SECONDS = 10 * 60;
const MAX_REMEMBERED = 300;

export interface TeamsDeps {
  api: RelayApi;
  /**
   * A picture made to fit Teams' inline limit (≤ 1 MB, ≤ 1024 × 1024, PNG or JPEG); undefined when
   * it can't be. Electron's `nativeImage` in the app; the tests pass pictures through.
   */
  fit?(photo: Buffer): Buffer | undefined;
  now?(): number;
}

const remember = <K, V>(map: Map<K, V>, key: K, value: V) => {
  map.set(key, value);
  if (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value as K);
};

const isJpeg = (photo: Buffer) => photo[0] === 0xff && photo[1] === 0xd8;

/**
 * The Teams channel (D-370, D-379): the 1:1 chat with your bot, through the relay. Messages are
 * Jig's HTML subset (Teams renders it); a message with buttons is an Adaptive Card, updated when the
 * request is answered; pictures go inline. Teams has no silent messages and no voice for bots.
 */
export class TeamsChannel implements PhoneChannel<RelayUpdate> {
  readonly id = "teams" as const;
  readonly name = "Teams";
  readonly capabilities = PHONE_CHANNEL_CAPABILITIES.teams;
  /** The last update Jig has: the next poll confirms it, and the relay forgets it. */
  private after = 0;
  /** The 1:1 chat's conversation id, once seen (to update a message in it). */
  private personal: string | undefined;
  /** Each sent message's conversation, and whether it is a card (an update keeps it one). */
  private readonly sent = new Map<MessageRef, { conversationId: string; card: boolean }>();
  /** A tap's conversation, for a notice in reply ("This is no longer waiting."). */
  private readonly taps = new Map<string, string>();

  constructor(private readonly deps: TeamsDeps) {}

  private failure(error: unknown, context: "poll" | "call"): ChannelError {
    if (!(error instanceof RelayError))
      return new ChannelError("unreachable", "The Teams relay can't be reached.");
    if (error.status === 401)
      return new ChannelError("auth", "The Teams relay doesn't accept Jig's key. Set the phone up again.");
    if (error.status === 409 && error.code === "another_reader")
      return new ChannelError(
        "conflict",
        "Another Jig is reading this Teams bot's messages. Use the bot with one Jig only.",
      );
    if (error.status === 503)
      return new ChannelError(
        "other",
        "The Teams relay isn't set up yet: its settings are missing in Azure.",
      );
    if (error.status === undefined || error.status >= 500 || context === "poll")
      return new ChannelError("unreachable", "The Teams relay can't be reached.");
    return new ChannelError("other", error.message);
  }

  async identify(): Promise<{ bot: string; places: boolean }> {
    try {
      await this.deps.api.request("GET", "health");
    } catch (error) {
      throw this.failure(error, "call");
    }
    // The team, its channels and threads are the next step (phase 27 session 4): the 1:1 chat for now.
    return { bot: "Jig", places: false };
  }

  async poll(signal: AbortSignal): Promise<RelayUpdate[]> {
    let updates: RelayUpdate[];
    try {
      ({ updates } = await this.deps.api.request<{ updates: RelayUpdate[] }>(
        "GET",
        `updates?after=${this.after}&wait=${MAX_WAIT_S}`,
        undefined,
        AbortSignal.any([signal, AbortSignal.timeout((MAX_WAIT_S + 15) * 1000)]),
      ));
    } catch (error) {
      if (signal.aborted) throw error;
      throw this.failure(error, "poll");
    }
    for (const update of updates) {
      this.after = Math.max(this.after, update.cursor);
      const conversation = update.activity.conversation;
      if (conversation?.conversationType === "personal" && update.activity.type === "message")
        this.personal = conversation.id;
    }
    return updates;
  }

  read(update: RelayUpdate): PhoneUpdate | undefined {
    const a = update.activity;
    const account = a.from?.aadObjectId;
    if (a.type !== "message" || !account) return undefined;
    const from = { id: account, name: a.from?.name || "you" };
    const stamp = a.timestamp ? Date.parse(a.timestamp) : Number.NaN;
    const date = Math.floor((Number.isFinite(stamp) ? stamp : update.received) / 1000);
    const personal = a.conversation.conversationType === "personal";
    // Places (a channel, a thread in one) come with the team (session 4).
    const place = personal ? undefined : a.conversation.id;
    const value = a.value as { jig?: unknown } | undefined;
    if (typeof value?.jig === "string") {
      const now = (this.deps.now?.() ?? Date.now()) / 1000;
      if (now - date > STALE_TAP_SECONDS) return undefined;
      const id = a.id ?? `tap-${update.cursor}`;
      remember(this.taps, id, a.conversation.id);
      return { kind: "tap", id, from, data: value.jig, ...(place ? { place } : {}) };
    }
    const { text, replyTo } = readTeamsText(a.text ?? "");
    const reply = replyTo ?? a.replyToId;
    // Teams adds an HTML copy of formatted text as an attachment: only real pictures and files count.
    const attachment = (a.attachments ?? []).some((x) => x.contentType !== "text/html");
    return {
      kind: "message",
      id: a.id ?? `m-${update.cursor}`,
      date,
      chat: account,
      private: personal,
      from,
      ...(place ? { place } : {}),
      ...(reply ? { replyTo: reply } : {}),
      ...(text ? { text } : {}),
      ...(attachment && !text ? { attachment } : {}),
    };
  }

  private target(to: Address): SendTarget {
    return to.place !== undefined
      ? { kind: "conversation", conversationId: String(to.place) }
      : { kind: "personal" };
  }

  async send(to: Address, message: OutMessage, photo?: Buffer): Promise<MessageRef> {
    const card = Boolean(message.buttons?.length);
    const picture = photo ? this.picture(photo) : undefined;
    const text =
      photo && !picture
        ? `${message.text}\n\n<i>The picture was too big to send to Teams.</i>`
        : message.text;
    const request: SendRequest = {
      to: this.target(to),
      ...(card
        ? {
            card: adaptiveCard(text, message.buttons),
            summary: plainText(text).split("\n")[0]!.slice(0, 120),
          }
        : { text: teamsHtml(text) }),
      ...(picture ? { image: picture } : {}),
      // Channels only buzz for a mention; the 1:1 chat always does.
      ...(to.place !== undefined && to.mention ? { mention: true } : {}),
    };
    let result: SendResult;
    try {
      result = await this.deps.api.request<SendResult>("POST", "send", request);
    } catch (error) {
      if (to.place !== undefined && error instanceof RelayError && error.status === 404)
        throw new ChannelError("gone", "The Teams channel or thread was deleted.");
      throw this.failure(error, "call");
    }
    if (to.place === undefined) this.personal = result.conversationId;
    remember(this.sent, result.id, { conversationId: result.conversationId, card });
    return result.id;
  }

  private picture(photo: Buffer): SendRequest["image"] {
    const fitted = this.deps.fit ? this.deps.fit(photo) : photo;
    if (!fitted || fitted.length > MAX_IMAGE_BYTES) return undefined;
    const jpeg = isJpeg(fitted);
    return {
      contentType: jpeg ? "image/jpeg" : "image/png",
      data: fitted.toString("base64"),
      name: jpeg ? "screenshot.jpg" : "screenshot.png",
    };
  }

  async edit(to: Address, ref: MessageRef, message: OutMessage): Promise<void> {
    const known = this.sent.get(ref);
    const conversationId =
      known?.conversationId ?? (to.place !== undefined ? String(to.place) : this.personal);
    if (!conversationId) throw new ChannelError("other", "Jig doesn't know where that message is any more.");
    // A card stays a card (answered: its buttons go), so the message doesn't change its look.
    const card = known?.card || Boolean(message.buttons?.length);
    const request: UpdateRequest = {
      conversationId,
      ...(card ? { card: adaptiveCard(message.text, message.buttons) } : { text: teamsHtml(message.text) }),
    };
    try {
      await this.deps.api.request("PUT", `send/${encodeURIComponent(String(ref))}`, request);
    } catch (error) {
      throw this.failure(error, "call");
    }
  }

  /** The relay has no typing indicator: Teams shows the answer when it comes. */
  async typing(): Promise<void> {}

  /**
   * Teams has no notice for a tapped card (Telegram's toast): the card is updated once the request
   * is answered, so only a refusal ("This is no longer waiting.") is written back, as a message.
   */
  async answerTap(id: string, text?: string): Promise<void> {
    const conversationId = this.taps.get(id);
    this.taps.delete(id);
    if (!text || text === "Done" || !conversationId) return;
    await this.deps.api.request("POST", "send", {
      to: { kind: "conversation", conversationId },
      text: escapeHtml(text),
    } satisfies SendRequest);
  }

  async createPlace(): Promise<Place> {
    throw new ChannelError("other", "Teams channels and threads come in a later version of Jig.");
  }

  async deletePlace(): Promise<void> {}

  async pair(account: Account): Promise<void> {
    try {
      await this.deps.api.request("PUT", "pairing", { aadObjectId: String(account) });
    } catch (error) {
      throw this.failure(error, "call");
    }
  }

  async unpair(): Promise<void> {
    await this.deps.api.request("DELETE", "pairing");
    this.personal = undefined;
    this.sent.clear();
    this.taps.clear();
  }

  /** The menu lives in the app package (`teamsCommandLists`); nothing to tell the relay. */
  async setCommands(): Promise<void> {}
}

/** The Teams channel from its saved credential (`https://relay#key`); undefined when it isn't one. */
export function teamsChannel(
  credential: string,
  options: { reader: string; fit?: TeamsDeps["fit"] },
): TeamsChannel | undefined {
  const parsed = parseTeamsCredential(credential);
  if (!parsed) return undefined;
  return new TeamsChannel({
    api: relayApi(parsed.url, parsed.key, options.reader),
    ...(options.fit ? { fit: options.fit } : {}),
  });
}
