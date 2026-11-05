import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { CommunicationIdentityClient } from "@azure/communication-identity";
import { AzureCliCredential } from "@azure/identity";
import { type AccountInfo, PublicClientApplication, type TokenCacheContext } from "@azure/msal-node";
import { safeStorage } from "electron";
import { JigError } from "../../shared/ipc";
import {
  type ChatDirectory,
  chatDirectory,
  type GraphChat,
  type GraphChatMessage,
  type MeetingChatMessage,
  needsDirectory,
  oneOnOneChatIds,
  SELF_CHAT_ID,
  selfChat,
  TEAMS_CHAT_ID,
  type TeamsChatSummary,
  toChatMessages,
  toChatSummaries,
} from "../../shared/meetingChat";
import {
  type ChatSearchHit,
  chatSearchRequest,
  newChatRequest,
  toChatSearchHits,
} from "../../shared/meetingChatList";
import { presenceBatches, type TeamsPresence, toPresence } from "../../shared/meetingPresence";
import type { MeetingEvent, MeetingPerson, MeetingSettings } from "../../shared/meetings";
import { openExternal } from "../appWindows";
import { logger } from "../log";
import { writeText } from "../state/jsonStore";
import { paths } from "../state/paths";
import {
  type GraphUser,
  isUserName,
  PEOPLE_SCOPES,
  peopleSearchUrl,
  SUGGESTED_URL,
  suggestedNames,
  toPeople,
  usersByNameUrl,
} from "./people";

const log = logger("meetings");

const callingScopes = [
  "https://auth.msft.communication.azure.com/Teams.ManageCalls",
  "https://auth.msft.communication.azure.com/Teams.ManageChats",
];

/** Reading and writing the Teams chat of a meeting or call (D-270): needs admin approval in some tenants. */
export const CHAT_SCOPES = [
  "https://graph.microsoft.com/Chat.Read",
  "https://graph.microsoft.com/ChatMessage.Send",
];

/**
 * Starting a Teams chat (D-332): Chat.Create, the least Microsoft asks for. Chat.ReadWrite covers it
 * too, so a tenant that approved that instead works without asking again.
 */
export const CHAT_CREATE_SCOPES = ["https://graph.microsoft.com/Chat.Create"];
const CHAT_READWRITE_SCOPES = ["https://graph.microsoft.com/Chat.ReadWrite"];
/** Pinned chats outside the 50 newest that Jig reads one by one (D-332). */
const PINNED_EXTRA = 10;

/** People's Teams status (D-329): delegated, users can consent to it themselves. */
export const PRESENCE_SCOPES = ["https://graph.microsoft.com/Presence.Read.All"];
/** How long a presence read is reused (both Meetings windows ask every minute). */
const PRESENCE_FRESH_MS = 30_000;

/** Chat pictures Jig shows (no SVG: it can carry scripts), the largest one, and the memory they may use. */
const CHAT_IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)$/;
const CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_CACHE_BYTES = 64 * 1024 * 1024;

