import { describe, expect, it, vi } from "vitest";
import {
  AppTokens,
  BOT_SCOPE,
  BotConnector,
  channelName,
  GRAPH_SCOPE,
  HttpError,
  TeamChannels,
} from "./microsoft.ts";

type Call = { url: string; method?: string; body?: unknown; headers?: Record<string, string> };

function fakeFetch(respond: (c: Call) => { status?: number; body?: unknown } = () => ({ body: {} })) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const raw = init.body;
    const body =
      raw instanceof URLSearchParams
        ? Object.fromEntries(raw)
        : typeof raw === "string"
          ? JSON.parse(raw)
          : raw;
    const call = { url, method: init.method, body, headers: init.headers as Record<string, string> };
    calls.push(call);
    const r = respond(call);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const tokens = { get: async (scope: string) => `token-for-${scope}` };

describe("AppTokens", () => {
  it("asks the bot's own tenant for a client-credential token and caches it", async () => {
    let now = 0;
    const f = fakeFetch(() => ({ body: { access_token: "abc", expires_in: 3600 } }));
    const t = new AppTokens({ appId: "app", secret: "s3cret", tenantId: "tenant-1" }, f.fn, () => now);
    expect(await t.get(BOT_SCOPE)).toBe("abc");
    expect(await t.get(BOT_SCOPE)).toBe("abc");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    expect(f.calls[0]!.body).toEqual({
      grant_type: "client_credentials",
      client_id: "app",
      client_secret: "s3cret",
      scope: BOT_SCOPE,
    });
    now = 3400_000;
    await t.get(BOT_SCOPE);
    expect(f.calls).toHaveLength(2);
  });

  it("fails with Entra's error code", async () => {
    const f = fakeFetch(() => ({ status: 401, body: { error: "invalid_client" } }));
    const t = new AppTokens({ appId: "app", secret: "x", tenantId: "t" }, f.fn);
    await expect(t.get(GRAPH_SCOPE)).rejects.toMatchObject({ status: 401, code: "invalid_client" });
  });
});

describe("BotConnector", () => {
  const SERVICE = "https://smba.trafficmanager.net/emea/";

  it("sends to a conversation and updates an activity", async () => {
    const f = fakeFetch(() => ({ body: { id: "m1" } }));
    const c = new BotConnector(tokens, "app", f.fn);
    expect(await c.send(SERVICE, "19:c@thread.tacv2;messageid=1", { type: "message", text: "hi" })).toEqual({
      id: "m1",
    });
    expect(f.calls[0]!.url).toBe(
      `${SERVICE}v3/conversations/19%3Ac%40thread.tacv2%3Bmessageid%3D1/activities`,
    );
    expect(f.calls[0]!.headers?.authorization).toBe(`Bearer token-for-${BOT_SCOPE}`);
    await c.update(SERVICE, "a:1", "m1", { type: "message", text: "edited" });
    expect(f.calls[1]).toMatchObject({
      method: "PUT",
      url: `${SERVICE}v3/conversations/a%3A1/activities/m1`,
      body: { type: "message", text: "edited", id: "m1" },
    });
  });

  it("starts a thread in a channel", async () => {
    const f = fakeFetch(() => ({ body: { id: "19:c;messageid=77", activityId: "77" } }));
    const c = new BotConnector(tokens, "app", f.fn);
    const r = await c.startThread(SERVICE, "tenant-1", "19:c", { type: "message", text: "Fix login" });
    expect(r).toEqual({ conversationId: "19:c;messageid=77", id: "77" });
    expect(f.calls[0]).toMatchObject({
      method: "POST",
      url: `${SERVICE}v3/conversations`,
      body: {
        isGroup: true,
        bot: { id: "28:app" },
        tenantId: "tenant-1",
        channelData: { channel: { id: "19:c" }, tenant: { id: "tenant-1" } },
        activity: { type: "message", text: "Fix login" },
      },
    });
  });

  it("opens a 1:1 chat with the user", async () => {
    const f = fakeFetch(() => ({ body: { id: "a:new" } }));
    const c = new BotConnector(tokens, "app", f.fn);
    expect(await c.openPersonal(SERVICE, "tenant-1", "29:alex")).toBe("a:new");
    expect(f.calls[0]!.body).toMatchObject({ members: [{ id: "29:alex" }], tenantId: "tenant-1" });
  });

  it("turns Microsoft's errors into HttpError", async () => {
    const f = fakeFetch(() => ({ status: 403, body: { error: { code: "MessageWritesBlocked" } } }));
    const c = new BotConnector(tokens, "app", f.fn);
    const err = await c.send(SERVICE, "a:1", { type: "message", text: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 403, code: "MessageWritesBlocked" });
  });
});

describe("TeamChannels", () => {
  it("creates and renames channels through Graph with the app's token", async () => {
    const f = fakeFetch((c) => (c.method === "POST" ? { body: { id: "19:new", displayName: "Shop" } } : {}));
    const g = new TeamChannels(tokens, f.fn);
    expect(await g.create("group-1", "Shop", "Jig: Shop")).toEqual({ id: "19:new", name: "Shop" });
    expect(f.calls[0]).toMatchObject({
      url: "https://graph.microsoft.com/v1.0/teams/group-1/channels",
      body: { displayName: "Shop", description: "Jig: Shop", membershipType: "standard" },
      headers: { authorization: `Bearer token-for-${GRAPH_SCOPE}` },
    });
    await g.rename("group-1", "19:new", "Shop 2");
    expect(f.calls[1]).toMatchObject({
      method: "PATCH",
      url: "https://graph.microsoft.com/v1.0/teams/group-1/channels/19%3Anew",
      body: { displayName: "Shop 2" },
    });
  });

  it("tells whether the team's RSC grant is there", async () => {
    expect(await new TeamChannels(tokens, fakeFetch(() => ({ body: { value: [] } })).fn).granted("g")).toBe(
      true,
    );
    expect(await new TeamChannels(tokens, fakeFetch(() => ({ status: 403, body: {} })).fn).granted("g")).toBe(
      false,
    );
    await expect(
      new TeamChannels(tokens, fakeFetch(() => ({ status: 500, body: {} })).fn).granted("g"),
    ).rejects.toBeInstanceOf(HttpError);
  });
});

describe("channelName", () => {
  it("makes a name Teams accepts", () => {
    expect(channelName("Shop")).toBe("Shop");
    expect(channelName("  _.Shop: web/app?  ")).toBe("Shop web app");
    expect(channelName("Contoso #1 & co.")).toBe("Contoso 1 co");
    expect(channelName("x".repeat(80))).toHaveLength(50);
    expect(channelName("???")).toBe("Jig");
  });
});
