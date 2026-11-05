import { describe, expect, it, vi } from "vitest";
import type { RelayActivity, RelayUpdate, SendRequest } from "../../../../../relay/teams/src/protocol";
import type { PermissionDecision, SessionMeta } from "../../shared/engine";
import { isTeamsCredential, parseTeamsCredential, teamsCredential } from "../../shared/phone";
import { ChannelError } from "./channel";
import type { PermissionItem } from "./messages";
import { COMMANDS, PhoneService, type PhoneSettings, type SavedPhone } from "./service";
import {
  adaptiveCard,
  type RelayApi,
  RelayError,
  readTeamsText,
  TeamsChannel,
  teamsCommandLists,
  teamsHtml,
  teamsRelayBase,
} from "./teams";

const KEY = "k".repeat(43);
const NOW = Date.parse("2026-11-05T10:00:00Z");

const TEAM = "19:general@thread.tacv2";

/**
 * A relay that records calls; `updates` hands out what "Teams" posted. With `team` the bot is in a
 * team (D-380): channels are made (`rsc: "missing"` refuses them), threads started in them.
 */
function fakeRelay(options: { team?: boolean; rsc?: "granted" | "missing" } = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const queue: RelayUpdate[] = [];
  const gone = new Set<string>();
  let cursor = 0;
  let sentId = 0;
  let channelId = 0;
  let fail: RelayError | Error | undefined;
  const api: RelayApi = {
    async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
      if (fail) throw fail;
      calls.push({ method, path, ...(body !== undefined ? { body } : {}) });
      if (path === "health")
        return {
          version: "test",
          paired: true,
          personal: true,
          ...(options.team ? { team: { id: TEAM, name: "Jig" } } : {}),
          channels: channelId,
          rsc: options.team ? (options.rsc ?? "granted") : "unknown",
        } as T;
      if (path === "channels") {
        const r = body as { id?: string; name: string };
        if (options.rsc === "missing") throw new RelayError("403", 403, "rsc_missing");
        return { id: r.id ?? `19:ch${++channelId}@thread.tacv2`, name: r.name } as T;
      }
      if (method === "POST" && path === "send") {
        const to = (body as SendRequest).to;
        const where =
          to.kind === "thread" ? to.channelId : to.kind === "conversation" ? to.conversationId : "";
        if (gone.has(where.split(";")[0]!)) throw new RelayError("404", 404, "not_found");
        const id = `a${++sentId}`;
        if (to.kind === "thread") return { id, conversationId: `${to.channelId};messageid=${id}` } as T;
        if (to.kind === "conversation") return { id, conversationId: to.conversationId } as T;
        return { id, conversationId: "a:personal" } as T;
      }
      if (path.startsWith("updates")) {
        const after = Number(/after=(\d+)/.exec(path)?.[1] ?? 0);
        const ready = queue.filter((u) => u.cursor > after);
        if (ready.length) return { updates: ready } as T;
        return new Promise<T>((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
          setTimeout(() => resolve({ updates: [] } as T), 20);
        });
      }
      return { ok: true } as T;
    },
  };
  const post = (activity: Partial<RelayActivity>) =>
    queue.push({
      cursor: ++cursor,
      received: NOW,
      activity: {
        type: "message",
        id: `m${cursor}`,
        timestamp: new Date(NOW).toISOString(),
        from: { id: "29:alex", aadObjectId: "oid-alex", name: "Alex" },
        conversation: { id: "a:personal", conversationType: "personal" },
        ...activity,
      },
    });
  return {
    api,
    calls,
    post,
    sends: () =>
      calls.filter((c) => c.method === "POST" && c.path === "send").map((c) => c.body as SendRequest),
    failWith: (error: RelayError | Error | undefined) => {
      fail = error;
    },
    /** You deleted a channel in Teams: sends to it fail, and the relay passes the event on. */
    deleteChannel: (id: string) => {
      gone.add(id);
      post({
        type: "conversationUpdate",
        from: { id: "29:alex", aadObjectId: "oid-alex" },
        conversation: { id: TEAM, conversationType: "channel" },
        channelData: { eventType: "channelDeleted", team: { id: TEAM }, channel: { id } },
      });
    },
    /** You wrote in a channel thread (`<channel>;messageid=<root>`) or a new post. */
    inThread: (thread: string, text: string) =>
      post({
        text: `<at>Jig</at> ${text}`,
        conversation: { id: thread, conversationType: "channel" },
        channelData: { team: { id: TEAM }, channel: { id: thread.split(";")[0]! } },
      }),
  };
}

