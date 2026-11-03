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
  text: string;
  /** You wrote it. */
  mine?: boolean;
}

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

/** A Teams message body (HTML) as plain text: line breaks kept, tags and entities resolved. */
export function chatText(html: string): string {
  return html
    .replace(/<attachment[^>]*><\/attachment>/gi, "(attachment)")
    .replace(/<img[^>]*>/gi, "(image)")
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
  attachments?: unknown[];
}

/** People's messages, oldest first; system notices, deleted and empty messages left out. */
export function toChatMessages(messages: GraphChatMessage[], self?: string): MeetingChatMessage[] {
  return messages
    .filter((m) => (m.messageType ?? "message") === "message" && !m.deletedDateTime && m.from?.user)
    .map((m) => {
      const body = m.body?.content ?? "";
      const text = m.body?.contentType === "text" ? body.trim() : chatText(body);
      const user = m.from!.user!;
      return {
        id: m.id,
        from: user.displayName || "Someone",
        ...(user.id ? { fromId: user.id } : {}),
        at: new Date(m.createdDateTime).toISOString(),
        text: text || (m.attachments?.length ? "(attachment)" : ""),
        ...(self && user.id === self ? { mine: true } : {}),
      };
    })
    .filter((m) => m.text)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** New messages and edits merged into what's kept, by id, oldest first. */
export function mergeChat(kept: MeetingChatMessage[], fresh: MeetingChatMessage[]): MeetingChatMessage[] {
  const byId = new Map(kept.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Whether merging changed anything (so the room isn't told about nothing every few seconds). */
export function chatChanged(before: MeetingChatMessage[], after: MeetingChatMessage[]): boolean {
  if (before.length !== after.length) return true;
  return after.some((m, i) => m.id !== before[i]!.id || m.text !== before[i]!.text);
}

/** A Teams chat id: a thread (`19:…@thread.v2`) or a one-to-one chat (`19:…@unq.gbl.spaces`). */
export const TEAMS_CHAT_ID = /^19:[\w.-]+@(thread\.(v2|tacv2|skype)|unq\.gbl\.spaces)$/i;

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
      const fromId = last?.from?.user?.id;
      const mine = Boolean(self && fromId === self);
      const content = last?.body?.content ?? "";
      const text = (last?.body?.contentType === "text" ? content : chatText(content))
        .replace(/\s+/g, " ")
        .trim();
      const preview =
        last && !last.isDeleted && (last.messageType ?? "message") === "message" && last.from?.user
          ? {
              from: mine ? "You" : last.from.user.displayName || "Someone",
              text: text || "(attachment)",
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
