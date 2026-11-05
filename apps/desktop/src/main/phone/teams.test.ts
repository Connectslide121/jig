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

/** A relay that records calls; `updates` hands out what "Teams" posted. */
function fakeRelay() {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const queue: RelayUpdate[] = [];
  let cursor = 0;
  let sentId = 0;
  let fail: RelayError | Error | undefined;
  const api: RelayApi = {
    async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
      if (fail) throw fail;
      calls.push({ method, path, ...(body !== undefined ? { body } : {}) });
      if (path.startsWith("updates")) {
        const after = Number(/after=(\d+)/.exec(path)?.[1] ?? 0);
        const ready = queue.filter((u) => u.cursor > after);
        if (ready.length) return { updates: ready } as T;
        return new Promise<T>((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
          setTimeout(() => resolve({ updates: [] } as T), 20);
        });
      }
      if (method === "POST" && path === "send")
        return { id: `a${++sentId}`, conversationId: "a:personal" } as T;
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
