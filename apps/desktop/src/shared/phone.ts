/**
 * Where Jig reaches your phone (D-377): your own Telegram bot (D-350, the default) or your own Teams
 * bot through a relay in your Azure (D-370). One at a time: the `phone.channel` setting.
 */
export const PHONE_CHANNELS = ["telegram", "teams"] as const;
export type PhoneChannelId = (typeof PHONE_CHANNELS)[number];

/** What a phone channel can do; the phone features one lacks are left out for it, like `ENGINE_CAPABILITIES`. */
export interface PhoneChannelCapabilities {
  /** Voice messages: you send them (transcribed here) and answers come back read aloud. */
  voice: boolean;
  /** Messages that arrive without a sound (finished turns); without it they buzz like the rest. */
  silent: boolean;
  /** A sent message can be edited (an answered request, a reply that grows in a room). */
  edits: boolean;
  /** Places apart from the main chat: one per project and a room per chat (Telegram's topics). */
  places: boolean;
  /** A menu of the fixed commands where you type. */
  commands: boolean;
}

export const PHONE_CHANNEL_CAPABILITIES: Record<PhoneChannelId, PhoneChannelCapabilities> = {
  // Places only while the bot has topics turned on (the service asks Telegram).
  telegram: { voice: true, silent: true, edits: true, places: true, commands: true },
  // Bots don't receive Teams voice messages; in the 1:1 chat every message buzzes (D-370).
  teams: { voice: false, silent: false, edits: true, places: true, commands: true },
};

/**
 * Jig on your phone through a bot of your own (D-350, D-370). The bot's token (or the relay's key)
 * never reaches the renderer: it sees only this state.
 */
export interface PhoneState {
  /** The channel picked in `phone.channel`; the rest of the state is that channel's. */
  channel?: PhoneChannelId;
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
  /** Once paired: your bot has topics turned on, so each project gets its own topic. */
  topics?: boolean;
  /** Telegram can't be reached or refused the token (Jig keeps trying while it can). */
  error?: string;
}

/** A Telegram bot token as @BotFather gives it: `123456789:AA…` (35 characters after the colon). */
export const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

export const isTelegramToken = (token: string) => TELEGRAM_TOKEN.test(token.trim());