const update = (activity: Partial<RelayActivity>, cursor = 1): RelayUpdate => ({
  cursor,
  received: NOW,
  activity: {
    type: "message",
    id: "m1",
    timestamp: new Date(NOW).toISOString(),
    from: { id: "29:alex", aadObjectId: "oid-alex", name: "Alex" },
    conversation: { id: "a:personal", conversationType: "personal" },
    ...activity,
  },
});

describe("the Teams credential", () => {
  it("is the relay's https address and its key", () => {
    const credential = teamsCredential("https://shop-relay.azurewebsites.net/", KEY);
    expect(credential).toBe(`https://shop-relay.azurewebsites.net#${KEY}`);
    expect(parseTeamsCredential(credential)).toEqual({
      url: "https://shop-relay.azurewebsites.net",
      key: KEY,
    });
    expect(isTeamsCredential(`http://shop-relay.azurewebsites.net#${KEY}`)).toBe(false);
    expect(isTeamsCredential("https://shop-relay.azurewebsites.net#short")).toBe(false);
    expect(isTeamsCredential(`123456789:${"A".repeat(35)}`)).toBe(false);
  });

  it("points elsewhere only with the fake engine", () => {
    const url = "https://shop-relay.azurewebsites.net";
    expect(teamsRelayBase(url, { JIG_TEAMS_RELAY: "http://127.0.0.1:1" })).toBe(url);
    expect(teamsRelayBase(url, { JIG_ENGINE: "fake", JIG_TEAMS_RELAY: "http://127.0.0.1:1" })).toBe(
      "http://127.0.0.1:1",
    );
  });
});

describe("rendering for Teams", () => {
  it("keeps Jig's markup, with line breaks Teams shows", () => {
    expect(teamsHtml("<b>Shop</b>\nnext\n<pre>a\nb</pre>\nend")).toBe(
      "<b>Shop</b><br>next<br><pre>a\nb</pre><br>end",
    );
  });

  it("makes buttons an Adaptive Card 1.5 with Telegram's callback data", () => {
    const card = adaptiveCard(
      '🔐 <b>Shop</b> wants to run <code>npm test</code>\n\n<pre>npm test &amp;&amp; echo &lt;ok&gt;</pre>\n\n<i>Reply</i> <a href="https://x.test">here</a>',
      [
        [
          { text: "✅ Allow", data: "p:0:a" },
          { text: "❌ Deny", data: "p:0:d" },
        ],
        [{ text: "💬 Open chat", data: "o:s1" }],
      ],
    );
    expect(card).toMatchObject({ type: "AdaptiveCard", version: "1.5" });
    expect(card.body).toEqual([
      { type: "TextBlock", text: "🔐 **Shop** wants to run npm test", wrap: true },
      { type: "TextBlock", text: "npm test && echo <ok>", wrap: true, fontType: "Monospace" },
      { type: "TextBlock", text: "_Reply_ [here](https://x.test)", wrap: true },
      {
        type: "ActionSet",
        actions: [
          { type: "Action.Submit", title: "✅ Allow", data: { jig: "p:0:a" } },
          { type: "Action.Submit", title: "❌ Deny", data: { jig: "p:0:d" } },
        ],
      },
      {
        type: "ActionSet",
        actions: [{ type: "Action.Submit", title: "💬 Open chat", data: { jig: "o:s1" } }],
      },
    ]);
  });

  it("lists the fixed commands for the app package", () => {
    const [list] = teamsCommandLists(COMMANDS);
    expect(list?.scopes).toEqual(["personal"]);
    expect(list?.commands.map((c) => c.title)).toContain("status");
    expect(list?.commands.length).toBeLessThanOrEqual(10);
  });
});

