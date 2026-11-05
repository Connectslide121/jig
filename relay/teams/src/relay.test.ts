import { describe, expect, it, vi } from "vitest";
import { BOT_ISSUER } from "./botAuth.ts";
import { HttpError } from "./microsoft.ts";
import { KEEP_MS, READER_HEADER, READER_WINDOW_MS, RELAY_KEY_HEADER, type RelayUpdate } from "./protocol.ts";
import { createRelay, type RelayRequest } from "./relay.ts";
import { MemoryStore } from "./store.ts";
import { testSigner } from "./testing.ts";

const APP = "app-id";
const TENANT = "tenant-1";
const KEY = "k".repeat(43);
const SERVICE = "https://smba.trafficmanager.net/emea/";
const signer = testSigner();

function setup() {
  let now = 1_800_000_000_000;
  const store = new MemoryStore();
  const connector = {
    send: vi.fn(async () => ({ id: "sent-1" })),
    update: vi.fn(async () => {}),
    startThread: vi.fn(async (_s: string, _t: string, channelId: string) => ({
      conversationId: `${channelId};messageid=root-1`,
      id: "root-1",
    })),
    openPersonal: vi.fn(async () => "a:opened"),
  };
  const channels = {
    create: vi.fn(async (_g: string, name: string) => ({ id: "19:made", name })),
    rename: vi.fn(async () => {}),
    granted: vi.fn(async () => true),
  };
  const relay = createRelay({
    config: { appId: APP, tenantId: TENANT, relayKey: KEY, version: "9.9.9" },
    store,
    keys: signer.keys,
    connector,
    channels,
    now: () => now,
    pollMs: 5,
  });
  const clock = { advance: (ms: number) => (now += ms), now: () => now };
  return { relay, store, connector, channels, clock };
}

function req(opts: { body?: unknown; headers?: Record<string, string>; query?: string; params?: object }) {
  const headers = new Headers(opts.headers);
  return {
    headers,
    query: new URLSearchParams(opts.query ?? ""),
    params: { ...opts.params },
    text: async () => (opts.body === undefined ? "" : JSON.stringify(opts.body)),
  } satisfies RelayRequest;
}
const keyed = (o: Parameters<typeof req>[0] = {}) => req({ ...o, headers: { [RELAY_KEY_HEADER]: KEY } });

