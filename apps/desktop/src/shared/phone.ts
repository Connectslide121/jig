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
  /**
   * Teams (D-380): each chat writes in a thread of its own inside its project's place (a channel),
   * and Jig itself, the test and a short copy of what waits for you stay in the main chat (it buzzes).
   * Without it (Telegram), a project's chats share its place and only rooms get one of their own.
   */
  threads: boolean;
}

export const PHONE_CHANNEL_CAPABILITIES: Record<PhoneChannelId, PhoneChannelCapabilities> = {
  // Places only while the bot has topics turned on (the service asks Telegram).
  telegram: { voice: true, silent: true, edits: true, places: true, commands: true, threads: false },
  // Bots don't receive Teams voice messages; in the 1:1 chat every message buzzes (D-370).
  // Places once the bot is in a team of yours: a channel per project, a thread per chat (D-380).
  teams: { voice: false, silent: false, edits: true, places: true, commands: true, threads: true },
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
  /**
   * What limits the places, in the user's words (Teams: no team yet, or rooms in General because the
   * team's owner didn't grant the app channels, D-380).
   */
  topicsNote?: string;
  /** Telegram can't be reached or refused the token (Jig keeps trying while it can). */
  error?: string;
}

/** A Telegram bot token as @BotFather gives it: `123456789:AA…` (35 characters after the colon). */
export const TELEGRAM_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

export const isTelegramToken = (token: string) => TELEGRAM_TOKEN.test(token.trim());

/**
 * The Teams channel's credential (D-379): the relay's address and its key in one string,
 * `https://<function app>#<key>`, kept like the Telegram token. The key is what setup generated
 * (≥ 32 characters, base64url).
 */
export const TEAMS_CREDENTIAL = /^https:\/\/[^\s#/]+(\/[^\s#]*)?#[A-Za-z0-9_-]{32,256}$/;

export const isTeamsCredential = (credential: string) => TEAMS_CREDENTIAL.test(credential.trim());

export const teamsCredential = (url: string, key: string) => `${url.trim().replace(/\/+$/, "")}#${key}`;

export function parseTeamsCredential(credential: string): { url: string; key: string } | undefined {
  const trimmed = credential.trim();
  if (!isTeamsCredential(trimmed)) return undefined;
  const at = trimmed.lastIndexOf("#");
  return { url: trimmed.slice(0, at), key: trimmed.slice(at + 1) };
}

/** A setup step's or command's progress in the "Set up Teams" modal (D-370, phase 27 session 5). */
export type TeamsSetupStatus = "todo" | "running" | "done" | "failed";

export interface TeamsSetupStepView {
  id: string;
  title: string;
  /** What it creates, in a few words. */
  creates: string;
  status: TeamsSetupStatus;
  /** Why it stopped (az's error, naming the tenant), shown with Retry. */
  error?: string;
  /** The commands it runs, as you'd type them: placeholders for what isn't known yet and for secrets. */
  commands: Array<{ id: string; text: string; status: TeamsSetupStatus }>;
}

/**
 * The "Set up Teams" modal's state, kept in main (D-370): where the Azure pieces go, what Create has
 * done, the app package and what the relay has seen. Never the bot's secret or the relay key.
 */
export interface TeamsSetupView {
  /** The active tenant from the top bar, as `az account show` answers for it. */
  tenant?: { id: string; name?: string; user?: string };
  /** Enabled subscriptions the sign-in sees; only those in `tenant` can be picked (D-370). */
  subscriptions: Array<{ id: string; name: string; inTenant: boolean }>;
  /** Regions with Flex Consumption for the picked subscription. */
  regions: string[];
  choice: { subscription?: string; region?: string; group: string };
  /** What is being read for the first step. */
  loading?: "where" | "regions";
  whereError?: string;
  /** Create ran at least one command: where it goes can't change any more (Start over can). */
  started: boolean;
  running: boolean;
  /** Every Azure piece exists and Jig has the relay's key (or you made them in the portal). */
  created: boolean;
  /** Made by hand in the Azure portal (docs/guides/teams-phone.md), not by Create. */
  manual: boolean;
  steps: TeamsSetupStepView[];
  /** The Teams app package Jig wrote (shown in Explorer). */
  packagePath?: string;
  /** What the relay has seen: the app added for yourself, and to a team. */
  installs: { app: boolean; team: boolean };
  /** What setup made, for Disconnect and Start over: Jig never deletes them. */
  resources?: { subscription: string; group: string; names: string[]; commands: string[] };
}