describe("reading what you write in Teams", () => {
  it("drops mentions and markup, and takes a quoted reply's message", () => {
    expect(readTeamsText("<at>Jig</at> hello <b>there</b>")).toEqual({ text: "hello there" });
    expect(
      readTeamsText(
        '<blockquote itemscope="" itemtype="http://schema.skype.com/Reply" itemid="1730800000000"><b>Jig</b> Finished</blockquote><p>yes, deploy</p>',
      ),
    ).toEqual({ text: "yes, deploy", replyTo: "1730800000000" });
  });

  it("turns a command picked from the menu into the command", () => {
    expect(readTeamsText("status").text).toBe("/status");
    expect(readTeamsText("queue shop").text).toBe("/queue shop");
    expect(readTeamsText("/screen").text).toBe("/screen");
    expect(readTeamsText("status of the shop build please, and more").text).toBe(
      "status of the shop build please, and more",
    );
    expect(readTeamsText("help me find the bug").text).toBe("help me find the bug");
  });
});

describe("TeamsChannel", () => {
  const channel = (relay = fakeRelay(), fit?: (photo: Buffer) => Buffer | undefined) =>
    new TeamsChannel({ api: relay.api, now: () => NOW, ...(fit ? { fit } : {}) });

  it("long-polls from its cursor, so the relay forgets what Jig has", async () => {
    const relay = fakeRelay();
    const teams = channel(relay);
    relay.post({ text: "123456" });
    relay.post({ text: "hello" });
    expect((await teams.poll(new AbortController().signal)).length).toBe(2);
    await teams.poll(new AbortController().signal);
    expect(relay.calls.filter((c) => c.path.startsWith("updates")).map((c) => c.path)).toEqual([
      "updates?after=0&wait=25",
      "updates?after=2&wait=25",
    ]);
  });

  it("says why a poll failed: the key, another Jig, or no answer", async () => {
    const relay = fakeRelay();
    const teams = channel(relay);
    const reason = async () =>
      teams.poll(new AbortController().signal).catch((error: ChannelError) => error.reason);
    relay.failWith(new RelayError("401", 401, "relay_key"));
    expect(await reason()).toBe("auth");
    relay.failWith(new RelayError("409", 409, "another_reader"));
    expect(await reason()).toBe("conflict");
    relay.failWith(new RelayError("The Teams relay can't be reached."));
    expect(await reason()).toBe("unreachable");
    relay.failWith(new RelayError("502", 502, "bot_connector"));
    expect(await reason()).toBe("unreachable");
  });

  it("reads messages in the 1:1 chat as private ones from your Entra account", () => {
    const read = channel().read(update({ text: "<p>hello</p>", replyToId: "a3" }));
    expect(read).toEqual({
      kind: "message",
      id: "m1",
      date: NOW / 1000,
      chat: "oid-alex",
      private: true,
      from: { id: "oid-alex", name: "Alex" },
      replyTo: "a3",
      text: "hello",
    });
    expect(channel().read(update({ type: "conversationUpdate" }))).toBeUndefined();
    expect(channel().read(update({ text: "", attachments: [{ contentType: "image/png" }] }))).toMatchObject({
      attachment: true,
    });
    expect(
      channel().read(update({ text: "hi", attachments: [{ contentType: "text/html" }] })),
    ).not.toHaveProperty("attachment");
  });

  it("reads a card's button as a tap with its data, and ignores old ones", () => {
    expect(channel().read(update({ value: { jig: "p:0:a" } }))).toEqual({
      kind: "tap",
      id: "m1",
      from: { id: "oid-alex", name: "Alex" },
      data: "p:0:a",
    });
    const old = new Date(NOW - 11 * 60_000).toISOString();
    expect(channel().read(update({ value: { jig: "p:0:a" }, timestamp: old }))).toBeUndefined();
  });

  it("sends text, cards with a preview, and pictures that fit", async () => {
    const relay = fakeRelay();
    const teams = channel(relay, (photo) => (photo.length > 4 ? undefined : photo));
    const to = { chat: "oid-alex" };
    await teams.send(to, { text: "<b>Hi</b>\nthere" });
    await teams.send(to, {
      text: "🔐 <b>Shop</b> wants\nmore",
      buttons: [[{ text: "Allow", data: "p:0:a" }]],
    });
    await teams.send(to, { text: "🖥 Jig" }, Buffer.from([0xff, 0xd8, 1, 2]));
    await teams.send(to, { text: "🖥 Jig" }, Buffer.from("too big for Teams"));
    const [text, card, photo, big] = relay.sends();
    expect(text).toEqual({ to: { kind: "personal" }, text: "<b>Hi</b><br>there" });
    expect(card?.card).toMatchObject({ version: "1.5" });
    expect(card?.summary).toBe("🔐 Shop wants");
    expect(card).not.toHaveProperty("text");
    expect(photo?.image).toEqual({ contentType: "image/jpeg", data: "/9gBAg==", name: "screenshot.jpg" });
    expect(big).not.toHaveProperty("image");
    expect(big?.text).toContain("too big");
  });

  it("updates an answered card in its conversation, without its buttons", async () => {
    const relay = fakeRelay();
    const teams = channel(relay);
    const ref = await teams.send(
      { chat: "oid-alex" },
      { text: "🔐 Shop", buttons: [[{ text: "Allow", data: "p:0:a" }]] },
    );
    await teams.edit({ chat: "oid-alex" }, ref, { text: "🔐 Shop\n\n✅ Allowed on the computer" });
    const put = relay.calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe(`send/${ref}`);
    expect(put?.body).toMatchObject({ conversationId: "a:personal" });
    const body = (put!.body as { card: { body: Array<{ type: string }> } }).card.body;
    expect(body.map((b) => b.type)).toEqual(["TextBlock", "TextBlock"]);
  });

  it("writes back only a refused tap, in the tap's conversation", async () => {
    const relay = fakeRelay();
    const teams = channel(relay);
    teams.read(update({ id: "t1", value: { jig: "p:0:a" } }));
    teams.read(update({ id: "t2", value: { jig: "p:9:a" } }));
    await teams.answerTap("t1", "Done");
    await teams.answerTap("t2", "This is no longer waiting.");
    expect(relay.sends()).toEqual([
      { to: { kind: "conversation", conversationId: "a:personal" }, text: "This is no longer waiting." },
    ]);
  });

  it("pairs and unpairs with the relay", async () => {
    const relay = fakeRelay();
    const teams = channel(relay);
    await teams.pair("oid-alex");
    await teams.unpair();
    expect(relay.calls).toEqual([
      { method: "PUT", path: "pairing", body: { aadObjectId: "oid-alex" } },
      { method: "DELETE", path: "pairing" },
    ]);
  });
});

