import { PHONE_CHANNEL_CAPABILITIES } from "../../shared/phone";
import {
  type Account,
  type Address,
  ChannelError,
  type MessageRef,
  type PhoneChannel,
  type PhoneCommand,
  type PhoneUpdate,
  type Place,
  type PlaceSpec,
} from "./channel";
import type { Button, OutMessage } from "./messages";

/**
 * The few Telegram Bot API calls Jig uses (D-350), over HTTPS with the bot's token, and the phone
 * channel built on them (D-377). Jig asks Telegram for new messages (long polling), so nothing on
 * this computer listens to the internet.
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  /** Only from getMe: the bot has topics turned on in private chats (Bot API 9.3). */
  has_topics_enabled?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
  reply_to_message?: { message_id: number };
  /** A voice message you recorded (Ogg Opus). */
  voice?: { file_id: string; duration: number; mime_type?: string };
  /** The topic it was written in (private chats with topics, Bot API 9.3). */
  message_thread_id?: number;
  is_topic_message?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
      message_thread_id?: number;
      is_topic_message?: boolean;
    };
  };
}

/** Telegram refused the call: `status` 401 = the token no longer works, 409 = another app reads the bot. */
export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface TelegramApi {
  call<T>(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
  /** Sends a picture (multipart): `params` as form fields, the PNG or JPEG as `photo`. */
  photo<T>(method: string, params: Record<string, unknown>, photo: Buffer): Promise<T>;
  /** Sends a voice message: `params` as form fields, the Ogg Opus file as `voice`. */
  voice<T>(params: Record<string, unknown>, ogg: Buffer): Promise<T>;
  /** Downloads a file you sent (a voice message), by its `file_id`. */
  download(fileId: string): Promise<Buffer>;
}

/** The API's address; only the fake engine (tests) may point it elsewhere. */
export function telegramBase(env: Record<string, string | undefined> = process.env): string {
  return env.JIG_ENGINE === "fake" && env.JIG_TELEGRAM_API
    ? env.JIG_TELEGRAM_API
    : "https://api.telegram.org";
}

export function telegramApi(token: string, base = telegramBase()): TelegramApi {
  const post = async <T>(method: string, init: RequestInit, signal?: AbortSignal): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${base}/bot${token}/${method}`, {
        ...init,
        method: "POST",
        signal: signal ?? AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      // Never the URL: it holds the token.
      throw new TelegramError("Telegram can't be reached.");
    }
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!response.ok || !body.ok)
      throw new TelegramError(body.description ?? `Telegram answered ${response.status}.`, response.status);
    return body.result as T;
  };
  return {
    call: <T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal) =>
      post<T>(
        method,
        { headers: { "content-type": "application/json" }, body: JSON.stringify(params) },
        signal ?? AbortSignal.timeout(20_000),
      ),
    voice: <T>(params: Record<string, unknown>, ogg: Buffer) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(params))
        if (value !== undefined) form.append(key, typeof value === "string" ? value : JSON.stringify(value));
      form.append("voice", new Blob([new Uint8Array(ogg)], { type: "audio/ogg" }), "voice.ogg");
      return post<T>("sendVoice", { body: form });
    },
    download: async (fileId: string) => {
      const file = await post<{ file_path?: string }>(
        "getFile",
        { headers: { "content-type": "application/json" }, body: JSON.stringify({ file_id: fileId }) },
        AbortSignal.timeout(20_000),
      );
      if (!file.file_path) throw new TelegramError("Telegram has no such file.");
      let response: Response;
      try {
        response = await fetch(`${base}/file/bot${token}/${file.file_path}`, {
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new TelegramError("Telegram can't be reached.");
      }
      if (!response.ok) throw new TelegramError(`Telegram answered ${response.status}.`, response.status);
      return Buffer.from(await response.arrayBuffer());
    },
    photo: <T>(method: string, params: Record<string, unknown>, photo: Buffer) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(params))
        if (value !== undefined) form.append(key, typeof value === "string" ? value : JSON.stringify(value));
      const jpeg = photo[0] === 0xff && photo[1] === 0xd8;
      form.append(
        "photo",
        new Blob([new Uint8Array(photo)], { type: jpeg ? "image/jpeg" : "image/png" }),
        jpeg ? "screenshot.jpg" : "screenshot.png",
      );
      return post<T>(method, { body: form });
    },
  };
}

/** Telegram's inline keyboard for rows of buttons. */
export const keyboard = (rows: Button[][]) => ({
  inline_keyboard: rows.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))),
});

export const nameOf = (user: TelegramUser | undefined) =>
  [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
  (user?.username ? `@${user.username}` : "you");

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

/** Telegram's longest caption under a picture. */
const CAPTION_MAX = 1024;

const where = (to: Address) => (to.place ? { message_thread_id: to.place } : {});

/**
 * Jig on your phone through your own Telegram bot (D-350, D-377): Jig's messages are Telegram HTML
 * already (`parse_mode: "HTML"`), buttons an inline keyboard, places the private chat's topics.
 */
export class TelegramChannel implements PhoneChannel<TelegramUpdate> {
  readonly id = "telegram" as const;
  readonly name = "Telegram";
  readonly capabilities = PHONE_CHANNEL_CAPABILITIES.telegram;
  private offset = 0;

  constructor(private readonly api: TelegramApi) {}

  async identify(): Promise<{ bot: string; places: boolean }> {
    let me: TelegramUser;
    try {
      me = await this.api.call<TelegramUser>("getMe");
    } catch (error) {
      if (error instanceof TelegramError && (error.status === 401 || error.status === 404))
        throw new ChannelError("auth", "Telegram doesn't know this token. Copy it again from @BotFather.");
      throw new ChannelError(
        "unreachable",
        "Telegram can't be reached. Check the internet connection and try again.",
      );
    }
    return { bot: me.username ?? "your bot", places: me.has_topics_enabled === true };
  }

  async poll(signal: AbortSignal): Promise<TelegramUpdate[]> {
    let updates: TelegramUpdate[];
    try {
      updates = await this.api.call<TelegramUpdate[]>(
        "getUpdates",
        { offset: this.offset, timeout: 50, allowed_updates: ["message", "callback_query"] },
        AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
      );
    } catch (error) {
      if (signal.aborted) throw error;
      const status = error instanceof TelegramError ? error.status : undefined;
      if (status === 401)
        throw new ChannelError("auth", "Telegram no longer accepts the bot's token. Set the phone up again.");
      if (status === 409)
        throw new ChannelError(
          "conflict",
          "Another program is reading this bot's messages. Use this bot only for Jig.",
        );
      throw new ChannelError("unreachable", "Telegram can't be reached.");
    }
    for (const update of updates) this.offset = Math.max(this.offset, update.update_id + 1);
    return updates;
  }

  read(update: TelegramUpdate): PhoneUpdate | undefined {
    const tap = update.callback_query;
    if (tap)
      return {
        kind: "tap",
        id: tap.id,
        from: { id: tap.from.id, name: nameOf(tap.from) },
        ...(tap.data !== undefined ? { data: tap.data } : {}),
        ...(tap.message?.is_topic_message && tap.message.message_thread_id
          ? { place: tap.message.message_thread_id }
          : {}),
      };
    const message = update.message;
    if (!message) return undefined;
    // Telegram's own notices (a topic was made, pinned…) are messages too: only things you sent count.
    const attachment = ["photo", "document", "video", "audio", "sticker", "video_note", "animation"].some(
      (kind) => kind in message,
    );
    return {
      kind: "message",
      id: message.message_id,
      date: message.date,
      chat: message.chat.id,
      private: message.chat.type === "private",
      ...(message.from ? { from: { id: message.from.id, name: nameOf(message.from) } } : {}),
      ...(message.is_topic_message && message.message_thread_id ? { place: message.message_thread_id } : {}),
      ...(message.reply_to_message ? { replyTo: message.reply_to_message.message_id } : {}),
      ...(message.text !== undefined ? { text: message.text } : {}),
      ...(message.voice ? { voice: { file: message.voice.file_id } } : {}),
      ...(attachment ? { attachment } : {}),
    };
  }

  async send(to: Address, message: OutMessage, photo?: Buffer): Promise<MessageRef> {
    const common = {
      chat_id: to.chat,
      parse_mode: "HTML",
      ...where(to),
      ...(message.silent ? { disable_notification: true } : {}),
      ...(message.buttons?.length ? { reply_markup: keyboard(message.buttons) } : {}),
      ...(to.replyTo !== undefined ? { reply_parameters: { message_id: to.replyTo } } : {}),
    };
    try {
      if (photo && message.text.length <= CAPTION_MAX)
        return (
          await this.api.photo<{ message_id: number }>(
            "sendPhoto",
            { ...common, caption: message.text },
            photo,
          )
        ).message_id;
      if (photo)
        await this.api.photo(
          "sendPhoto",
          { chat_id: to.chat, ...where(to), disable_notification: true },
          photo,
        );
      return (
        await this.api.call<{ message_id: number }>("sendMessage", {
          ...common,
          text: message.text,
          link_preview_options: { is_disabled: true },
        })
      ).message_id;
    } catch (error) {
      if (to.place && error instanceof TelegramError && /thread not found/i.test(error.message))
        throw new ChannelError("gone", "The topic was deleted.");
      throw error;
    }
  }

  async edit(to: Address, ref: MessageRef, message: OutMessage): Promise<void> {
    try {
      await this.api.call("editMessageText", {
        chat_id: to.chat,
        message_id: ref,
        text: message.text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(message.buttons?.length ? { reply_markup: keyboard(message.buttons) } : {}),
      });
    } catch (error) {
      const said = String((error as Error).message);
      // A card sent with a picture (an add-on's, D-468) has a caption, not text.
      if (/no text in the message/i.test(said)) return this.editCaption(to, ref, message);
      if (/not modified/i.test(said))
        throw new ChannelError("unchanged", "The message is already like this.");
      throw error;
    }
  }

  private async editCaption(to: Address, ref: MessageRef, message: OutMessage): Promise<void> {
    try {
      await this.api.call("editMessageCaption", {
        chat_id: to.chat,
        message_id: ref,
        caption: message.text.slice(0, CAPTION_MAX),
        parse_mode: "HTML",
        ...(message.buttons?.length ? { reply_markup: keyboard(message.buttons) } : {}),
      });
    } catch (error) {
      if (/not modified/i.test(String((error as Error).message)))
        throw new ChannelError("unchanged", "The message is already like this.");
      throw error;
    }
  }

  async typing(to: Address): Promise<void> {
    await this.api.call("sendChatAction", { chat_id: to.chat, action: "typing", ...where(to) });
  }

  async answerTap(id: string, text?: string): Promise<void> {
    await this.api.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  }

  async createPlace(chat: Account, place: PlaceSpec): Promise<Place> {
    const topic = await this.api.call<{ message_thread_id: number }>("createForumTopic", {
      chat_id: chat,
      name: place.name.slice(0, 128),
      icon_color: TOPIC_COLOR[place.color],
    });
    return topic.message_thread_id;
  }

  async renamePlace(chat: Account, place: Place, name: string): Promise<void> {
    await this.api.call("editForumTopic", {
      chat_id: chat,
      message_thread_id: place,
      name: name.slice(0, 128),
    });
  }

  async deletePlace(chat: Account, place: Place): Promise<void> {
    await this.api.call("deleteForumTopic", { chat_id: chat, message_thread_id: place });
  }

  async setCommands(commands: PhoneCommand[]): Promise<void> {
    await this.api.call("setMyCommands", { commands });
  }

  async sendVoice(to: Address, ogg: Buffer): Promise<void> {
    await this.api.voice({ chat_id: to.chat, ...where(to) }, ogg);
  }

  download(file: string): Promise<Buffer> {
    return this.api.download(file);
  }
}
