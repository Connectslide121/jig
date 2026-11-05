/**
 * The bot's calls to Microsoft, with plain `fetch` (the Bot Framework SDK is archived, Microsoft
 * stopped supporting it at the end of 2025): app-only tokens from the bot's own tenant, the Bot
 * Connector (send, update, new conversations) and Graph (the team's channels, through the
 * resource-specific consent the team's owner granted when adding the app).
 */

type Fetch = typeof fetch;

export const BOT_SCOPE = "https://api.botframework.com/.default";
export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH = "https://graph.microsoft.com/v1.0";

export interface AppCredentials {
  appId: string;
  secret: string;
  tenantId: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** Client-credential tokens of a single-tenant app, cached until five minutes before they expire. */
export class AppTokens {
  private cache = new Map<string, { token: string; until: number }>();

  constructor(
    private readonly creds: AppCredentials,
    private readonly fetchFn: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get(scope: string): Promise<string> {
    const hit = this.cache.get(scope);
    if (hit && hit.until > this.now()) return hit.token;
    const res = await this.fetchFn(
      `https://login.microsoftonline.com/${encodeURIComponent(this.creds.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.creds.appId,
          client_secret: this.creds.secret,
          scope,
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !body.access_token) throw new HttpError(res.status, body.error ?? "token_failed");
    this.cache.set(scope, {
      token: body.access_token,
      until: this.now() + Math.max(60, (body.expires_in ?? 3600) - 300) * 1000,
    });
    return body.access_token;
  }
}

async function call<T>(
  fetchFn: Fetch,
  token: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<T | undefined> {
  const res = await fetchFn(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const err = json as { error?: { code?: string } | string } | undefined;
    const code = typeof err?.error === "string" ? err.error : (err?.error?.code ?? "request_failed");
    throw new HttpError(res.status, code);
  }
  return json as T | undefined;
}

/** A Bot Framework activity, as much of it as the relay sends. */
export interface OutActivity {
  type: "message";
  text?: string;
  textFormat?: "xml" | "markdown";
  summary?: string;
  attachments?: { contentType: string; contentUrl?: string; content?: unknown; name?: string }[];
  entities?: { type: "mention"; text: string; mentioned: { id: string; name: string } }[];
}

const join = (serviceUrl: string, path: string) => `${serviceUrl.replace(/\/+$/, "")}${path}`;

export class BotConnector {
  constructor(
    private readonly tokens: Pick<AppTokens, "get">,
    private readonly appId: string,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  private async request<T>(method: string, url: string, body: unknown): Promise<T | undefined> {
    return call<T>(this.fetchFn, await this.tokens.get(BOT_SCOPE), method, url, body);
  }

  /** Posts to a conversation (a 1:1 chat, a channel, or a thread: `<channel>;messageid=<root>`). */
  async send(serviceUrl: string, conversationId: string, activity: OutActivity): Promise<{ id: string }> {
    const res = await this.request<{ id?: string }>(
      "POST",
      join(serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/activities`),
      activity,
    );
    return { id: res?.id ?? "" };
  }

  async update(serviceUrl: string, conversationId: string, activityId: string, activity: OutActivity) {
    await this.request(
      "PUT",
      join(
        serviceUrl,
        `/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`,
      ),
      { ...activity, id: activityId },
    );
  }

  /** A new thread in a channel: its conversation id is `<channel>;messageid=<first message's id>`. */
  async startThread(
    serviceUrl: string,
    tenantId: string,
    channelId: string,
    activity: OutActivity,
  ): Promise<{ conversationId: string; id: string }> {
    const res = await this.request<{ id?: string; activityId?: string }>(
      "POST",
      join(serviceUrl, "/v3/conversations"),
      {
        isGroup: true,
        bot: { id: `28:${this.appId}` },
        tenantId,
        channelData: { channel: { id: channelId }, tenant: { id: tenantId } },
        activity,
      },
    );
    const id = res?.activityId ?? "";
    return { conversationId: res?.id ?? `${channelId};messageid=${id}`, id };
  }

  /** Opens the 1:1 chat with a user who has the app (personal scope) and returns its id. */
  async openPersonal(serviceUrl: string, tenantId: string, userId: string): Promise<string> {
    const res = await this.request<{ id?: string }>("POST", join(serviceUrl, "/v3/conversations"), {
      bot: { id: `28:${this.appId}` },
      members: [{ id: userId }],
      tenantId,
      channelData: { tenant: { id: tenantId } },
    });
    if (!res?.id) throw new HttpError(502, "no_conversation");
    return res.id;
  }
}

/** The team's channels through Graph, with the app's own token: allowed only by the team's RSC grant. */
export class TeamChannels {
  constructor(
    private readonly tokens: Pick<AppTokens, "get">,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | undefined> {
    return call<T>(this.fetchFn, await this.tokens.get(GRAPH_SCOPE), method, `${GRAPH}${path}`, body);
  }

  async create(groupId: string, name: string, description?: string): Promise<{ id: string; name: string }> {
    const res = await this.request<{ id: string; displayName: string }>(
      "POST",
      `/teams/${encodeURIComponent(groupId)}/channels`,
      { displayName: name, description, membershipType: "standard" },
    );
    if (!res?.id) throw new HttpError(502, "no_channel");
    return { id: res.id, name: res.displayName };
  }

  async rename(groupId: string, channelId: string, name: string): Promise<void> {
    await this.request(
      "PATCH",
      `/teams/${encodeURIComponent(groupId)}/channels/${encodeURIComponent(channelId)}`,
      { displayName: name },
    );
  }

  /** Reading the channels needs the RSC grant too: 200 means granted, 403 not. */
  async granted(groupId: string): Promise<boolean> {
    try {
      await this.request("GET", `/teams/${encodeURIComponent(groupId)}/channels?$select=id`);
      return true;
    } catch (e) {
      if (e instanceof HttpError && (e.status === 403 || e.status === 401)) return false;
      throw e;
    }
  }
}

/**
 * A channel name Teams accepts: at most 50 characters, none of `~ # % & * { } + / \ : < > ? | ' "`,
 * not starting with `_` or `.`, not ending with `.`. Falls back to "Jig" when nothing is left.
 */
export function channelName(name: string): string {
  let out = [...name]
    .map((c) => (c.charCodeAt(0) < 32 ? " " : c))
    .join("")
    .replace(/[~#%&*{}+/\\:<>?|'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[_.\s]+/, "");
  out = [...out]
    .slice(0, 50)
    .join("")
    .trim()
    .replace(/[.\s]+$/, "");
  return out || "Jig";
}