/** The whole flow through `PhoneService`: pair by code, a request as a card, Allow from Teams. */
describe("PhoneService on Teams", () => {
  it("pairs by code, sends a request as a card and takes Allow from it", async () => {
    const relay = fakeRelay();
    const store = new Map<string, SavedPhone>();
    const meta = {
      id: "s1",
      title: "Fix login",
      status: "needs_you",
      updatedAt: "2026-11-05",
    } as SessionMeta;
    let status: PermissionItem["status"] = "pending";
    const item = () =>
      ({
        kind: "permission",
        id: "p1",
        request: { requestId: "r1", toolName: "Bash", input: { command: "npm test" }, canAlwaysAllow: false },
        status,
        at: "2026-11-05T10:00:00Z",
      }) as PermissionItem;
    const answers: PermissionDecision[] = [];
    const settings: PhoneSettings = {
      channel: "teams",
      enabled: false,
      when: "always",
      awayMinutes: 5,
      finished: true,
      keepAwake: false,
      screenshots: false,
    };
    const service = new PhoneService({
      chats: {
        list: async () => [meta],
        snapshot: async () => ({ meta, items: [item()] }),
        send: async () => undefined,
        answer: async (_id, _request, decision) => void answers.push(decision),
      },
      store: {
        load: async (id = "telegram") => store.get(id),
        save: async (saved, id = "telegram") => void (saved ? store.set(id, saved) : store.delete(id)),
        remembered: true,
      },
      api: () => {
        throw new Error("not Telegram");
      },
      channel: () => new TeamsChannel({ api: relay.api, now: () => NOW }),
      settings: () => settings,
      away: () => true,
      enable: async () => {
        settings.enabled = true;
      },
      onChange: () => undefined,
      code: () => "123456",
      now: () => NOW,
      pause: async () => undefined,
    });
    await service.start();
    const state = await service.connect(`https://shop-relay.azurewebsites.net#${KEY}`);
    expect(state).toMatchObject({ channel: "teams", status: "pairing", bot: "Jig", code: "123456" });

    relay.post({ text: "123456" });
    await vi.waitFor(() => expect(service.state()).toMatchObject({ status: "connected", owner: "Alex" }));
    expect(relay.calls).toContainEqual({ method: "PUT", path: "pairing", body: { aadObjectId: "oid-alex" } });
    expect(store.get("teams")?.owner).toEqual({ chatId: "oid-alex", name: "Alex" });
    await vi.waitFor(() => expect(relay.sends().at(-1)?.text).toContain("Paired with Jig"));

    await service.permission(meta, item());
    const card = relay.sends().at(-1)?.card as {
      body: Array<{ type: string; actions?: Array<{ data: { jig: string } }> }>;
    };
    const allow = card.body.find((b) => b.type === "ActionSet")?.actions?.[0]?.data.jig ?? "";
    expect(allow).toMatch(/^p:\w+:a$/);

    relay.post({ value: { jig: allow } });
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    expect(answers[0]).toMatchObject({ behavior: "allow" });
    status = "allowed";
    await service.permission(meta, item());
    const put = relay.calls.find((c) => c.method === "PUT" && c.path.startsWith("send/"));
    expect(JSON.stringify(put?.body)).toContain("Allowed");

    await service.disconnect();
    expect(relay.calls.at(-1)).toEqual({ method: "DELETE", path: "pairing" });
    expect(store.has("teams")).toBe(false);
    service.stop();
  });

  it("stays unpaired when the relay refuses the account", async () => {
    const relay = fakeRelay();
    const teams = new TeamsChannel({ api: relay.api });
    relay.failWith(new RelayError("404", 404, "unknown_account"));
    await expect(teams.pair("oid-sam")).rejects.toBeInstanceOf(ChannelError);
  });
});

