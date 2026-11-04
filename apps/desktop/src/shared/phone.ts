/**
 * Jig on your phone through a Telegram bot of your own (D-337). The bot's token never reaches the
 * renderer: it sees only this state.
 */
export interface PhoneState {
  /** off: no bot yet; pairing: waiting for the code from your Telegram; connected: paired with you. */
  status: "off" | "pairing" | "connected";
  /** The bot's username, without the @. */
  bot?: string;
  /** Your Telegram name, once paired. */
  owner?: string;
  /** The code to send the bot while pairing. */
  code?: string;
  /** The token is encrypted on this computer; false: it is kept only until Jig closes. */
  remembered: boolean;
  /** Telegram can't be reached or refused the token (Jig keeps trying while it can). */
  error?: string;
}

/** A Telegram bot token as @BotFather gives it: `123456789:AA…` (35 characters after the colon). */
export const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

export const isTelegramToken = (token: string) => TELEGRAM_TOKEN.test(token.trim());
