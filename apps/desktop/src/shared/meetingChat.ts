/**
 * The Teams chat of a meeting or call (D-270), read and sent through Microsoft Graph. Pure, so the
 * host and its tests share it: which chat belongs to a meeting, and Graph's messages as plain lines.
 */

export interface MeetingChatMessage {
  id: string;
  /** Who wrote it ("" for Teams' own notices, which aren't kept). */
  from: string;
  /** Their Microsoft Entra object id, for the profile picture. */
  fromId?: string;
  at: string;
  /** The words; "" when the message is only pictures or files. */
  text: string;
  /** You wrote it. */
  mine?: boolean;
  /** Pictures pasted into it (D-328): where Graph keeps them, never their bytes. */
  images?: ChatImage[];
  /** Files shared in it (SharePoint/OneDrive links) and link cards. */
  files?: ChatFile[];
}

/** A picture in a message, kept by Teams as the message's hosted content (read with Chat.Read). */
export interface ChatImage {
  chatId: string;
  messageId: string;
  contentId: string;
  /** Its size as Teams gives it in the message, for the thumbnail's shape before it loads. */
  width?: number;
  height?: number;
}

/** A file or link shared in a message: opened in your browser (https only). */
export interface ChatFile {
  name: string;
  url: string;
  kind: "file" | "link";
}