describe("TeamsChannel places (D-380)", () => {
  const chat = "oid-alex";

  it("has places once the bot is in a team, and says what limits them", async () => {
    expect(await new TeamsChannel({ api: fakeRelay().api }).identify()).toMatchObject({
      places: false,
      note: expect.stringContaining("private team"),
    });
    expect(await new TeamsChannel({ api: fakeRelay({ team: true }).api }).identify()).toEqual({
      bot: "Jig",
      places: true,
    });
    expect(
      await new TeamsChannel({ api: fakeRelay({ team: true, rsc: "missing" }).api }).identify(),
    ).toMatchObject({ places: true, note: expect.stringContaining("General") });
  });

  it("makes a channel per project and a thread per chat, headed with it", async () => {
    const relay = fakeRelay({ team: true });
    const teams = new TeamsChannel({ api: relay.api });
    expect(await teams.createPlace(chat, { kind: "jig", name: "Jig", color: "jig" })).toBe(TEAM);
    const project = await teams.createPlace(chat, { kind: "project", name: "Shop", color: "accent" });
    expect(project).toBe("19:ch1@thread.tacv2");
    expect(relay.calls.find((c) => c.path === "channels")?.body).toMatchObject({ name: "Shop" });
    const thread = await teams.createPlace(chat, {
      kind: "chat",
      name: "💬 Fix login",
      color: "accent",
      parent: project,
      heading: "💬 <b>Fix login</b> · Shop",
    });
    expect(thread).toBe("19:ch1@thread.tacv2;messageid=a1");
    expect(relay.sends().at(-1)).toEqual({
      to: { kind: "thread", channelId: project },
      text: "💬 <b>Fix login</b> · Shop",
    });
    // A message to the thread is a reply in it; to a channel, a new post.
    await teams.send({ chat, place: thread, mention: true }, { text: "needs you" });
    expect(relay.sends().at(-1)).toMatchObject({
      to: { kind: "conversation", conversationId: thread },
      mention: true,
    });
    await teams.send({ chat, place: TEAM }, { text: "hello" });
    expect(relay.sends().at(-1)?.to).toEqual({ kind: "thread", channelId: TEAM });
  });

  it("renames a project's channel, never General or a thread", async () => {
    const relay = fakeRelay({ team: true });
    const teams = new TeamsChannel({ api: relay.api });
    await teams.identify();
    await teams.renamePlace(chat, "19:ch1@thread.tacv2", "Shop 2");
    await teams.renamePlace(chat, TEAM, "Shop 2");
    await teams.renamePlace(chat, "19:ch1@thread.tacv2;messageid=a1", "Shop 2");
    expect(relay.calls.filter((c) => c.path === "channels")).toEqual([
      { method: "POST", path: "channels", body: { id: "19:ch1@thread.tacv2", name: "Shop 2" } },
    ]);
  });

  it("falls back to General when the team's owner didn't grant channels", async () => {
    const relay = fakeRelay({ team: true, rsc: "missing" });
    const teams = new TeamsChannel({ api: relay.api });
    expect(await teams.createPlace(chat, { kind: "project", name: "Shop", color: "accent" })).toBe(TEAM);
    expect(relay.calls.some((c) => c.path === "channels")).toBe(false);
  });

  it("reads posts in the team as places in their channel, and the team's events", () => {
    const teams = new TeamsChannel({ api: fakeRelay().api, now: () => NOW });
    const thread = "19:ch1@thread.tacv2;messageid=a1";
    expect(
      teams.read(
        update({
          text: "<at>Jig</at> run it again",
          conversation: { id: thread, conversationType: "channel" },
          channelData: { team: { id: TEAM }, channel: { id: "19:ch1@thread.tacv2" } },
        }),
      ),
    ).toMatchObject({
      kind: "message",
      private: true,
      place: thread,
      area: "19:ch1@thread.tacv2",
      text: "run it again",
    });
    // A group chat the bot is in isn't yours.
    expect(
      teams.read(update({ text: "hi", conversation: { id: "19:group", conversationType: "groupChat" } })),
    ).toMatchObject({ private: false });
    const event = (a: Partial<RelayActivity>) =>
      teams.read(update({ conversation: { id: TEAM, conversationType: "channel" }, ...a }));
    expect(event({ type: "installationUpdate", action: "add", channelData: { team: { id: TEAM } } })).toEqual(
      { kind: "places", added: TEAM },
    );
    expect(
      event({
        type: "conversationUpdate",
        channelData: {
          eventType: "channelDeleted",
          team: { id: TEAM },
          channel: { id: "19:ch1@thread.tacv2" },
        },
      }),
    ).toEqual({ kind: "places", gone: "19:ch1@thread.tacv2" });
    expect(
      event({ type: "installationUpdate", action: "remove", channelData: { team: { id: TEAM } } }),
    ).toEqual({ kind: "places", reset: true });
  });
});

