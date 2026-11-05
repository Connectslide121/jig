import { buildActivity, ContentError, keepActivity, type Pairing, trimActivity } from "./activities.ts";
import { type BotKeys, checkBotToken } from "./botAuth.ts";
import { type BotConnector, channelName, HttpError, type TeamChannels } from "./microsoft.ts";
import {
  type ChannelRequest,
  type Health,
  KEEP_MS,
  MAX_WAIT_S,
  type PairingRequest,
  RELAY_KEY_HEADER,
  type RelayActivity,
  type SendRequest,
  type SendResult,
  type UpdateRequest,
} from "./protocol.ts";
import { relayKeyMatches } from "./relayKey.ts";
import type { Store } from "./store.ts";

/** The parts of a Functions `HttpRequest` the relay uses (so tests pass plain objects). */
export interface RelayRequest {
  headers: { get(name: string): string | null };
  query: { get(name: string): string | null };
  params: Record<string, string | undefined>;
  text(): Promise<string>;
}

export interface RelayResponse {
  status: number;
  jsonBody?: unknown;
}

export interface RelayConfig {
  appId: string;
  tenantId: string;
  relayKey: string;
  version: string;
}

export interface RelayDeps {
  config: RelayConfig;
  store: Store;
  keys: Pick<BotKeys, "get">;
  connector: Pick<BotConnector, "send" | "update" | "startThread" | "openPersonal">;
  channels: Pick<TeamChannels, "create" | "rename" | "granted">;
  now?: () => number;
  /** How long a waiting `GET /api/updates` sleeps between looks at the store (another instance). */
  pollMs?: number;
}

/** A conversation the bot can write to without being written to first. */
export interface PersonalRef {
  conversationId: string;
  serviceUrl: string;
  userId: string;
  name?: string;
}
export interface TeamRef {
  /** The team's id in the Bot Framework (also its General channel's id). */
  teamId: string;
  /** Its Microsoft 365 group id, for Graph. */
  groupId?: string;
  name?: string;
  serviceUrl: string;
}
export interface ChannelRef {
  channelId: string;
  teamId?: string;
  name?: string;
  serviceUrl?: string;
}

/** Microsoft's fallback when the relay has seen no activity yet (proactive messages only). */
const GLOBAL_SERVICE_URL = "https://smba.trafficmanager.net/teams/";
const MAX_BODY = 512 * 1024;

const json = (status: number, jsonBody?: unknown): RelayResponse => ({ status, jsonBody });
const fail = (status: number, error: string): RelayResponse => json(status, { error });

/** Wakes waiting long polls in this instance when an activity arrives. */
class Waiters {
  private list = new Set<() => void>();
  wake() {
    for (const w of this.list) w();
    this.list.clear();
  }
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.list.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.list.add(done);
    });
  }
}

/**
 * The relay's endpoints (D-370), independent of Azure Functions so they can be tested: `index.ts`
 * registers them. Never logs message text.
 */