/** The parts of a hosted content's Graph address: `…/chats/{chat}/messages/{message}/hostedContents/{id}/$value`. */
const HOSTED_CONTENT = /\/chats\/([^/?#]+)\/messages\/([^/?#]+)\/hostedContents\/([^/?#]+)\/\$value/i;
/** A message id (Teams' are numbers) and a hosted content id (base64), as Jig accepts them. */
export const CHAT_MESSAGE_ID = /^[\w-]{1,64}$/;
export const HOSTED_CONTENT_ID = /^[\w+=-]{1,4000}$/;

const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")
    .exec(tag)
    ?.slice(2)
    .find((v) => v !== undefined);
const isEmoji = (tag: string) => /itemtype\s*=\s*["'][^"']*emoji/i.test(tag);
const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

/** An `<img>` tag's picture when Graph hosts it (so Jig can read it), else undefined. */
function hostedImage(tag: string): ChatImage | undefined {
  if (isEmoji(tag)) return undefined;
  const src = attribute(tag, "src")?.replaceAll("&amp;", "&");
  const m = src && /^https:\/\/graph\.microsoft\.com\//i.test(src) ? HOSTED_CONTENT.exec(src) : null;
  if (!m) return undefined;
  const [chatId, messageId, contentId] = [decode(m[1]!), decode(m[2]!), decode(m[3]!)];
  if (!chatId || !TEAMS_CHAT_ID.test(chatId) || !messageId || !CHAT_MESSAGE_ID.test(messageId))
    return undefined;
  if (!contentId || !HOSTED_CONTENT_ID.test(contentId)) return undefined;
  const size = (name: string) => {
    const n = Number(attribute(tag, name));
    return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : undefined;
  };
  const width = size("width");
  const height = size("height");
  return { chatId, messageId, contentId, ...(width && height ? { width, height } : {}) };
}

/** The pictures of a Teams message body that Graph hosts, in order (emoji left out). */
export function chatImages(html: string): ChatImage[] {
  return (html.match(/<img\b[^>]*>/gi) ?? []).map(hostedImage).filter((i): i is ChatImage => Boolean(i));
}

/** A message's attachments as Graph returns them (the fields Jig reads). */
export interface GraphChatAttachment {
  id?: string;
  contentType?: string;
  contentUrl?: string | null;
  name?: string | null;
}

const httpsUrl = (url: string | null | undefined) => {
  if (!url || url.length > 8192) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Shared files (`reference`: SharePoint/OneDrive) and other attachments with an https address, as
 * files to open. Replies (`messageReference`) and cards without an address are left out.
 */
export function chatFiles(attachments: unknown[] | undefined): ChatFile[] {
  const out: ChatFile[] = [];
  for (const a of (attachments ?? []) as GraphChatAttachment[]) {
    if (!a || typeof a !== "object" || a.contentType === "messageReference") continue;
    const url = httpsUrl(a.contentUrl);
    if (!url) continue;
    const name =
      (typeof a.name === "string" && a.name.trim()) ||
      decode(new URL(url).pathname.split("/").pop() ?? "") ||
      url;
    out.push({ name: name.slice(0, 300), url, kind: a.contentType === "reference" ? "file" : "link" });
  }
  return out;
}

/** Attachments Jig can't show (cards, files without an address), for the "(attachment)" placeholder. */
const otherAttachments = (attachments: unknown[] | undefined) =>
  ((attachments ?? []) as GraphChatAttachment[]).filter(
    (a) => a && typeof a === "object" && a.contentType !== "messageReference" && !httpsUrl(a.contentUrl),
  ).length;

/** How the chat panel stands: messages, Microsoft's approval missing, or no chat for this meeting. */
export type MeetingChatState = "ok" | "consent" | "unavailable";

/** A Teams meeting's chat thread, from its join link (`…/meetup-join/19%3ameeting_…%40thread.v2/0?…`). */
export function meetingChatId(joinUrl: string): string | undefined {
  const m = /\/meetup-join\/([^/?#]+)/i.exec(joinUrl);
  if (!m) return undefined;
  let thread: string;
  try {
    thread = decodeURIComponent(m[1]!);
  } catch {
    return undefined;
  }
  return /^19:[\w.-]+@thread\.(v2|tacv2|skype)$/i.test(thread) ? thread : undefined;
}

/**
 * The two ids a one-to-one chat between two people can have (`19:<a>_<b>@unq.gbl.spaces`): Teams
 * puts the object ids in an order Jig can't know, so both are tried.
 */
export function oneOnOneChatIds(me: string, peer: string): string[] {
  const ok = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
  if (!ok(me) || !ok(peer)) return [];
  const a = me.toLowerCase();
  const b = peer.toLowerCase();
  return [`19:${a}_${b}@unq.gbl.spaces`, `19:${b}_${a}@unq.gbl.spaces`];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * A Teams message body (HTML) as plain text: line breaks kept, tags and entities resolved. Emoji
 * become their character; pictures Graph hosts and attachment marks are left out (the message keeps
 * them as `images` and `files`); other pictures read "(image)".
 */
export function chatText(html: string): string {
  return html
    .replace(/<attachment[^>]*><\/attachment>/gi, "")
    .replace(/<img\b[^>]*>/gi, (tag) =>
      isEmoji(tag) ? (attribute(tag, "alt") ?? "") : hostedImage(tag) ? "" : "(image)",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A message as Graph returns it (the fields Jig reads). */
export interface GraphChatMessage {
  id: string;
  messageType?: string;
  createdDateTime: string;
  deletedDateTime?: string | null;
  from?: { user?: { id?: string; displayName?: string } | null } | null;
  body?: { contentType?: string; content?: string };
  attachments?: GraphChatAttachment[];
}

/**
 * Who is in a chat, for naming senders Graph leaves nameless: `from.user.displayName` is empty for
 * some people (seen for guests and people from another organisation), while the chat's members
 * (`/chats/{id}/members`, within Chat.Read) still name them. `peer` is the other person of a
 * one-to-one chat (its title), the last name to try before "Someone".
 */
export interface ChatDirectory {
  names: ReadonlyMap<string, string>;
  peer?: string;
}

/** A chat's members as a directory: names by user id, and the other person of a one-to-one chat. */
export function chatDirectory(
  chat: Pick<GraphChat, "chatType" | "members">,
  self?: string,
  title?: string,
): ChatDirectory {
  const names = new Map<string, string>();
  for (const m of chat.members ?? []) {
    const name = m.displayName?.trim();
    if (m.userId && name) names.set(m.userId.toLowerCase(), name);
  }
  const others = (chat.members ?? []).filter((m) => m.userId !== self);
  const peer =
    chat.chatType === "oneOnOne" ? others[0]?.displayName?.trim() || title?.trim() || undefined : undefined;
  return { names, ...(peer ? { peer } : {}) };
}

/**
 * A sender's name: Graph's own, else the chat's members', else (in a one-to-one chat, when it isn't
 * you) the other person's, and only then "Someone".
 */
export function senderName(
  user: { id?: string; displayName?: string | null },
  directory?: ChatDirectory,
  self?: string,
): string {
  const own = user.displayName?.trim();
  if (own) return own;
  const member = user.id ? directory?.names.get(user.id.toLowerCase()) : undefined;
  if (member) return member;
  if (directory?.peer && (!self || user.id !== self)) return directory.peer;
  return "Someone";
}

/** Whether some message's sender has no name of its own and none in `directory` yet. */
export function needsDirectory(
  messages: Array<Pick<GraphChatMessage, "from" | "messageType">>,
  directory?: ChatDirectory,
  self?: string,
): boolean {
  return messages.some((m) => {
    const user = m.from?.user;
    if (!user || (m.messageType ?? "message") !== "message" || user.displayName?.trim()) return false;
    if (self && user.id === self) return false;
    return !(user.id && directory?.names.has(user.id.toLowerCase()));
  });
}

/** People's messages, oldest first; system notices, deleted and empty messages left out. */
export function toChatMessages(
  messages: GraphChatMessage[],
  self?: string,
  directory?: ChatDirectory,
): MeetingChatMessage[] {
  return messages
    .filter((m) => (m.messageType ?? "message") === "message" && !m.deletedDateTime && m.from?.user)
    .map((m) => {
      const body = m.body?.content ?? "";
      const html = m.body?.contentType !== "text";
      const text = html ? chatText(body) : body.trim();
      const images = html ? chatImages(body) : [];
      const files = chatFiles(m.attachments);
      const user = m.from!.user!;
      return {
        id: m.id,
        from: senderName(user, directory, self),
        ...(user.id ? { fromId: user.id } : {}),
        at: new Date(m.createdDateTime).toISOString(),
        text:
          text || (!images.length && !files.length && otherAttachments(m.attachments) ? "(attachment)" : ""),
        ...(self && user.id === self ? { mine: true } : {}),
        ...(images.length ? { images } : {}),
        ...(files.length ? { files } : {}),
      } satisfies MeetingChatMessage;
    })
    .filter((m) => m.text || m.images?.length || m.files?.length)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Messages from one person this close together read as one group (one name and picture). */
export const CHAT_GROUP_GAP_MS = 5 * 60_000;

/** Consecutive messages of one sender, each within a few minutes of the one before, on one day. */
export interface ChatGroup {
  key: string;
  mine: boolean;
  from: string;
  fromId?: string;
  messages: MeetingChatMessage[];
}

/** What the chat view shows, top to bottom: a day's divider, then that day's groups. */
export type ChatTimelineItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "group"; key: string; group: ChatGroup };

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** A chat's day divider: "Today", "Yesterday", the weekday this week ("Tuesday"), else "Oct 27". */
export function chatDayLabel(value: string, now = new Date(), locale?: string): string {
  const d = new Date(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return d.toLocaleDateString(locale, { weekday: "long" });
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Who wrote a message, for grouping: you, else their id, else their name. */
const senderKey = (m: MeetingChatMessage) =>
  m.mine ? "you" : m.fromId ? `id:${m.fromId.toLowerCase()}` : `name:${m.from}`;

/**
 * Messages (oldest first) as the chat view lays them out: a divider whenever the day changes, and
 * the messages grouped by sender while each follows the one before within `gap`.
 */
export function chatTimeline(
  messages: MeetingChatMessage[],
  now = new Date(),
  gap = CHAT_GROUP_GAP_MS,
  locale?: string,
): ChatTimelineItem[] {
  const out: ChatTimelineItem[] = [];
  let group: ChatGroup | undefined;
  let day: string | undefined;
  for (const m of messages) {
    const at = new Date(m.at);
    const thisDay = localDay(at);
    if (thisDay !== day) {
      day = thisDay;
      group = undefined;
      out.push({ kind: "day", key: `day:${thisDay}`, label: chatDayLabel(m.at, now, locale) });
    }
    const prev = group?.messages.at(-1);
    if (
      group &&
      prev &&
      senderKey(prev) === senderKey(m) &&
      at.getTime() - new Date(prev.at).getTime() <= gap
    ) {
      group.messages.push(m);
      continue;
    }
    group = {
      key: m.id,
      mine: Boolean(m.mine),
      from: m.mine ? "You" : m.from,
      ...(m.fromId ? { fromId: m.fromId } : {}),
      messages: [m],
    };
    out.push({ kind: "group", key: `group:${m.id}`, group });
  }
  return out;
}

/** New messages and edits merged into what's kept, by id, oldest first. */
export function mergeChat(kept: MeetingChatMessage[], fresh: MeetingChatMessage[]): MeetingChatMessage[] {
  const byId = new Map(kept.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Whether merging changed anything (so the room isn't told about nothing every few seconds), a sender's name too. */
export function chatChanged(before: MeetingChatMessage[], after: MeetingChatMessage[]): boolean {
  if (before.length !== after.length) return true;
  const media = (m: MeetingChatMessage) => `${m.images?.length ?? 0}/${m.files?.length ?? 0}`;
  if (after.some((m, i) => media(m) !== media(before[i]!))) return true;
  return after.some(
    (m, i) => m.id !== before[i]!.id || m.text !== before[i]!.text || m.from !== before[i]!.from,
  );
}

/** A Teams chat id: a thread (`19:…@thread.v2`) or a one-to-one chat (`19:…@unq.gbl.spaces`). */
export const TEAMS_CHAT_ID = /^19:[\w.-]+@(thread\.(v2|tacv2|skype)|unq\.gbl\.spaces)$/i;

/**
 * A message as one line for the chat list: its words, else "Sent an image" or "Sent a file" (Graph's
 * preview has no attachment names, D-328).
 */
export function chatPreviewText(content: string, contentType?: string): string {
  const html = contentType !== "text";
  const text = (html ? chatText(content) : content).replace(/\s+/g, " ").trim();
  if (text) return text;
  if (html && /<img\b/i.test(content)) return "Sent an image";
  return "Sent a file";
}

/** One of your Teams chats in the lobby's Chats list (D-296). */
export interface TeamsChatSummary {
  id: string;
  kind: "oneOnOne" | "group" | "meeting";
  /** The other person (one-to-one), the topic, or the members' names. */
  name: string;
  /** The other person's Entra object id in a one-to-one chat, for the picture. */
  peerId?: string;
  /** The newest message, as one line. */
  preview?: { from: string; text: string; mine?: boolean };
  /** When the chat last had a message (or changed). */
  at: string;
  /** Someone else wrote since you last read it (in Teams, or opened it in Jig). */
  unread: boolean;
}

/** A chat as Graph's `/me/chats` returns it with members and the last message's preview. */
export interface GraphChat {
  id: string;
  topic?: string | null;
  chatType?: string;
  lastUpdatedDateTime?: string;
  members?: Array<{ userId?: string | null; displayName?: string | null }>;
  lastMessagePreview?: {
    createdDateTime: string;
    isDeleted?: boolean;
    messageType?: string;
    from?: { user?: { id?: string; displayName?: string } | null } | null;
    body?: { contentType?: string; content?: string };
  } | null;
  viewpoint?: { isHidden?: boolean; lastMessageReadDateTime?: string | null } | null;
}

/**
 * Your chats newest first, as the lobby lists them: hidden ones left out, a name for each, the last
 * message as one line, and whether it's unread. `readInJig` holds when you last opened a chat in Jig
 * (Jig can't mark it read in Teams: that needs Chat.ReadWrite).
 */
export function toChatSummaries(
  chats: GraphChat[],
  self?: string,
  readInJig: ReadonlyMap<string, string> = new Map(),
): TeamsChatSummary[] {
  return chats
    .filter((c) => !c.viewpoint?.isHidden && TEAMS_CHAT_ID.test(c.id))
    .map((c) => {
      const kind = c.chatType === "oneOnOne" ? "oneOnOne" : c.chatType === "meeting" ? "meeting" : "group";
      const others = (c.members ?? []).filter((m) => m.userId !== self);
      const peer = kind === "oneOnOne" ? others[0] : undefined;
      const names = others.map((m) => m.displayName?.trim()).filter(Boolean) as string[];
      const name =
        (kind === "oneOnOne" ? peer?.displayName?.trim() : c.topic?.trim()) ||
        (names.length
          ? names.length > 3
            ? `${names.slice(0, 3).join(", ")} +${names.length - 3}`
            : names.join(", ")
          : kind === "meeting"
            ? "Meeting chat"
            : "Chat");
      const last = c.lastMessagePreview;
      const directory = chatDirectory(c, self);
      const fromId = last?.from?.user?.id;
      const mine = Boolean(self && fromId === self);
      const content = last?.body?.content ?? "";
      const text = chatPreviewText(content, last?.body?.contentType);
      const preview =
        last && !last.isDeleted && (last.messageType ?? "message") === "message" && last.from?.user
          ? {
              from: mine ? "You" : senderName(last.from.user, directory, self),
              text,
              ...(mine ? { mine } : {}),
            }
          : undefined;
      const at = last?.createdDateTime ?? c.lastUpdatedDateTime ?? new Date(0).toISOString();
      const read = [c.viewpoint?.lastMessageReadDateTime, readInJig.get(c.id)]
        .filter((t): t is string => Boolean(t))
        .map((t) => new Date(t).getTime());
      const unread = Boolean(
        preview && !mine && (!read.length || new Date(at).getTime() > Math.max(...read)),
      );
      return {
        id: c.id,
        kind,
        name,
        ...(peer?.userId ? { peerId: peer.userId } : {}),
        ...(preview ? { preview } : {}),
        at: new Date(at).toISOString(),
        unread,
      } satisfies TeamsChatSummary;
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Teams' link to a chat, or to a new one with someone (by e-mail) when Jig can't start it. */
export function teamsChatLink(target: { chatId: string } | { email: string }): string {
  return "chatId" in target
    ? `https://teams.microsoft.com/l/chat/${encodeURIComponent(target.chatId)}/0`
    : `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(target.email)}`;
}
