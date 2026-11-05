import type { OutActivity } from "./microsoft.ts";
import { MAX_IMAGE_BYTES, MAX_TEXT_BYTES, type RelayActivity } from "./protocol.ts";

/** Who the relay is paired with (`PUT /api/pairing`): only their activities are kept. */
export interface Pairing {
  aadObjectId: string;
  tenantId: string;
  /** Their Teams id (`29:…`) and name, for @mentions and opening the 1:1 chat. */
  userId?: string;
  name?: string;
  /** Where their 1:1 chat is served, to open it again if it was forgotten. */
  serviceUrl?: string;
}

/** A pairing code: what the relay keeps from a 1:1 chat before anyone is paired. */
const CODE = /^\s*\d{6}\s*$/;
const EVENTS = new Set(["conversationUpdate", "installationUpdate"]);

export function tenantOf(a: RelayActivity): string | undefined {
  return a.channelData?.tenant?.id ?? a.conversation?.tenantId;
}

/**
 * Whether the relay keeps an activity Microsoft sent (D-370). Never another tenant's. The bot's own
 * install and channel events always (they hold no text, and tell Jig the team and its channels).
 * Before pairing, only a 6-digit code written in a 1:1 chat; once paired, only the paired account.
 */
export function keepActivity(a: RelayActivity, tenantId: string, pairing: Pairing | undefined): boolean {
  if (tenantOf(a) !== tenantId) return false;
  if (EVENTS.has(a.type)) return true;
  if (!pairing)
    return a.type === "message" && a.conversation.conversationType === "personal" && CODE.test(a.text ?? "");
  return a.from?.aadObjectId === pairing.aadObjectId && tenantOf(a) === pairing.tenantId;
}

const MAX_KEPT_TEXT = 16_000;

/** What the relay stores of an activity: no attachment contents, text cut to a sane length. */
export function trimActivity(raw: Record<string, unknown>): RelayActivity {
  const a = raw as unknown as RelayActivity & { attachments?: { contentType?: string; name?: string }[] };
  const cd = a.channelData;
  const out: RelayActivity = {
    type: String(a.type ?? ""),
    id: a.id,
    timestamp: a.timestamp,
    text: typeof a.text === "string" ? a.text.slice(0, MAX_KEPT_TEXT) : undefined,
    value: a.value,
    name: a.name,
    action: a.action,
    from: a.from && { id: a.from.id, aadObjectId: a.from.aadObjectId, name: a.from.name },
    conversation: {
      id: a.conversation?.id ?? "",
      conversationType: a.conversation?.conversationType,
      tenantId: a.conversation?.tenantId,
      name: a.conversation?.name,
    },
    replyToId: a.replyToId,
    channelData: cd && {
      eventType: cd.eventType,
      tenant: cd.tenant && { id: cd.tenant.id },
      team: cd.team && { id: cd.team.id, name: cd.team.name, aadGroupId: cd.team.aadGroupId },
      channel: cd.channel && { id: cd.channel.id, name: cd.channel.name },
    },
    attachments: a.attachments?.map((x) => ({ contentType: String(x.contentType ?? ""), name: x.name })),
    membersAdded: a.membersAdded?.map((m) => ({ id: m.id, aadObjectId: m.aadObjectId })),
    membersRemoved: a.membersRemoved?.map((m) => ({ id: m.id, aadObjectId: m.aadObjectId })),
  };
  return JSON.parse(JSON.stringify(out)) as RelayActivity;
}

export interface MessageContent {
  text?: string;
  format?: "xml" | "markdown";
  card?: Record<string, unknown>;
  image?: { contentType: string; data: string; name?: string };
  summary?: string;
}

export class ContentError extends Error {}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The Bot Framework activity for a message: Jig's HTML subset as `xml` text, an Adaptive Card and
 * an inline picture (a `data:` URL, Teams' documented way for bots) as attachments, and an @mention
 * of the paired user in front when asked (Teams channels only buzz for mentions).
 */
export function buildActivity(content: MessageContent, mention?: { id: string; name: string }): OutActivity {
  if (!content.text && !content.card && !content.image) throw new ContentError("empty");
  if (content.text && Buffer.byteLength(content.text, "utf8") > MAX_TEXT_BYTES)
    throw new ContentError("text_too_long");
  const activity: OutActivity = { type: "message" };
  let text = content.text ?? "";
  if (mention) {
    const tag = `<at>${escapeHtml(mention.name)}</at>`;
    text = text ? `${tag} ${text}` : tag;
    activity.entities = [{ type: "mention", text: tag, mentioned: { id: mention.id, name: mention.name } }];
  }
  if (text) {
    activity.text = text;
    activity.textFormat = mention ? "xml" : (content.format ?? "xml");
  }
  if (content.summary) activity.summary = content.summary;
  const attachments: NonNullable<OutActivity["attachments"]> = [];
  if (content.card)
    attachments.push({ contentType: "application/vnd.microsoft.card.adaptive", content: content.card });
  if (content.image) {
    const { contentType, data, name } = content.image;
    if (contentType !== "image/png" && contentType !== "image/jpeg") throw new ContentError("image_type");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new ContentError("image_data");
    if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) throw new ContentError("image_too_big");
    attachments.push({ contentType, contentUrl: `data:${contentType};base64,${data}`, name });
  }
  if (attachments.length) activity.attachments = attachments;
  return activity;
}
