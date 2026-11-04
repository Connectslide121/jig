/**
 * Mentioning a Teams chat in a Jig chat (`@chat:…`, D-333), the way a meeting is mentioned
 * (`@meeting:…`, D-250): a readable name and a short id Jig resolves to the chat, and the chat as
 * plain text for `jig_teams_chat_read`. Pure, so the host, the composer and their tests share it.
 */
import type { MeetingChatMessage, TeamsChatSummary } from "./meetingChat";

/** A Teams chat id's short form in a mention: 8 hex characters (FNV-1a of the id). */
export function chatShortId(chatId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < chatId.length; i++) {
    hash ^= chatId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

/** How a message mentions a Teams chat: `@chat:alex-contoso-1a2b3c4d`. */
export function chatMention(chat: Pick<TeamsChatSummary, "id" | "name">): string {
  const s = slug(chat.name);
  return `@chat:${s ? `${s}-` : ""}${chatShortId(chat.id)}`;
}

/** The short ids a message's `@chat:…` mentions name, once each, in order. */
export function mentionedChatIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|\s)@chat:(?:[a-z0-9-]*-)?([0-9a-f]{8})(?=\s|$|[.,;:!?)])/gi)) {
    const short = m[1]!.toLowerCase();
    if (!out.includes(short)) out.push(short);
  }
  return out;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

/**
 * Chats for the `@` picker: newest first, every word of `query` (after an optional `chat:` or
 * `chat `) in the name or a member's name. An empty query lists the newest.
 */
export function chatMentionMatches(
  chats: readonly TeamsChatSummary[],
  query: string,
  limit = 8,
): TeamsChatSummary[] {
  const words = fold(query)
    .replace(/^chat(:|\s|$)/, "")
    .split(/[\s\-_]+/)
    .filter(Boolean);
  return chats
    .filter((c) => {
      const hay = fold([c.name, ...(c.members ?? [])].join("\n"));
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** What `jig_teams_chat_read` returns per call by default, at most, and in all for one chat. */
export const CHAT_READ_DEFAULT = 100;
export const CHAT_READ_MAX = 200;
export const CHAT_READ_TOTAL = 1000;

/** `nextBefore`: where the next page starts (Graph's lastModifiedDateTime) and how many came before. */
export function chatCursor(before: string, read: number): string {
  return `${before}~${read}`;
}
export function parseChatCursor(cursor: string | undefined): { before: string; read: number } | undefined {
  if (!cursor) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)~(\d{1,5})$/.exec(cursor);
  if (!m || Number.isNaN(new Date(m[1]!).getTime()))
    throw new Error("Pass nextBefore exactly as the last read returned it");
  return { before: m[1]!, read: Number(m[2]) };
}

const KIND = { oneOnOne: "one-to-one chat", group: "group chat", meeting: "meeting chat" } as const;
const stamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

/** A message as one line for Claude: time (UTC), sender, words, and its pictures and files named. */
export function chatLine(m: MeetingChatMessage): string {
  const parts = [m.text.replace(/\s*\n\s*/g, " / ")];
  for (const _ of m.images ?? []) parts.push("[image]");
  for (const f of m.files ?? []) parts.push(`[${f.kind === "file" ? "file" : "link"}: ${f.name}]`);
  return `[${stamp(m.at)}] ${m.mine ? `${m.from} (the user)` : m.from}: ${parts.filter(Boolean).join(" ")}`;
}

/** The chat as `jig_teams_chat_read` gives it: name, kind, members, then the messages oldest first. */
export function chatReadText(
  chat: { name: string; kind: TeamsChatSummary["kind"]; members: string[] },
  messages: MeetingChatMessage[],
  more: boolean,
): string {
  const head = [
    `Teams chat: ${chat.name} (${KIND[chat.kind]})`,
    `Members: ${chat.members.join(", ") || "unknown"}`,
    messages.length
      ? `${messages.length} messages, oldest first (times UTC)${more ? "; older ones: call again with before = nextBefore" : ""}:`
      : "No messages in this range.",
  ];
  return [...head, ...messages.map(chatLine)].join("\n");
}
