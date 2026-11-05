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