describe("PhoneService on Teams, in the team (D-380)", () => {
  const paired: SavedPhone = {
    token: `https://shop-relay.azurewebsites.net#${KEY}`,
    bot: "Jig",
    owner: { chatId: "oid-alex", name: "Alex" },
  };

  function setup(relay = fakeRelay({ team: true })) {
    const store = new Map<string, SavedPhone>([["teams", paired]]);
    const meta = {
      id: "s1",
      title: "Fix login",
      status: "needs_you",
      projectId: "shop",
      updatedAt: "2026-11-05",
    } as SessionMeta;
    let status: PermissionItem["status"] = "pending";
    const item = () =>
      ({
        kind: "permission",
        id: "p1",
        request: {
          requestId: "r1",
          toolName: "Bash",
          input: { command: "npm test" },
          canAlwaysAllow: false,
        },
        status,
        at: "2026-11-05T10:00:00Z",
      }) as PermissionItem;
    const answers: PermissionDecision[] = [];
    const sent: string[] = [];
    const asked: string[] = [];
    const project = { name: "Shop", color: "accent" };
    const service = new PhoneService({
      chats: {
        list: async () => [meta],
        snapshot: async () => ({ meta, items: status === "pending" ? [item()] : [] }),
        send: async (_id, text) => void sent.push(text),
        answer: async (_id, _request, decision) => void answers.push(decision),
      },
      store: {
        load: async (id = "telegram") => store.get(id),
        save: async (saved, id = "telegram") => void (saved ? store.set(id, saved) : store.delete(id)),
        remembered: true,
      },
      api: () => {
        throw new Error("not Telegram");
      },
      channel: () => new TeamsChannel({ api: relay.api, now: () => NOW }),
      project: async () => project,
      concierge: {
        ask: async (text) => {
          asked.push(text);
          return "jig";
        },
      },
      settings: () => ({
        channel: "teams",
        enabled: true,
        when: "always",
        awayMinutes: 5,
        finished: true,
        keepAwake: false,
        screenshots: false,
      }),
      away: () => true,
      enable: async () => undefined,
      onChange: () => undefined,
      code: () => "123456",
      now: () => NOW,
      pause: async () => undefined,
      later: (fn) => setTimeout(fn, 0),
    });
    const settle = (s: PermissionItem["status"]) => {
      status = s;
    };
    /** A turn that ends: its Finished message goes to the chat's thread. */
    const finish = async () => {
      await service.chatStatus({ ...meta, status: "working" });
      await service.chatStatus({ ...meta, status: "idle" });
    };
    return { relay, service, store, meta, answers, sent, asked, project, settle, item, finish };
  }

  it("asks in the chat's thread and in the 1:1 chat, notifying once; answering one updates both", async () => {
    const t = setup();
    await t.service.start();
    await t.service.permission(t.meta, t.item());
    const sends = t.relay.sends();
    // The channel, the chat's thread headed with it, the full card there (no mention), a short one here.
    expect(t.relay.calls.find((c) => c.path === "channels")?.body).toMatchObject({ name: "Shop" });
    expect(sends[0]).toMatchObject({ to: { kind: "thread" }, text: "💬 <b>Fix login</b> · Shop" });
    expect(sends[1]).toMatchObject({ to: { kind: "conversation" } });
    expect(sends[1]?.mention).toBeUndefined();
    expect(sends[2]?.to).toEqual({ kind: "personal" });
    expect(JSON.stringify(sends[2]?.card)).toContain("Shop");
    expect(JSON.stringify(sends[2]?.card)).toContain("Open thread");
    const copy = sends[2]?.card as {
      body: Array<{ type: string; actions?: Array<{ data: { jig: string } }> }>;
    };
    const allow = copy.body.find((b) => b.type === "ActionSet")?.actions?.[0]?.data.jig ?? "";

    t.relay.post({ value: { jig: allow } });
    await vi.waitFor(() => expect(t.answers).toHaveLength(1));
    t.settle("allowed");
    await t.service.permission(t.meta, t.item());
    const puts = t.relay.calls.filter((c) => c.method === "PUT" && c.path.startsWith("send/"));
    expect(puts.map((p) => p.path)).toEqual(["send/a2", "send/a3"]);
    for (const put of puts) expect(JSON.stringify(put.body)).toContain("Allowed");
    t.service.stop();
  });

  it("sends what you write in a chat's thread to that chat, and a new post in its channel to Jig itself", async () => {
    const t = setup();
    await t.service.start();
    t.settle("allowed");
    await t.service.permission(t.meta, t.item());
    await t.finish();
    const thread = t.store.get("teams")?.threads?.s1?.place;
    expect(thread).toBe("19:ch1@thread.tacv2;messageid=a1");
    t.relay.inThread(String(thread), "also check the logout");
    await vi.waitFor(() => expect(t.sent).toEqual(["also check the logout"]));
    t.relay.inThread("19:ch1@thread.tacv2;messageid=m9", "how is the shop doing?");
    await vi.waitFor(() => expect(t.asked).toHaveLength(1));
    expect(t.asked[0]).toContain("the channel of project “Shop” (id shop)");
    t.service.stop();
  });

  it("opens the chat's thread as a room, and /close stops following it", async () => {
    const t = setup();
    await t.service.start();
    t.settle("allowed");
    await t.service.openRoom("s1");
    const thread = t.store.get("teams")?.rooms?.s1;
    expect(thread).toBe("19:ch1@thread.tacv2;messageid=a1");
    expect(
      t.relay
        .sends()
        .map((s) => s.text ?? "")
        .join("\n"),
    ).toContain("Following the chat live");
    t.relay.inThread(String(thread), "/close");
    await vi.waitFor(() => expect(t.relay.sends().at(-1)?.text).toContain("Stopped following the chat live"));
    expect(t.store.get("teams")?.rooms).toEqual({});
    // The thread stays the chat's: what you write there still goes to it.
    expect(t.store.get("teams")?.threads?.s1?.place).toBe(thread);
    t.service.stop();
  });

  it("renames a project's channel with it, and makes a deleted one again", async () => {
    const t = setup();
    await t.service.start();
    t.settle("allowed");
    await t.finish();
    expect(t.store.get("teams")?.topics?.projects?.shop).toBe("19:ch1@thread.tacv2");

    t.project.name = "Shop 2";
    await t.service.renameTopics();
    expect(t.relay.calls.filter((c) => c.path === "channels").at(-1)?.body).toEqual({
      id: "19:ch1@thread.tacv2",
      name: "Shop 2",
    });

    t.relay.deleteChannel("19:ch1@thread.tacv2");
    await vi.waitFor(() => expect(t.store.get("teams")?.topics?.projects?.shop).toBeUndefined());
    expect(t.store.get("teams")?.threads?.s1).toBeUndefined();
    await t.finish();
    expect(t.store.get("teams")?.topics?.projects?.shop).toBe("19:ch2@thread.tacv2");
    t.service.stop();
  });

  it("without the channel grant, chats write in threads of General headed with their project", async () => {
    const t = setup(fakeRelay({ team: true, rsc: "missing" }));
    await t.service.start();
    expect(t.service.state().topicsNote).toContain("General");
    t.settle("allowed");
    await t.finish();
    expect(t.relay.sends()[0]).toMatchObject({
      to: { kind: "thread", channelId: TEAM },
      text: "💬 <b>Fix login</b> · Shop",
    });
    t.service.stop();
  });
});
