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
