import type { Button } from "./messages";

/**
 * The few Telegram Bot API calls Jig uses (D-348), over HTTPS with the bot's token. Jig asks Telegram
 * for new messages (long polling), so nothing on this computer listens to the internet.
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
  reply_to_message?: { message_id: number };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
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
}

/** The API's address; only the fake engine (tests) may point it elsewhere. */
export function telegramBase(env: Record<string, string | undefined> = process.env): string {
  return env.JIG_ENGINE === "fake" && env.JIG_TELEGRAM_API
    ? env.JIG_TELEGRAM_API
    : "https://api.telegram.org";
}

export function telegramApi(token: string, base = telegramBase()): TelegramApi {
  return {
    async call<T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
      let response: Response;
      try {
        response = await fetch(`${base}/bot${token}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params),
          signal: signal ?? AbortSignal.timeout(20_000),
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