export function createRelay(deps: RelayDeps) {
  const { config, store } = deps;
  const now = deps.now ?? Date.now;
  const waiters = new Waiters();
  let rscCache: { at: number; value: Health["rsc"] } | undefined;

  const authorized = (req: RelayRequest) =>
    relayKeyMatches(req.headers.get(RELAY_KEY_HEADER), config.relayKey);

  async function body<T>(req: RelayRequest): Promise<T | undefined> {
    const text = await req.text();
    if (text.length > MAX_BODY) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  async function remember(a: RelayActivity, serviceUrl: string, pairing: Pairing | undefined) {
    const cd = a.channelData;
    if (a.conversation.conversationType === "personal" && a.from?.aadObjectId && a.type === "message") {
      const ref: PersonalRef = {
        conversationId: a.conversation.id,
        serviceUrl,
        userId: a.from.id,
        name: a.from.name,
      };
      await store.set(`personal:${a.from.aadObjectId}`, ref);
      if (pairing && pairing.aadObjectId === a.from.aadObjectId && pairing.userId !== a.from.id)
        await store.set("pairing", { ...pairing, userId: a.from.id, name: a.from.name ?? pairing.name });
    }
    if (!cd?.team) return;
    const gone =
      cd.eventType === "teamDeleted" || (a.type === "installationUpdate" && a.action?.startsWith("remove"));
    if (gone) {
      await store.delete(`team:${cd.team.id}`);
      for (const c of await store.list<ChannelRef>("channel:"))
        if (c.value.teamId === cd.team.id) await store.delete(c.key);
      return;
    }
    const old = await store.get<TeamRef>(`team:${cd.team.id}`);
    await store.set(`team:${cd.team.id}`, {
      teamId: cd.team.id,
      groupId: cd.team.aadGroupId ?? old?.groupId,
      name: cd.team.name ?? old?.name,
      serviceUrl,
    } satisfies TeamRef);
    if (cd.channel && cd.eventType === "channelDeleted") await store.delete(`channel:${cd.channel.id}`);
    else if (cd.channel) {
      const prev = await store.get<ChannelRef>(`channel:${cd.channel.id}`);
      await store.set(`channel:${cd.channel.id}`, {
        channelId: cd.channel.id,
        teamId: cd.team.id,
        name: cd.channel.name ?? prev?.name,
        serviceUrl,
      } satisfies ChannelRef);
    }
  }

  async function team(): Promise<TeamRef | undefined> {
    return (await store.list<TeamRef>("team:"))[0]?.value;
  }

  async function serviceUrlFor(conversationId?: string): Promise<string> {
    const base = conversationId?.split(";")[0];
    if (base) {
      const channel = await store.get<ChannelRef>(`channel:${base}`);
      if (channel?.serviceUrl) return channel.serviceUrl;
    }
    const t = await team();
    if (t) return t.serviceUrl;
    const personal = (await store.list<PersonalRef>("personal:"))[0]?.value;
    return personal?.serviceUrl ?? GLOBAL_SERVICE_URL;
  }

  async function personalChat(pairing: Pairing): Promise<{ conversationId: string; serviceUrl: string }> {
    const ref = await store.get<PersonalRef>(`personal:${pairing.aadObjectId}`);
    if (ref) return ref;
    if (!pairing.userId) throw new HttpError(409, "no_personal_chat");
    const serviceUrl = pairing.serviceUrl ?? (await serviceUrlFor());
    const conversationId = await deps.connector.openPersonal(serviceUrl, config.tenantId, pairing.userId);
    await store.set(`personal:${pairing.aadObjectId}`, {
      conversationId,
      serviceUrl,
      userId: pairing.userId,
      name: pairing.name,
    } satisfies PersonalRef);
    return { conversationId, serviceUrl };
  }

  function failure(e: unknown): RelayResponse {
    if (e instanceof ContentError) return fail(400, e.message);
    if (e instanceof HttpError) return fail(e.status === 404 || e.status === 403 ? e.status : 502, e.code);
    return fail(500, "relay_error");
  }

  return {
    /** `POST /api/messages`: Microsoft's Bot Connector delivering an activity. */
    async messages(req: RelayRequest): Promise<RelayResponse> {
      const raw = await body<Record<string, unknown>>(req);
      if (!raw || typeof raw.type !== "string") return fail(400, "bad_activity");
      const serviceUrl = typeof raw.serviceUrl === "string" ? raw.serviceUrl : undefined;
      const check = await checkBotToken(req.headers.get("authorization"), {
        appId: config.appId,
        serviceUrl,
        channelId: typeof raw.channelId === "string" ? raw.channelId : undefined,
        keys: deps.keys,
        now: Math.floor(now() / 1000),
      });
      // Microsoft: answer a token that fails any check with 403.
      if (!check.ok) return fail(403, "unauthorized");
      const activity = trimActivity(raw);
      const pairing = await store.get<Pairing>("pairing");
      // Microsoft's own, but not for Jig: acknowledge so it isn't retried, keep nothing.
      if (!keepActivity(activity, config.tenantId, pairing)) return json(200, {});
      await remember(activity, serviceUrl!, pairing);
      await store.append(activity, now());
      waiters.wake();
      return json(200, {});
    },

    /** `GET /api/updates?after=<cursor>&wait=<s>`: Jig's long poll; earlier updates are forgotten. */
    async updates(req: RelayRequest): Promise<RelayResponse> {
      if (!authorized(req)) return fail(401, "relay_key");
      const after = Math.max(0, Math.floor(Number(req.query.get("after") ?? 0)) || 0);
      const wait = Math.min(MAX_WAIT_S, Math.max(0, Number(req.query.get("wait") ?? MAX_WAIT_S) || 0));
      if (after > 0) await store.forget(after);
      const deadline = now() + wait * 1000;
      for (;;) {
        const updates = await store.after(after, 100, now());
        const left = deadline - now();
        if (updates.length || left <= 0) return json(200, { updates });
        await waiters.wait(Math.min(left, deps.pollMs ?? 1500));
      }
    },

    /** `POST /api/send`: a message as the bot. */
    async send(req: RelayRequest): Promise<RelayResponse> {
      if (!authorized(req)) return fail(401, "relay_key");
      const r = await body<SendRequest>(req);
      if (!r?.to?.kind) return fail(400, "bad_request");
      const pairing = await store.get<Pairing>("pairing");
      if (!pairing) return fail(409, "not_paired");
      try {
        const mention =
          r.mention && pairing.userId ? { id: pairing.userId, name: pairing.name ?? "you" } : undefined;
        const activity = buildActivity(r, mention);
        let result: SendResult;
        switch (r.to.kind) {
          case "personal": {
            const chat = await personalChat(pairing);
            const { id } = await deps.connector.send(chat.serviceUrl, chat.conversationId, activity);
            result = { id, conversationId: chat.conversationId };
            break;
          }
          case "conversation": {
            const url = await serviceUrlFor(r.to.conversationId);
            const { id } = await deps.connector.send(url, r.to.conversationId, activity);
            result = { id, conversationId: r.to.conversationId };
            break;
          }
          case "thread": {
            const url = await serviceUrlFor(r.to.channelId);
            const made = await deps.connector.startThread(url, config.tenantId, r.to.channelId, activity);
            result = { id: made.id, conversationId: made.conversationId };
            break;
          }
          case "reply": {
            const conversationId = `${r.to.channelId};messageid=${r.to.messageId}`;
            const url = await serviceUrlFor(r.to.channelId);
            const { id } = await deps.connector.send(url, conversationId, activity);
            result = { id, conversationId };
            break;
          }
          default:
            return fail(400, "bad_target");
        }
        return json(200, result);
      } catch (e) {
        return failure(e);
      }
    },

    /** `PUT /api/send/<id>`: replaces a message's text or card (answered on the computer). */
    async update(req: RelayRequest): Promise<RelayResponse> {
      if (!authorized(req)) return fail(401, "relay_key");
      const id = req.params.id;
      const r = await body<UpdateRequest>(req);
      if (!id || !r?.conversationId) return fail(400, "bad_request");
      try {
        const activity = buildActivity(r);
        await deps.connector.update(await serviceUrlFor(r.conversationId), r.conversationId, id, activity);
        return json(200, { id, conversationId: r.conversationId });
      } catch (e) {
        return failure(e);
      }
    },

    /** `POST /api/channels`: makes or renames a channel in the team (needs the team's RSC grant). */
    async channels(req: RelayRequest): Promise<RelayResponse> {
      if (!authorized(req)) return fail(401, "relay_key");
      const r = await body<ChannelRequest>(req);
      if (!r?.name) return fail(400, "bad_request");
      const t = await team();
      if (!t?.groupId) return fail(409, "no_team");
      const name = channelName(r.name);
      try {
        let channelId = r.id;
        if (channelId) await deps.channels.rename(t.groupId, channelId, name);
        else channelId = (await deps.channels.create(t.groupId, name, r.description)).id;
        rscCache = { at: now(), value: "granted" };
        await store.set(`channel:${channelId}`, {
          channelId,
          teamId: t.teamId,
          name,
          serviceUrl: t.serviceUrl,
        } satisfies ChannelRef);
        return json(200, { id: channelId, name });
      } catch (e) {
        if (e instanceof HttpError && e.status === 403) {
          rscCache = { at: now(), value: "missing" };
          return fail(403, "rsc_missing");
        }
        return failure(e);
      }
    },

    /** `PUT /api/pairing` pairs with an account that sent the code; `DELETE` forgets it (Disconnect). */
    async pairing(req: RelayRequest, method: string): Promise<RelayResponse> {
      if (!authorized(req)) return fail(401, "relay_key");
      if (method === "DELETE") {
        await store.delete("pairing");
        for (const p of await store.list("personal:")) await store.delete(p.key);
        await store.prune(Number.MAX_SAFE_INTEGER);
        return json(200, { paired: false });
      }
      const r = await body<PairingRequest>(req);
      if (!r?.aadObjectId) return fail(400, "bad_request");
      const ref = await store.get<PersonalRef>(`personal:${r.aadObjectId}`);
      if (!ref) return fail(404, "unknown_account");
      // Only one account: the others' 1:1 chats are forgotten.
      for (const p of await store.list("personal:"))
        if (p.key !== `personal:${r.aadObjectId}`) await store.delete(p.key);
      await store.set("pairing", {
        aadObjectId: r.aadObjectId,
        tenantId: config.tenantId,
        userId: ref.userId,
        name: ref.name,
        serviceUrl: ref.serviceUrl,
      } satisfies Pairing);
      return json(200, { paired: true, name: ref.name });
    },

    /** `GET /api/health`: what setup and Settings show. */
    async health(req: RelayRequest): Promise<RelayResponse> {
      if (!authorized(req)) return fail(401, "relay_key");
      const pairing = await store.get<Pairing>("pairing");
      const t = await team();
      let rsc: Health["rsc"] = "unknown";
      if (t?.groupId) {
        if (rscCache && now() - rscCache.at < 5 * 60_000) rsc = rscCache.value;
        else {
          try {
            rsc = (await deps.channels.granted(t.groupId)) ? "granted" : "missing";
            rscCache = { at: now(), value: rsc };
          } catch {
            rsc = "unknown";
          }
        }
      }
      const health: Health = {
        version: config.version,
        paired: !!pairing,
        personal: !!pairing && !!(await store.get(`personal:${pairing.aadObjectId}`)),
        team: t && { id: t.teamId, name: t.name },
        channels: (await store.list("channel:")).length,
        rsc,
      };
      return json(200, health);
    },

    /** The hourly timer: what Jig didn't fetch in `KEEP_MS` is deleted. */
    async prune(): Promise<number> {
      return store.prune(now() - KEEP_MS);
    },
  };
}

export type Relay = ReturnType<typeof createRelay>;