/** Microsoft sign-in persists only through OS-protected encryption; calling tokens stay in memory. */
export class MeetingAuth {
  private client?: PublicClientApplication;
  private account?: AccountInfo;
  private interactive?: Promise<string>;
  private noPhotosUntil = 0;
  private epoch = 0;
  private restored?: Promise<void>;
  private persisting?: Promise<void>;
  private cachedFile?: string;
  /** Each chat's members by id, to name senders Graph leaves nameless; read again after 5 minutes. */
  private directories = new Map<string, { directory: ChatDirectory; at: number }>();
  /** Pictures in chat messages as data URLs, oldest first, at most `IMAGE_CACHE_BYTES` (D-328). */
  private images = new Map<string, { url: Promise<string | null>; bytes: number }>();
  /** People's presence by object id, with when it was read (D-329). */
  private presences = new Map<string, { presence?: TeamsPresence; at: number }>();
  constructor(private readonly settings: () => MeetingSettings) {}
  get name(): string | undefined {
    return this.account?.username;
  }
  get displayName(): string | undefined {
    return this.account?.name;
  }
  /** You as the call sees you: your Teams id and name, to name your own captions (D-383). */
  get self(): { id: string; name: string } | undefined {
    const oid = this.account?.localAccountId;
    const name = this.account?.name?.trim() || this.account?.username;
    return oid && name ? { id: `8:orgid:${oid}`, name } : undefined;
  }
  reset(): void {
    this.epoch++;
    this.restored = undefined;
    this.client = undefined;
    this.account = undefined;
    this.directories.clear();
    this.images.clear();
    this.presences.clear();
  }
  private cacheFile(): string | undefined {
    const { tenantId, clientId } = this.settings();
    if (!tenantId || !clientId) return undefined;
    const key = createHash("sha256").update(`${tenantId}:${clientId}`).digest("hex");
    return join(paths.cache(), "microsoft", `${key}.cache`);
  }
  async signOut(): Promise<void> {
    const file = this.cachedFile ?? this.cacheFile();
    this.reset();
    await this.persisting?.catch(() => {});
    if (file) await rm(file, { force: true });
    this.cachedFile = undefined;
  }
  async restore(): Promise<void> {
    if (!this.settings().clientId || !this.settings().tenantId) return;
    this.restored ??= (async () => {
      const epoch = this.epoch;
      try {
        const accounts = await this.app().getTokenCache().getAllAccounts();
        if (this.epoch === epoch && !this.account) this.account = accounts[0];
      } catch {
        /* An unavailable/corrupt protected cache requires a fresh sign-in. */
      }
    })();
    await this.restored;
  }
  private app(): PublicClientApplication {
    const { tenantId, clientId } = this.settings();
    if (!tenantId || !clientId)
      throw new JigError("meeting_setup", "Configure the Microsoft tenant and app registration first");
    if (this.client) return this.client;
    const file = this.cacheFile();
    const epoch = this.epoch;
    this.cachedFile = file;
    // MSAL clears its in-memory cache before every silent request and rebuilds it from what
    // beforeCacheAccess deserializes, so the latest state must be handed back on every access,
    // not only the file's contents at first load (otherwise a fresh sign-in is wiped).
    let latest: string | undefined;
    let loaded: Promise<void> | undefined;
    const protectedStorage = () =>
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
    this.client = new PublicClientApplication({
      cache: {
        cachePlugin: {
          beforeCacheAccess: async (context: TokenCacheContext) => {
            loaded ??= (async () => {
              if (!file || !protectedStorage() || this.epoch !== epoch) return;
              try {
                const encoded = await readFile(file, "utf8");
                latest ??= safeStorage.decryptString(Buffer.from(encoded, "base64"));
              } catch {
                /* No plaintext fallback and no credential-bearing error logging. */
              }
            })();
            await loaded;
            if (latest && this.epoch === epoch) context.tokenCache.deserialize(latest);
          },
          afterCacheAccess: async (context: TokenCacheContext) => {
            if (!context.cacheHasChanged || this.epoch !== epoch) return;
            latest = context.tokenCache.serialize();
            if (!file || !protectedStorage()) return;
            const encrypted = safeStorage.encryptString(latest).toString("base64");
            this.persisting = writeText(file, encrypted);
            await this.persisting;
          },
        },
      },
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
    });
    return this.client;
  }
  private async access(scopes: string[], interactive: boolean): Promise<string> {
    await this.restore();
    const client = this.app();
    const epoch = this.epoch;
    if (this.account) {
      try {
        return (await client.acquireTokenSilent({ account: this.account, scopes })).accessToken;
      } catch (error) {
        // Only MSAL's error code: its messages can carry account details.
        log.warn("Silent Microsoft token request failed", {
          code: (error as { errorCode?: string }).errorCode ?? "unknown",
        });
        if (!interactive)
          throw new JigError("meeting_signin", "Reconnect your Microsoft account from Meetings");
      }
    }
    if (!interactive) throw new JigError("meeting_signin", "Connect your Microsoft account from Meetings");
    if (this.interactive)
      throw new JigError("meeting_signin", "A Microsoft sign-in is already open in your browser");
    this.interactive = (async () => {
      try {
        const result = await client.acquireTokenInteractive({
          scopes,
          openBrowser: async (url) => {
            await openExternal(url);
          },
          successTemplate: "You are connected to Jig. You can close this page.",
          errorTemplate: "Microsoft could not connect Jig. Return to Jig for details.",
        });
        if (this.epoch !== epoch) throw new Error("Sign-in cancelled");
        this.account = result.account ?? undefined;
        return result.accessToken;
      } catch {
        throw new JigError(
          "meeting_signin",
          "Microsoft sign-in did not complete. If approval is required, ask your administrator to approve Jig's delegated Teams.ManageCalls, Teams.ManageChats, Calendars.ReadBasic, User.ReadBasic.All, People.Read, Chat.Read, ChatMessage.Send, Chat.Create and Presence.Read.All permissions, then try again.",
        );
      } finally {
        this.interactive = undefined;
      }
    })();
    return this.interactive;
  }
  async signIn(): Promise<string> {
    await this.access(callingScopes, true);
    this.noPhotosUntil = 0;
    return this.name ?? "Microsoft account";
  }
  async credential(): Promise<{ token: string }> {
    const aad = await this.access(callingScopes, false);
    const { endpoint, tenantId, clientId } = this.settings();
    if (!endpoint || !this.account)
      throw new JigError("meeting_setup", "Configure your Azure Communication Services endpoint first");
    try {
      const identity = new CommunicationIdentityClient(endpoint, new AzureCliCredential({ tenantId }));
      const result = await identity.getTokenForTeamsUser({
        teamsUserAadToken: aad,
        clientId,
        userObjectId: this.account.localAccountId,
      });
      return { token: result.token };
    } catch {
      throw new JigError(
        "meeting_azure",
        "Could not issue the calling credential. Check your Azure CLI sign-in and the Communication Services identity role on this resource. No resource keys are required.",
      );
    }
  }
  /**
   * People in your organisation to call: the ones you work with most (empty query), or a directory
   * search by name or e-mail. Asks for the people permissions the first time.
   */
  /**
   * A person's profile picture (48×48) as a data URL, or null when they have none. Never asks you to
   * sign in (a call is no time for a browser pop-up): without the people permission it's just null.
   * `user` is an object id, a user principal name (e-mail) or "me" for you. Nothing is asked of
   * Microsoft when the meeting sign-in isn't set up or connected, and after a refused token for the
   * people permission it waits 10 minutes before asking again (a board has many people).
   */
  async photo(user: string): Promise<string | null> {
    const id = user === "me" ? this.account?.localAccountId : user;
    if (!id || !(/^[0-9a-f-]{36}$/i.test(id) || isUserName(id))) return null;
    if (Date.now() < this.noPhotosUntil) return null;
    const token = await this.access(PEOPLE_SCOPES, false).catch(() => undefined);
    if (!token) {
      this.noPhotosUntil = Date.now() + 10 * 60_000;
      return null;
    }
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(id)}/photos/48x48/$value`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
    if (!response?.ok) return null;
    const type = response.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  }
  async people(query: string): Promise<MeetingPerson[]> {
    const token = await this.access(PEOPLE_SCOPES, true);
    const self = this.account?.localAccountId;
    const get = async <T>(url: string): Promise<T> => {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new JigError(
          "meeting_people",
          `Looking up people failed (${response.status}). Reconnect Microsoft, or ask your administrator to approve User.ReadBasic.All and People.Read.`,
        );
      return (await response.json()) as T;
    };
    if (query.trim()) {
      const found = await get<{ value: GraphUser[] }>(peopleSearchUrl(query));
      return toPeople(found.value, self);
    }
    const suggested = await get<{ value: Parameters<typeof suggestedNames>[0] }>(SUGGESTED_URL);
    const names = suggestedNames(suggested.value);
    if (!names.length) return [];
    const users = await get<{ value: GraphUser[] }>(usersByNameUrl(names));
    return toPeople(users.value, self, names);
  }
  /**
   * Asks Microsoft for the chat permissions (a browser page, once). Where the tenant needs an admin to
   * approve them, Microsoft says so there and this fails.
   */
  async connectChat(): Promise<void> {
    await this.access(CHAT_SCOPES, true);
  }
  /** Whether Jig has the chat permissions now, without asking. */
  async chatReady(): Promise<boolean> {
    return this.access(CHAT_SCOPES, false).then(
      () => true,
      () => false,
    );
  }
  private async chatFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.access(CHAT_SCOPES, false);
    return fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  }
  /**
   * The chat id of a call with someone: your one-to-one chat with them, whichever order Teams put
   * the two ids in. Undefined when you've never chatted (Teams makes the chat on the first message).
   */
  async callChatId(peerId: string): Promise<string | undefined> {
    const me = this.account?.localAccountId;
    if (!me) return undefined;
    for (const id of oneOnOneChatIds(me, peerId)) {
      const r = await this.chatFetch(`/chats/${encodeURIComponent(id)}?$select=id`);
      if (r.ok) return id;
    }
    return undefined;
  }
  /**
   * Your 50 most recent chats (D-296), with members and the last message's preview: Chat.Read is
   * enough. Where Graph refuses both expansions in one request, the two are read and merged.
   */
  async chats(
    readInJig: ReadonlyMap<string, string>,
    pins: readonly string[] = [],
  ): Promise<TeamsChatSummary[]> {
    const recent = "/me/chats?$top=50&$orderby=lastMessagePreview/createdDateTime%20desc";
    const read = async (path: string) => {
      const r = await this.chatFetch(path);
      if (!r.ok) throw chatError(r.status);
      return ((await r.json()) as { value: GraphChat[] }).value;
    };
    let chats: GraphChat[];
    try {
      chats = await read(`${recent}&$expand=members,lastMessagePreview`);
    } catch (error) {
      if ((error as JigError).code === "meeting_chat_consent") throw error;
      const [previews, members] = await Promise.all([
        read(`${recent}&$expand=lastMessagePreview`),
        read("/me/chats?$top=50&$expand=members").catch(() => [] as GraphChat[]),
      ]);
      const byId = new Map(members.map((c) => [c.id, c.members]));
      chats = previews.map((c) => ({ ...c, members: byId.get(c.id) ?? [] }));
    }
    // Pinned chats older than the newest 50 are read one by one, so the Pinned section has them.
    // So is your chat with yourself, which /me/chats never lists (D-385).
    const missing = [SELF_CHAT_ID, ...pins.filter((id) => id !== SELF_CHAT_ID)]
      .filter((id) => !chats.some((c) => c.id === id))
      .slice(0, PINNED_EXTRA + 1);
    const extra = await Promise.all(missing.map((id) => this.chat(id).catch(() => undefined)));
    chats = [...chats, ...extra.filter((c): c is GraphChat => Boolean(c))];
    const self = this.account?.localAccountId;
    const summaries = toChatSummaries(chats, self, readInJig);
    // The list already has every chat's members: keep them for its messages' senders.
    const titles = new Map(summaries.map((c) => [c.id, c.kind === "oneOnOne" ? c.name : undefined]));
    for (const c of chats)
      if (c.members?.length)
        this.directories.set(c.id, { directory: chatDirectory(c, self, titles.get(c.id)), at: Date.now() });
    return summaries;
  }
  /**
   * One chat with its members and last message. Graph gives no read time outside the list, so it
   * counts as read up to its last message (it's older than your 50 newest chats).
   */
  private async chat(chatId: string): Promise<GraphChat> {
    if (chatId === SELF_CHAT_ID) return this.selfChat();
    const path = `/chats/${encodeURIComponent(chatId)}`;
    let r = await this.chatFetch(`${path}?$expand=members,lastMessagePreview`);
    if (!r.ok && r.status !== 401 && r.status !== 403 && r.status !== 404)
      r = await this.chatFetch(`${path}?$expand=members`);
    if (!r.ok) throw chatError(r.status);
    const chat = (await r.json()) as GraphChat;
    const last = chat.lastMessagePreview?.createdDateTime;
    return { ...chat, viewpoint: { lastMessageReadDateTime: last ?? chat.lastUpdatedDateTime ?? null } };
  }
  /**
   * Your chat with yourself (D-385): Graph answers 400 for `/chats/48:notes` itself, so it is built
   * from you and its newest messages (Graph lists them newest first).
   */
  private async selfChat(): Promise<GraphChat> {
    const self = this.account?.localAccountId;
    if (!self) throw chatError(401);
    const r = await this.chatFetch(`/chats/${encodeURIComponent(SELF_CHAT_ID)}/messages?$top=5`);
    if (!r.ok) throw chatError(r.status);
    const { value } = (await r.json()) as { value: GraphChatMessage[] };
    return selfChat(self, this.displayName?.trim() || this.name || "", value);
  }
  /**
   * A chat for `jig_teams_chat_read` (D-333): its name, kind and members, and up to `limit` messages
   * newest-changed first from Graph (50 a page, at most 10 pages), before `before`/`until` and after
   * `since` (Graph filters on lastModifiedDateTime). Returns them oldest first, every sender named,
   * and where the next page starts. Nothing is kept.
   */
  async chatHistory(
    chatId: string,
    options: { before?: string; since?: string; until?: string; limit: number },
  ): Promise<{
    chat: { name: string; kind: TeamsChatSummary["kind"]; members: string[] };
    messages: MeetingChatMessage[];
    nextBefore?: string;
  }> {
    const self = this.account?.localAccountId;
    const graphChat = await this.chat(chatId);
    const summary = toChatSummaries([graphChat], self)[0];
    const members = (graphChat.members ?? [])
      .map((m) => (m.userId === self ? "You" : m.displayName?.trim()))
      .filter((n): n is string => Boolean(n));
    const upper = [options.before, options.until].filter((t): t is string => Boolean(t)).sort()[0];
    const filter = [
      upper ? `lastModifiedDateTime lt ${new Date(upper).toISOString()}` : "",
      options.since ? `lastModifiedDateTime gt ${new Date(options.since).toISOString()}` : "",
    ].filter(Boolean);
    const query = new URLSearchParams({ $top: "50", $orderby: "lastModifiedDateTime desc" });
    if (filter.length) query.set("$filter", filter.join(" and "));
    let path: string | undefined = `/chats/${encodeURIComponent(chatId)}/messages?${query}`;
    const raw: GraphChatMessage[] = [];
    let more = false;
    for (let page = 0; path && page < 10; page++) {
      const r = await this.chatFetch(path);
      if (!r.ok) throw chatError(r.status);
      const data = (await r.json()) as { value: GraphChatMessage[]; "@odata.nextLink"?: string };
      raw.push(...data.value);
      const next = data["@odata.nextLink"];
      if (raw.length >= options.limit) {
        more = raw.length > options.limit || Boolean(next);
        break;
      }
      if (next && new URL(next).origin !== "https://graph.microsoft.com")
        throw new JigError("meeting_chat", "Invalid chat continuation");
      path = next?.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, "");
      more = Boolean(next) && page === 9;
    }
    const taken = raw.slice(0, options.limit);
    const oldest = taken.at(-1)?.lastModifiedDateTime ?? taken.at(-1)?.createdDateTime;
    const directory = await this.directory(
      chatId,
      taken,
      summary?.kind === "oneOnOne" ? summary.name : undefined,
    );
    const inRange = (m: MeetingChatMessage) =>
      (!options.since || m.at >= new Date(options.since).toISOString()) &&
      (!options.until || m.at < new Date(options.until).toISOString());
    return {
      chat: { name: summary?.name ?? "Teams chat", kind: summary?.kind ?? "group", members },
      messages: toChatMessages(taken, self, directory).filter(inRange),
      ...(more && oldest ? { nextBefore: new Date(oldest).toISOString() } : {}),
    };
  }
  /**
   * Messages in your chats that Microsoft Search finds (D-332): Chat.Read is enough, delegated only.
   * The 25 best hits; channel posts are left out (Jig opens chats only).
   */
  async searchChats(query: string): Promise<ChatSearchHit[]> {
    const r = await this.chatFetch("/search/query", {
      method: "POST",
      body: JSON.stringify(chatSearchRequest(query)),
    });
    if (r.status === 401 || r.status === 403) throw chatError(r.status);
    if (!r.ok) throw new JigError("meeting_chat_search", `Microsoft Search didn't answer (${r.status}).`);
    return toChatSearchHits(await r.json());
  }
  /** A token to start chats with, silently: Chat.ReadWrite when the tenant approved it, else Chat.Create. */
  private async createToken(): Promise<string | undefined> {
    for (const scopes of [CHAT_READWRITE_SCOPES, CHAT_CREATE_SCOPES]) {
      const token = await this.access(scopes, false).catch(() => undefined);
      if (token) return token;
    }
    return undefined;
  }
  /** Whether Jig may start chats now, without asking (D-332). */
  async chatCreateReady(): Promise<boolean> {
    return Boolean(await this.createToken());
  }
  /** Asks Microsoft to let Jig start chats (a browser page; where an admin must approve, it says so). */
  async connectChatCreate(): Promise<void> {
    await this.access(CHAT_CREATE_SCOPES, true);
  }
  /**
   * Starts a Teams chat with people (D-332): one is a one-to-one chat (Graph returns the one you
   * already have), more a group chat with an optional name. Returns its id.
   */
  async createChat(people: readonly string[], topic?: string): Promise<string> {
    const me = this.account?.localAccountId;
    const token = await this.createToken();
    if (!me || !token) throw chatCreateConsent();
    const r = await fetch("https://graph.microsoft.com/v1.0/chats", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(newChatRequest(me, people, topic)),
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401 || r.status === 403) throw chatCreateConsent();
    if (!r.ok) throw new JigError("meeting_chat_create", `Teams didn't start the chat (${r.status}).`);
    const id = ((await r.json()) as { id?: string }).id;
    if (!id || !TEAMS_CHAT_ID.test(id))
      throw new JigError("meeting_chat_create", "Teams didn't say which chat it started.");
    return id;
  }
  /**
   * A chat's members as names by id (D-327), read when a message's sender has no name of its own
   * and kept per chat. `title` names the other person of a one-to-one chat when nothing else does.
   */
  private async directory(
    chatId: string,
    messages: GraphChatMessage[],
    title?: string,
  ): Promise<ChatDirectory | undefined> {
    const self = this.account?.localAccountId;
    const kept = this.directories.get(chatId);
    if (!needsDirectory(messages, kept?.directory, self) || (kept && Date.now() - kept.at < 5 * 60_000))
      return kept?.directory && title && !kept.directory.peer
        ? { ...kept.directory, peer: title }
        : kept?.directory;
    try {
      const r = await this.chatFetch(`/chats/${encodeURIComponent(chatId)}?$expand=members`);
      if (!r.ok) throw chatError(r.status);
      const chat = (await r.json()) as GraphChat;
      const directory = chatDirectory(chat, self, title);
      this.directories.set(chatId, { directory, at: Date.now() });
      return directory;
    } catch (error) {
      log.warn("chat members unavailable", { error: (error as Error).message });
      return kept?.directory;
    }
  }
  /**
   * The newest 50 messages of a chat you're in, oldest first, every sender named. `title`: the
   * other person's name in a one-to-one chat or call, the last try before "Someone".
   */
  async chatMessages(chatId: string, title?: string): Promise<MeetingChatMessage[]> {
    const r = await this.chatFetch(`/chats/${encodeURIComponent(chatId)}/messages?$top=50`);
    if (!r.ok) throw chatError(r.status);
    const data = (await r.json()) as { value: GraphChatMessage[] };
    const directory = await this.directory(chatId, data.value, title);
    return toChatMessages(data.value, this.account?.localAccountId, directory);
  }
  /** Asks Microsoft to let Jig read people's Teams status (opens the browser, D-329). */
  async connectPresence(): Promise<void> {
    await this.access(PRESENCE_SCOPES, true);
  }
  /**
   * People's Teams status by object id (D-329), silently: `consent` when Jig may not read it yet.
   * Reads only ids not read in the last 30 seconds, in Graph's batches of 650.
   */
  async presence(
    ids: string[],
  ): Promise<{ state: "ok" | "consent"; presence: Record<string, TeamsPresence> }> {
    const token = await this.access(PRESENCE_SCOPES, false).catch(() => undefined);
    if (!token) return { state: "consent", presence: {} };
    const now = Date.now();
    const stale = ids.filter((id) => now - (this.presences.get(id)?.at ?? 0) > PRESENCE_FRESH_MS);
    for (const batch of presenceBatches(stale)) {
      const r = await fetch("https://graph.microsoft.com/v1.0/communications/getPresencesByUserId", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.status === 401 || r.status === 403) return { state: "consent", presence: {} };
      if (!r.ok)
        throw new JigError("meeting_presence", `Microsoft didn't give people's status (${r.status})`);
      const found = toPresence(((await r.json()) as { value?: [] }).value);
      for (const id of batch) this.presences.set(id, { presence: found[id], at: now });
    }
    const presence: Record<string, TeamsPresence> = {};
    for (const id of ids) {
      const kept = this.presences.get(id)?.presence;
      if (kept) presence[id] = kept;
    }
    return { state: "ok", presence };
  }
  /**
   * A picture in a chat message (D-328): its hosted content from Graph with Chat.Read, as a data
   * URL, or null when it isn't a picture Jig shows, is too big or can't be read. Kept in memory.
   */
  chatImage(chatId: string, messageId: string, contentId: string): Promise<string | null> {
    const key = `${chatId}\n${messageId}\n${contentId}`;
    const kept = this.images.get(key);
    if (kept) {
      // Used again: newest, so it is evicted last.
      this.images.delete(key);
      this.images.set(key, kept);
      return kept.url;
    }
    const entry = { url: Promise.resolve<string | null>(null), bytes: 0 };
    entry.url = (async () => {
      const path = `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/hostedContents/${encodeURIComponent(contentId)}/$value`;
      const r = await this.chatFetch(path);
      if (!r.ok) throw chatError(r.status);
      const type = r.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!CHAT_IMAGE_TYPES.test(type)) return null;
      if (Number(r.headers.get("content-length") ?? 0) > CHAT_IMAGE_BYTES) return null;
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > CHAT_IMAGE_BYTES) return null;
      entry.bytes = bytes.length;
      this.trimImages();
      return `data:${type};base64,${bytes.toString("base64")}`;
    })().catch((error) => {
      log.warn("chat image unavailable", { error: (error as Error).message });
      this.images.delete(key);
      return null;
    });
    this.images.set(key, entry);
    return entry.url;
  }
  private trimImages(): void {
    let total = 0;
    for (const e of this.images.values()) total += e.bytes;
    for (const [key, e] of this.images) {
      if (total <= IMAGE_CACHE_BYTES) break;
      if (!e.bytes) continue;
      this.images.delete(key);
      total -= e.bytes;
    }
  }
  async sendChat(chatId: string, text: string): Promise<MeetingChatMessage | undefined> {
    const r = await this.chatFetch(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: { contentType: "text", content: text } }),
    });
    if (!r.ok) throw chatError(r.status);
    return toChatMessages([(await r.json()) as GraphChatMessage], this.account?.localAccountId)[0];
  }
  async calendar(): Promise<MeetingEvent[]> {
    const token = await this.access(["https://graph.microsoft.com/Calendars.ReadBasic"], true);
    // From Monday of this week, so meetings that already took place stay in the week (joinable again).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const until = new Date(today);
    until.setDate(until.getDate() + 14);
    const query = new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: until.toISOString(),
      $select: "id,subject,start,end,organizer,onlineMeeting,isCancelled",
      $orderby: "start/dateTime",
      $top: "100",
    });
    let url: string | undefined = `https://graph.microsoft.com/v1.0/me/calendarView?${query}`;
    const events: MeetingEvent[] = [];
    while (url && events.length < 1000) {
      const parsed = new URL(url);
      if (parsed.origin !== "https://graph.microsoft.com")
        throw new JigError("meeting_calendar", "Invalid calendar continuation");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new JigError(
          "meeting_calendar",
          `Calendar request failed (${response.status}). Reconnect Microsoft or check calendar permission.`,
        );
      const data = (await response.json()) as {
        value: Array<{
          id: string;
          subject: string;
          start: { dateTime: string };
          end: { dateTime: string };
          organizer?: { emailAddress?: { name?: string } };
          onlineMeeting?: { joinUrl?: string };
          isCancelled?: boolean;
        }>;
        "@odata.nextLink"?: string;
      };
      for (const e of data.value)
        if (!e.isCancelled)
          events.push({
            id: e.id,
            title: e.subject || "Meeting",
            start: `${e.start.dateTime.replace(/Z$/, "")}Z`,
            end: `${e.end.dateTime.replace(/Z$/, "")}Z`,
            organizer: e.organizer?.emailAddress?.name ?? "",
            joinUrl: e.onlineMeeting?.joinUrl,
          });
      url = data["@odata.nextLink"];
    }
    return events;
  }
}

function chatCreateConsent(): JigError {
  return new JigError(
    "meeting_chat_create_consent",
    "Starting chats needs Microsoft's Chat.Create permission (or Chat.ReadWrite) for Jig, which your administrator has to approve.",
  );
}

function chatError(status: number): JigError {
  if (status === 401 || status === 403)
    return new JigError(
      "meeting_chat_consent",
      "Jig can't read this chat yet: ask your administrator to approve Chat.Read and ChatMessage.Send for Jig, then press Connect chat.",
    );
  if (status === 404)
    return new JigError(
      "meeting_chat_missing",
      "This meeting's chat isn't open to you yet (join the meeting first).",
    );
  return new JigError(
    "meeting_chat",
    `The Teams chat didn't answer (${status}). Jig tries again in a moment.`,
  );
}