/** An activity as Microsoft posts it, with a valid token. */
function deliver(
  relay: ReturnType<typeof setup>["relay"],
  activity: Record<string, unknown>,
  nowMs?: number,
) {
  const token = signer.token({
    iss: BOT_ISSUER,
    aud: APP,
    exp: Math.floor((nowMs ?? 1_800_000_000_000) / 1000) + 3600,
    serviceurl: SERVICE,
  });
  return relay.messages(
    req({
      body: { serviceUrl: SERVICE, channelId: "msteams", ...activity },
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

const personal = (text: string, who = "alex") => ({
  type: "message",
  id: `m-${text}`,
  text,
  from: { id: `29:${who}`, aadObjectId: `oid-${who}`, name: who === "alex" ? "Alex" : "Sam" },
  conversation: { id: `a:${who}`, conversationType: "personal", tenantId: TENANT },
});
const teamInstall = {
  type: "conversationUpdate",
  from: { id: "29:alex", aadObjectId: "oid-alex" },
  conversation: { id: "19:team@thread.tacv2", conversationType: "channel", tenantId: TENANT },
  channelData: {
    eventType: "teamMemberAdded",
    tenant: { id: TENANT },
    team: { id: "19:team@thread.tacv2", name: "Jig", aadGroupId: "group-1" },
  },
};

async function updates(relay: ReturnType<typeof setup>["relay"], after = 0, wait = 0) {
  const res = await relay.updates(keyed({ query: `after=${after}&wait=${wait}` }));
  return (res.jsonBody as { updates: RelayUpdate[] }).updates;
}

async function paired() {
  const s = setup();
  await deliver(s.relay, personal("123456"));
  await s.relay.pairing(keyed({ body: { aadObjectId: "oid-alex" } }), "PUT");
  return s;
}

describe("POST /api/messages", () => {
  it("answers 403 to a request without Microsoft's token and keeps nothing", async () => {
    const { relay, store } = setup();
    const res = await relay.messages(req({ body: { ...personal("123456"), serviceUrl: SERVICE } }));
    expect(res.status).toBe(403);
    expect(await store.after(0, 10, Date.now())).toEqual([]);
  });

  it("before pairing keeps only a code from a 1:1 chat, with the account Jig pairs", async () => {
    const { relay } = setup();
    expect((await deliver(relay, personal("hello"))).status).toBe(200);
    expect((await deliver(relay, personal("123456"))).status).toBe(200);
    const got = await updates(relay);
    expect(got.map((u) => u.activity.text)).toEqual(["123456"]);
    expect(got[0]!.activity.from?.aadObjectId).toBe("oid-alex");
    expect(got[0]!.activity).not.toHaveProperty("serviceUrl");
  });

  it("once paired keeps only the paired account (and the bot's events)", async () => {
    const { relay } = await paired();
    await deliver(relay, personal("from sam", "sam"));
    await deliver(relay, personal("from alex"));
    await deliver(relay, teamInstall);
    const got = await updates(relay, 1);
    expect(got.map((u) => u.activity.text ?? u.activity.type)).toEqual(["from alex", "conversationUpdate"]);
  });
});

describe("GET /api/updates", () => {
  it("needs the relay key", async () => {
    const { relay } = setup();
    expect((await relay.updates(req({}))).status).toBe(401);
    expect((await relay.updates(req({ headers: { [RELAY_KEY_HEADER]: `${KEY}x` } }))).status).toBe(401);
  });

  it("pages by cursor and forgets what Jig confirmed", async () => {
    const { relay, store } = await paired();
    await deliver(relay, personal("one"));
    await deliver(relay, personal("two"));
    const all = await updates(relay);
    expect(all.map((u) => u.cursor)).toEqual([1, 2, 3]);
    expect((await updates(relay, 2)).map((u) => u.activity.text)).toEqual(["two"]);
    // after=2 confirmed 1 and 2: they're gone even for a later after=0.
    expect((await updates(relay)).map((u) => u.cursor)).toEqual([3]);
    expect(await store.prune(Number.MAX_SAFE_INTEGER)).toBe(1);
  });

  it("waits for something new and answers as soon as it arrives", async () => {
    const { relay } = await paired();
    const waiting = relay.updates(keyed({ query: "after=1&wait=25" }));
    await new Promise((r) => setTimeout(r, 20));
    await deliver(relay, personal("late"));
    const res = await waiting;
    expect((res.jsonBody as { updates: RelayUpdate[] }).updates.map((u) => u.activity.text)).toEqual([
      "late",
    ]);
  });

  it("returns an empty list when nothing came in time", async () => {
    const { relay, clock } = await paired();
    const tick = setInterval(() => clock.advance(500), 2);
    const res = await relay.updates(keyed({ query: "after=1&wait=1" }));
    clearInterval(tick);
    expect((res.jsonBody as { updates: unknown[] }).updates).toEqual([]);
  });

  it("keeps updates 24 hours: older ones are hidden and pruned", async () => {
    const { relay, clock, store } = await paired();
    clock.advance(KEEP_MS + 1000);
    expect(await updates(relay)).toEqual([]);
    expect(await relay.prune()).toBe(1);
    await deliver(relay, personal("fresh"), clock.now());
    expect((await updates(relay)).map((u) => u.activity.text)).toEqual(["fresh"]);
    expect(await store.prune(0)).toBe(0);
  });

  it("answers 409 to a second Jig while the first one polls", async () => {
    const { relay, clock } = await paired();
    const poll = (reader: string) =>
      relay.updates(
        req({ query: "after=0&wait=0", headers: { [RELAY_KEY_HEADER]: KEY, [READER_HEADER]: reader } }),
      );
    expect((await poll("home")).status).toBe(200);
    expect((await poll("laptop")).jsonBody).toEqual({ error: "another_reader" });
    expect((await poll("home")).status).toBe(200);
    clock.advance(READER_WINDOW_MS + 1);
    expect((await poll("laptop")).status).toBe(200);
  });
});

describe("pairing", () => {
  it("pairs only an account that wrote to the bot, and Disconnect forgets everything", async () => {
    const { relay, store } = setup();
    expect((await relay.pairing(keyed({ body: { aadObjectId: "oid-alex" } }), "PUT")).status).toBe(404);
    await deliver(relay, personal("123456"));
    await deliver(relay, personal("654321", "sam"));
    const res = await relay.pairing(keyed({ body: { aadObjectId: "oid-alex" } }), "PUT");
    expect(res).toEqual({ status: 200, jsonBody: { paired: true, name: "Alex" } });
    expect(await store.list("personal:")).toHaveLength(1);
    await relay.pairing(keyed(), "DELETE");
    expect(await store.get("pairing")).toBeUndefined();
    expect(await store.list("personal:")).toEqual([]);
    expect(await updates(relay)).toEqual([]);
  });
});

describe("POST /api/send and PUT /api/send/<id>", () => {
  it("needs the key and a pairing", async () => {
    const { relay } = setup();
    expect((await relay.send(req({ body: { to: { kind: "personal" }, text: "x" } }))).status).toBe(401);
    expect((await relay.send(keyed({ body: { to: { kind: "personal" }, text: "x" } }))).jsonBody).toEqual({
      error: "not_paired",
    });
  });

  it("sends to the 1:1 chat it saw, as the bot", async () => {
    const { relay, connector } = await paired();
    const res = await relay.send(keyed({ body: { to: { kind: "personal" }, text: "<b>Hi</b>" } }));
    expect(res).toEqual({ status: 200, jsonBody: { id: "sent-1", conversationId: "a:alex" } });
    expect(connector.send).toHaveBeenCalledWith(SERVICE, "a:alex", {
      type: "message",
      text: "<b>Hi</b>",
      textFormat: "xml",
    });
  });

  it("starts a thread in a channel and replies in it, mentioning you when asked", async () => {
    const { relay, connector } = await paired();
    await deliver(relay, teamInstall);
    const made = await relay.send(
      keyed({ body: { to: { kind: "thread", channelId: "19:shop" }, text: "Fix" } }),
    );
    expect(made.jsonBody).toEqual({ id: "root-1", conversationId: "19:shop;messageid=root-1" });
    expect(connector.startThread).toHaveBeenCalledWith(SERVICE, TENANT, "19:shop", {
      type: "message",
      text: "Fix",
      textFormat: "xml",
    });
    await relay.send(
      keyed({
        body: {
          to: { kind: "reply", channelId: "19:shop", messageId: "root-1" },
          text: "Allow?",
          mention: true,
        },
      }),
    );
    expect(connector.send).toHaveBeenLastCalledWith(SERVICE, "19:shop;messageid=root-1", {
      type: "message",
      text: "<at>Alex</at> Allow?",
      textFormat: "xml",
      entities: [{ type: "mention", text: "<at>Alex</at>", mentioned: { id: "29:alex", name: "Alex" } }],
    });
  });

  it("opens the 1:1 chat when the bot has none yet", async () => {
    const { relay, store, connector } = await paired();
    await store.delete("personal:oid-alex");
    const res = await relay.send(keyed({ body: { to: { kind: "personal" }, text: "x" } }));
    expect(connector.openPersonal).toHaveBeenCalledWith(SERVICE, TENANT, "29:alex");
    expect(res.jsonBody).toEqual({ id: "sent-1", conversationId: "a:opened" });
  });

  it("updates a card answered on the computer", async () => {
    const { relay, connector } = await paired();
    const card = { type: "AdaptiveCard", version: "1.5", body: [{ type: "TextBlock", text: "Allowed" }] };
    const res = await relay.update(
      keyed({ params: { id: "sent-1" }, body: { conversationId: "a:alex", card } }),
    );
    expect(res.status).toBe(200);
    expect(connector.update).toHaveBeenCalledWith(SERVICE, "a:alex", "sent-1", {
      type: "message",
      attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }],
    });
  });

  it("answers bad content with 400 and Microsoft's refusals with their code", async () => {
    const { relay, connector } = await paired();
    expect((await relay.send(keyed({ body: { to: { kind: "personal" } } }))).jsonBody).toEqual({
      error: "empty",
    });
    connector.send.mockRejectedValueOnce(new HttpError(403, "MessageWritesBlocked"));
    expect(await relay.send(keyed({ body: { to: { kind: "personal" }, text: "x" } }))).toEqual({
      status: 403,
      jsonBody: { error: "MessageWritesBlocked" },
    });
  });
});

describe("POST /api/channels and GET /api/health", () => {
  it("needs the team the bot was added to", async () => {
    const { relay } = await paired();
    expect((await relay.channels(keyed({ body: { name: "Shop" } }))).jsonBody).toEqual({ error: "no_team" });
  });

  it("creates and renames channels with a name Teams accepts", async () => {
    const { relay, channels } = await paired();
    await deliver(relay, teamInstall);
    const made = await relay.channels(keyed({ body: { name: "Shop: web/app", description: "Jig" } }));
    expect(made.jsonBody).toEqual({ id: "19:made", name: "Shop web app" });
    expect(channels.create).toHaveBeenCalledWith("group-1", "Shop web app", "Jig");
    await relay.channels(keyed({ body: { id: "19:made", name: "Shop 2" } }));
    expect(channels.rename).toHaveBeenCalledWith("group-1", "19:made", "Shop 2");
  });

  it("reports a missing RSC grant", async () => {
    const { relay, channels } = await paired();
    await deliver(relay, teamInstall);
    channels.create.mockRejectedValueOnce(new HttpError(403, "Forbidden"));
    expect(await relay.channels(keyed({ body: { name: "Shop" } }))).toEqual({
      status: 403,
      jsonBody: { error: "rsc_missing" },
    });
    expect(((await relay.health(keyed())).jsonBody as { rsc: string }).rsc).toBe("missing");
  });

  it("tells setup what the relay knows", async () => {
    const { relay, channels } = await paired();
    expect((await relay.health(req({}))).status).toBe(401);
    expect((await relay.health(keyed())).jsonBody).toEqual({
      version: "9.9.9",
      paired: true,
      personal: true,
      app: true,
      team: undefined,
      channels: 0,
      rsc: "unknown",
    });
    await deliver(relay, teamInstall);
    await deliver(relay, {
      ...teamInstall,
      channelData: {
        ...teamInstall.channelData,
        eventType: "channelCreated",
        channel: { id: "19:x", name: "X" },
      },
    });
    expect((await relay.health(keyed())).jsonBody).toMatchObject({
      team: { id: "19:team@thread.tacv2", name: "Jig" },
      channels: 1,
      rsc: "granted",
    });
    expect(channels.granted).toHaveBeenCalledWith("group-1");
  });

  it("tells setup the app was added for yourself, before pairing, until it is removed", async () => {
    const { relay } = setup();
    const health = async () => ((await relay.health(keyed())).jsonBody as { app: boolean }).app;
    expect(await health()).toBe(false);
    const install = {
      type: "installationUpdate",
      action: "add",
      from: { id: "29:alex", aadObjectId: "oid-alex" },
      conversation: { id: "a:alex", conversationType: "personal", tenantId: TENANT },
    };
    await deliver(relay, install);
    expect(await health()).toBe(true);
    await deliver(relay, { ...install, action: "remove" });
    expect(await health()).toBe(false);
    // Another tenant's install isn't kept, so it doesn't count either.
    await deliver(relay, { ...install, conversation: { ...install.conversation, tenantId: "other" } });
    expect(await health()).toBe(false);
  });

  it("forgets the team when the app is removed from it", async () => {
    const { relay } = await paired();
    await deliver(relay, teamInstall);
    await deliver(relay, { ...teamInstall, type: "installationUpdate", action: "remove" });
    expect(((await relay.health(keyed())).jsonBody as { team?: unknown }).team).toBeUndefined();
  });
});
