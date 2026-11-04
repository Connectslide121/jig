/**
 * The lobby's chat list toolbar (D-332): searching and filtering the loaded chats, Jig's own pins,
 * Microsoft Search's message hits and the body of a new chat. Pure, so the host, the lobby and their
 * tests share it.
 */
import { chatText, TEAMS_CHAT_ID, type TeamsChatSummary } from "./meetingChat";

/** Teams' filter chips: unread chats, chats with people (one-to-one and group), meeting chats. */
export type ChatFilter = "unread" | "chats" | "meetings";
export const CHAT_FILTERS: ReadonlyArray<readonly [ChatFilter, string]> = [
  ["unread", "Unread"],
  ["chats", "Chats"],
  ["meetings", "Meetings"],
];

/** Lower case without accents, so "jose" finds "José". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

/**
 * Whether a chat matches what you typed: every word in its name, its members' names or its last
 * message (who wrote it and what).
 */
export function chatMatches(chat: TeamsChatSummary, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(
    [chat.name, ...(chat.members ?? []), chat.preview?.from ?? "", chat.preview?.text ?? ""].join("\n"),
  );
  return words.every((w) => haystack.includes(w));
}

/** Whether a chat passes a filter chip (none = every chat). */
export function chatPasses(chat: TeamsChatSummary, filter?: ChatFilter): boolean {
  if (filter === "unread") return chat.unread;
  if (filter === "chats") return chat.kind !== "meeting";
  if (filter === "meetings") return chat.kind === "meeting";
  return true;
}

/** The most chats Jig keeps pinned. */
export const MAX_CHAT_PINS = 50;

/** Pins as kept: Teams chat ids, each once, in the order you pinned them, at most `MAX_CHAT_PINS`. */
export function normalizePins(pins: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of pins) if (TEAMS_CHAT_ID.test(id) && !out.includes(id)) out.push(id);
  return out.slice(0, MAX_CHAT_PINS);
}

/** Pins after pinning (added last) or unpinning a chat. */
export function setPin(pins: readonly string[], chatId: string, pinned: boolean): string[] {
  const rest = pins.filter((id) => id !== chatId);
  return normalizePins(pinned ? [...rest, chatId] : rest);
}

/**
 * The list as the lobby shows it: the pinned chats in pin order, then the others newest first,
 * both narrowed by the search and the filter.
 */
export function chatSections(
  chats: readonly TeamsChatSummary[],
  pins: readonly string[],
  query = "",
  filter?: ChatFilter,
): { pinned: TeamsChatSummary[]; recent: TeamsChatSummary[] } {
  const shown = (c: TeamsChatSummary) => chatPasses(c, filter) && chatMatches(c, query);
  const byId = new Map(chats.map((c) => [c.id, c]));
  const pinned = pins.map((id) => byId.get(id)).filter((c): c is TeamsChatSummary => Boolean(c && shown(c)));
  const recent = chats.filter((c) => !pins.includes(c.id) && shown(c));
  return { pinned, recent };
}

/** A message Microsoft Search found in one of your chats. */
export interface ChatSearchHit {
  chatId: string;
  messageId: string;
  /** Who wrote it, as Microsoft Search names them. */
  from: string;
  at: string;
  /** Microsoft's excerpt around the words found, as plain text. */
  text: string;
}

/** The fewest characters worth asking Microsoft Search for. */
export const CHAT_SEARCH_MIN = 2;

/** The request body of `POST /search/query` for Teams messages (D-332). */
export function chatSearchRequest(query: string, size = 25) {
  return {
    requests: [{ entityTypes: ["chatMessage"], query: { queryString: query.trim() }, from: 0, size }],
  };
}

interface SearchResource {
  id?: string;
  chatId?: string;
  createdDateTime?: string;
  from?: { emailAddress?: { name?: string | null } | null; user?: { displayName?: string | null } | null };
}

/**
 * Microsoft Search's answer as hits in chats Jig can open: channel posts (no `chatId`) and anything
 * malformed are left out, each message once, in Microsoft's order.
 */
export function toChatSearchHits(response: unknown): ChatSearchHit[] {
  const out: ChatSearchHit[] = [];
  const values = (response as { value?: unknown })?.value;
  for (const value of Array.isArray(values) ? values : []) {
    const containers = (value as { hitsContainers?: unknown })?.hitsContainers;
    for (const container of Array.isArray(containers) ? containers : []) {
      const hits = (container as { hits?: unknown })?.hits;
      for (const hit of Array.isArray(hits) ? hits : []) {
        const h = hit as { summary?: unknown; resource?: SearchResource };
        const r = h.resource;
        if (!r || typeof r.chatId !== "string" || !TEAMS_CHAT_ID.test(r.chatId)) continue;
        if (typeof r.id !== "string" || !r.id || out.some((o) => o.messageId === r.id)) continue;
        const at = new Date(r.createdDateTime ?? "");
        if (Number.isNaN(at.getTime())) continue;
        const summary = typeof h.summary === "string" ? h.summary : "";
        out.push({
          chatId: r.chatId,
          messageId: r.id,
          from: (r.from?.emailAddress?.name || r.from?.user?.displayName || "Someone").trim(),
          at: at.toISOString(),
          // Microsoft marks the words found (`<c0>`) and cuts (`<ddd/>`); Jig shows plain text.
          text: chatText(summary.replace(/<ddd\s*\/>/gi, "…"))
            .replace(/\s+/g, " ")
            .slice(0, 300),
        });
      }
    }
  }
  return out;
}

/** What kind of chat an id is, when only the id is known (a search hit outside the list). */
export function chatKindOf(chatId: string): TeamsChatSummary["kind"] {
  if (/@unq\.gbl\.spaces$/i.test(chatId)) return "oneOnOne";
  if (/^19:meeting_/i.test(chatId)) return "meeting";
  return "group";
}

/** The most people a new chat starts with in Jig (Teams allows more; add them in Teams). */
export const NEW_CHAT_MAX_PEOPLE = 50;
/** A group chat's name, as long as Teams accepts it. */
export const CHAT_TOPIC_MAX = 250;

/**
 * The body of `POST /chats` (D-332): one other person is a one-to-one chat, more a group chat with
 * an optional name. Every member, you included, is an owner, as Teams makes them.
 */
export function newChatRequest(self: string, people: readonly string[], topic?: string) {
  const ids = [...new Set(people.map((id) => id.toLowerCase()))].filter((id) => id !== self.toLowerCase());
  if (!ids.length) throw new Error("Pick someone to chat with");
  const member = (id: string) => ({
    "@odata.type": "#microsoft.graph.aadUserConversationMember",
    roles: ["owner"],
    "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${id}')`,
  });
  const group = ids.length > 1;
  const name = topic?.trim().slice(0, CHAT_TOPIC_MAX);
  return {
    chatType: group ? "group" : "oneOnOne",
    ...(group && name ? { topic: name } : {}),
    members: [self, ...ids].map(member),
  };
}

/** A new chat's title before Teams names it: its name, else the people's names. */
export function newChatName(people: ReadonlyArray<{ name: string }>, topic?: string): string {
  const name = topic?.trim();
  if (name && people.length > 1) return name;
  const names = people.map((p) => p.name);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
}
