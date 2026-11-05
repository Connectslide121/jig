/**
 * What Jig and the relay say to each other (D-370). Jig imports these types only (`import type`), so
 * the relay's code never ends up in the app. Every request carries the relay key in `RELAY_KEY_HEADER`.
 */

export const RELAY_KEY_HEADER = "x-jig-relay-key";

/** What the relay keeps of an activity Microsoft posted to the bot: no attachments' contents. */
export interface RelayActivity {
  /** `message`, `invoke`, `conversationUpdate`, `installationUpdate`, `messageReaction`… */
  type: string;
  id?: string;
  timestamp?: string;
  text?: string;
  /** What an Adaptive Card's `Action.Submit` sent (a message without text in Teams). */
  value?: unknown;
  /** `invoke`'s name (`adaptiveCard/action`…), `installationUpdate`'s `add` / `remove`. */
  name?: string;
  action?: string;
  from?: { id: string; aadObjectId?: string; name?: string };
  conversation: { id: string; conversationType?: string; tenantId?: string; name?: string };
  replyToId?: string;
  channelData?: {
    eventType?: string;
    tenant?: { id: string };
    team?: { id: string; name?: string; aadGroupId?: string };
    channel?: { id: string; name?: string };
  };
  /** Pictures and files the user sent: only their kind, Jig doesn't read them. */
  attachments?: { contentType: string; name?: string }[];
  membersAdded?: { id: string; aadObjectId?: string }[];
  membersRemoved?: { id: string; aadObjectId?: string }[];
}

/** One stored activity: `GET /api/updates?after=<cursor>` returns the ones after the cursor. */
export interface RelayUpdate {
  cursor: number;
  /** When the relay received it (ms since the epoch). */
  received: number;
  activity: RelayActivity;
}

export interface UpdatesResponse {
  updates: RelayUpdate[];
}

/** Where `POST /api/send` posts. */
export type SendTarget =
  /** The 1:1 chat with the paired user (made when the bot has none yet). */
  | { kind: "personal" }
  /** A conversation the relay has seen or returned (a 1:1 chat, a channel, a thread). */
  | { kind: "conversation"; conversationId: string }
  /** A new thread (post) in a channel of the team. */
  | { kind: "thread"; channelId: string }
  /** A reply in a channel thread: its channel and the id of the thread's first message. */
  | { kind: "reply"; channelId: string; messageId: string };

export interface SendImage {
  contentType: "image/png" | "image/jpeg";
  /** Base64, at most `MAX_IMAGE_BYTES` once decoded (Teams' inline image limit). */
  data: string;
  name?: string;
}

export interface SendRequest {
  to: SendTarget;
  /** Jig's small HTML subset (D-377), sent with `textFormat: "xml"` unless `format` says Markdown. */
  text?: string;
  format?: "xml" | "markdown";
  /** An Adaptive Card (version 1.5, the highest every Teams client renders). */
  card?: Record<string, unknown>;
  image?: SendImage;
  /** @mention the paired user: Teams channels only notify you of mentions. */
  mention?: boolean;
  /** The notification's preview text. */
  summary?: string;
}

export interface SendResult {
  /** The activity's id, for `PUT /api/send/<id>`. */
  id: string;
  /** Where it went: a new thread's conversation id ends with `;messageid=<id>`. */
  conversationId: string;
}

/** `PUT /api/send/<activity id>`: replaces a message's text or card. */
export interface UpdateRequest {
  conversationId: string;
  text?: string;
  format?: "xml" | "markdown";
  card?: Record<string, unknown>;
}

/** `POST /api/channels`: makes a channel in the team, or renames one when `id` is given. */
export interface ChannelRequest {
  name: string;
  description?: string;
  id?: string;
}

export interface ChannelResult {
  id: string;
  name: string;
}

/** `PUT /api/pairing`: from now on the relay keeps only this account's activities. */
export interface PairingRequest {
  aadObjectId: string;
}

export interface Health {
  version: string;
  paired: boolean;
  /** The 1:1 chat with the paired user is known (the bot can write first). */
  personal: boolean;
  /** The team the bot was added to, if any. */
  team?: { id: string; name?: string };
  channels: number;
  /** Whether the team's owner granted the bot's resource-specific consent (channels through Graph). */
  rsc: "granted" | "missing" | "unknown";
}

/** Error bodies: `{ error }` with a short code Jig shows as a reason. */
export interface RelayError {
  error: string;
  detail?: string;
}

/** How long the relay keeps what you write while Jig doesn't fetch it. */
export const KEEP_MS = 24 * 60 * 60 * 1000;
/** The longest `GET /api/updates` waits for something new (Azure's HTTP limit is 230 s). */
export const MAX_WAIT_S = 25;
/** Teams' inline image limit: 1 MB and 1024 × 1024 pixels. */
export const MAX_IMAGE_BYTES = 1024 * 1024;
/** Teams rejects messages over 100 KB; base64 images don't count. */
export const MAX_TEXT_BYTES = 80 * 1024;
