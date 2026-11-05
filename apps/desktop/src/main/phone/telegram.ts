import type { Button } from "./messages";

/**
 * The few Telegram Bot API calls Jig uses (D-350), over HTTPS with the bot's token. Jig asks Telegram
 * for new messages (long polling), so nothing on this computer listens to the internet.
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
