import type { PhoneChannelCapabilities, PhoneChannelId } from "../../shared/phone";
import type { OutMessage } from "./messages";

/**
 * What Jig needs from the app on your phone (D-377): Telegram today (`telegram.ts`), Teams through
 * its relay later (D-370). `PhoneService` speaks only this; each channel turns Jig's messages
 * (`messages.ts`: a small HTML subset and rows of buttons) into its own and its updates into
 * `PhoneUpdate`s.
 */

/** A message's id in the channel: Telegram's numbers, Teams' activity ids. */
export type MessageRef = number | string;

/**
 * A place apart from the main chat (Telegram: a topic; Teams: a channel or a thread in one). No place
 * means the main chat itself (Telegram's private chat, Teams' 1:1 chat with the bot).
 */
export type Place = number | string;

/** The account Jig talks to: Telegram's private chat id, Teams' Entra object id. */
export type Account = number | string;

export interface PhoneUser {
  id: Account;
  /** For Settings ("Paired with Alex"); the channel's fallback when it has none. */
  name: string;
}

/** Something that came from the phone, in Jig's words. */
export type PhoneUpdate =
  | {
      kind: "message";
      id: MessageRef;
      /** When it was written, in seconds (old ones are ignored). */
      date: number;
      /** The conversation it was written in, and whether that's a private one with the bot. */
      chat: Account;
      private: boolean;
      from?: PhoneUser;
      place?: Place;
      /** The message it answers (a reply). */
      replyTo?: MessageRef;
      text?: string;
      /** A voice message, to fetch with `download`. */
      voice?: { file: string };
      /** A picture, file or sticker: something Jig doesn't read. */
      attachment?: boolean;
    }
  | {
      kind: "tap";
      /** Answered with `answerTap`. */
      id: string;
      from: PhoneUser;
      data?: string;
      place?: Place;
    };

/** Where a message goes: the paired account, a place of its chat, and what it answers. */
export interface Address {
  chat: Account;
  place?: Place;
  replyTo?: MessageRef;
  /** It needs you: channels that only buzz for mentions (Teams' channels) mention you. */
  mention?: boolean;
}

/** What a place is for, so a channel can make the right kind (Teams: a channel or a thread in one). */
export interface PlaceSpec {
  kind: "jig" | "project" | "chat";
  name: string;
  /** Jig's colour token (`accent`, `info`…) or `jig`; channels map it to theirs. */
  color: string;
  /** A chat's room inside its project's place, where the channel nests them. */
  parent?: Place;
}

export interface PhoneCommand {
  command: string;
  description: string;
}

/**
 * Why a channel call failed. `auth`: the credential no longer works; `conflict`: another program
 * reads the bot; `unreachable`: no answer; `gone`: the place was deleted on the phone; `unchanged`:
 * an edit with nothing new. `message` is for Settings, in the user's words.
 */
export class ChannelError extends Error {
  constructor(
    readonly reason: "auth" | "conflict" | "unreachable" | "gone" | "unchanged" | "other",
    message: string,
  ) {
    super(message);
  }
}

export interface PhoneChannel<Raw = unknown> {
  readonly id: PhoneChannelId;
  /** Its name in messages and Settings ("Telegram"). */
  readonly name: string;
  readonly capabilities: PhoneChannelCapabilities;
  /** Checks the credential: the bot's name, and whether it has places now (Telegram: topics on). */
  identify(): Promise<{ bot: string; places: boolean }>;
  /** The next updates: waits for them (long polling) until `signal` ends it. */
  poll(signal: AbortSignal): Promise<Raw[]>;
  /** One update in Jig's words; undefined for what Jig doesn't read. */
  read(raw: Raw): PhoneUpdate | undefined;
  /** Sends a message (with a picture); throws `ChannelError("gone")` when its place was deleted. */
  send(to: Address, message: OutMessage, photo?: Buffer): Promise<MessageRef>;
  /** Replaces a sent message's text; a message without buttons loses them. */
  edit(to: Address, ref: MessageRef, message: OutMessage): Promise<void>;
  /** Shows that Jig is writing. */
  typing(to: Address): Promise<void>;
  /** Answers a tap (a short notice on the phone). */
  answerTap(id: string, text?: string): Promise<void>;
  createPlace(chat: Account, place: PlaceSpec): Promise<Place>;
  renamePlace?(chat: Account, place: Place, name: string): Promise<void>;
  deletePlace(chat: Account, place: Place): Promise<void>;
  /**
   * The account that sent the right code (Teams: the relay keeps only its messages from now on);
   * throws when the channel refuses it, and Jig stays unpaired.
   */
  pair?(account: Account): Promise<void>;
  /** Disconnect: the channel forgets the account (Teams: the relay drops the pairing and what waits). */
  unpair?(): Promise<void>;
  /** The menu of fixed commands (`capabilities.commands`). */
  setCommands?(commands: PhoneCommand[]): Promise<void>;
  /** A voice message: send one, fetch one you sent (`capabilities.voice`). */
  sendVoice?(to: Address, ogg: Buffer): Promise<void>;
  download?(file: string): Promise<Buffer>;
}
