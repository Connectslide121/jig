import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { expect, hostCall, launchJig, test } from "./fixtures";

const KEY = "k".repeat(43);
/** What setup saves: the relay's address and key; JIG_TEAMS_RELAY points the fake engine at ours. */
const CREDENTIAL = `https://shop-relay.azurewebsites.net#${KEY}`;

interface Sent {
  to: { kind: string; conversationId?: string; channelId?: string };
  text?: string;
  card?: { body: Array<{ type: string; text?: string; actions?: Array<{ data: { jig: string } }> }> };
  image?: { contentType: string };
}

const TEAM = "19:general@thread.tacv2";

/**
 * The Teams relay (D-370) on 127.0.0.1, as `relay/teams/src/protocol.ts` describes it: records what
 * Jig sends and updates, hands Jig what "Teams" posted to the bot. With `team` the bot is in your
 * Jig team (D-380): it makes channels and starts threads in them.
 */
async function fakeRelay(options: { team?: boolean } = {}) {
  const sent: Sent[] = [];
  /** Where each sent message went: its conversation (a thread's is `<channel>;messageid=<root>`). */
  const where: string[] = [];
  const updates: Array<{ id: string; body: Sent }> = [];
  const pairing: string[] = [];
  const channels: Array<{ id: string; name: string }> = [];
  const queue: Array<{ cursor: number; received: number; activity: Record<string, unknown> }> = [];
  let cursor = 0;
  let nextId = 1;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const reply = (status: number, value: unknown) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(value));
      };
      if (req.headers["x-jig-relay-key"] !== KEY) return reply(401, { error: "relay_key" });
      const url = new URL(req.url ?? "/", "http://relay");
      const params = body ? JSON.parse(body) : {};
      if (url.pathname === "/api/health")
        return reply(200, {
          version: "test",
          paired: pairing.length > 0,
          personal: true,
          ...(options.team ? { team: { id: TEAM, name: "Jig" } } : {}),
          channels: channels.length,
          rsc: options.team ? "granted" : "unknown",
        });
      if (url.pathname === "/api/channels") {
        const made = { id: params.id ?? `19:ch${channels.length + 1}@thread.tacv2`, name: params.name };
        if (!params.id) channels.push(made);
        return reply(200, made);
      }
      if (url.pathname === "/api/updates") {
        const after = Number(url.searchParams.get("after") ?? 0);
        const ready = () => queue.filter((u) => u.cursor > after);
        for (let i = 0; i < 10 && !ready().length; i++) await new Promise((r) => setTimeout(r, 100));
        return reply(200, { updates: ready() });
      }
      if (url.pathname === "/api/pairing") {
        pairing.push(req.method === "DELETE" ? "" : params.aadObjectId);
        return reply(200, { paired: req.method !== "DELETE" });
      }
      if (url.pathname === "/api/send" && req.method === "POST") {
        const id = `a${nextId++}`;
        const to = (params as Sent).to;
        const conversationId =
          to.kind === "thread"
            ? `${to.channelId};messageid=${id}`
            : to.kind === "conversation"
              ? (to.conversationId ?? "")
              : "a:personal";
        sent.push(params);
        where.push(conversationId);
        return reply(200, { id, conversationId });
      }
      if (url.pathname.startsWith("/api/send/") && req.method === "PUT") {
        updates.push({ id: url.pathname.split("/").pop() ?? "", body: params });
        return reply(200, { id: "x", conversationId: params.conversationId });
      }
      return reply(404, { error: "not_found" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const post = (activity: Record<string, unknown>) =>
    queue.push({
      cursor: ++cursor,
      received: Date.now(),
      activity: {
        type: "message",
        id: `m${cursor}`,
        timestamp: new Date().toISOString(),
        from: { id: "29:alex", aadObjectId: "oid-alex", name: "Alex" },
        conversation: { id: "a:personal", conversationType: "personal", tenantId: "contoso" },
        ...activity,
      },
    });
  const words = (s: Sent) => [s.text ?? "", ...(s.card?.body ?? []).map((b) => b.text ?? "")].join("\n");
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sent,
    updates,
    pairing,
    channels,
    texts: () => sent.map(words).join("\n"),
    /** What Jig wrote in a channel thread. */
    inThread: (thread: string) => sent.filter((_, i) => where[i] === thread).map(words),
    /** The threads Jig started in a channel. */
    threads: (channel: string) =>
      sent.flatMap((s, i) => (s.to.kind === "thread" && s.to.channelId === channel ? [where[i]!] : [])),
    write: (text: string) => post({ text }),
    /** You wrote in a channel thread of the team (Teams adds the bot's @mention). */
    writeIn: (thread: string, text: string) =>
      post({
        text: `<at>Jig</at> ${text}`,
        conversation: { id: thread, conversationType: "channel", tenantId: "contoso" },
        channelData: { team: { id: TEAM }, channel: { id: thread.split(";")[0] } },
      }),
    tap: (data: string) => post({ value: { jig: data } }),
    close: () => new Promise((r) => server.close(r)),
  };
}

let app: ElectronApplication | undefined;
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(jigHome: string, relay: { url: string }): Promise<Page> {
  await writeFile(
    join(jigHome, "config.json"),
    JSON.stringify({ chat: { view: "detailed" }, phone: { channel: "teams", when: "always" } }),
  );
  app = await launchJig(jigHome, { JIG_TEAMS_RELAY: relay.url });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-testid=app-root]");
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  return page;
}

// Jig on your phone through Teams (D-370, D-379): pair the bot's 1:1 chat by code, then Allow a
// request from its card, ask /status and talk to Jig itself.
test("phone on Teams: pair, Allow from a card, /status and Jig itself", async ({ jigHome }) => {
  const relay = await fakeRelay();
  try {
    const page = await start(jigHome, relay);
    const connected = (await hostCall(page, "phone.connect", { token: CREDENTIAL })) as {
      value: { code: string; channel: string; bot: string };
    };
    expect(connected.value).toMatchObject({ channel: "teams", bot: "Jig" });
    relay.write(connected.value.code);
    await expect
      .poll(
        async () => ((await hostCall(page, "phone.state")) as { value: { status: string } }).value.status,
        { timeout: 15000 },
      )
      .toBe("connected");
    expect(relay.pairing).toEqual(["oid-alex"]);
    await expect.poll(() => relay.texts()).toContain("Paired with Jig");

    // A permission request reaches the 1:1 chat as an Adaptive Card; Allow on it runs the command.
    await page.keyboard.press("Control+N");
    await page.getByTestId("composer-input").fill("run the tests");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("permission-card")).toContainText("npm test", { timeout: 15000 });
    await expect
      .poll(() => relay.sent.some((s) => s.card && JSON.stringify(s.card).includes("npm test")), {
        timeout: 15000,
      })
      .toBe(true);
    const card = relay.sent.find((s) => s.card && JSON.stringify(s.card).includes("npm test"))?.card;
    expect(card).toMatchObject({ version: "1.5" });

    // While it waits, /status (picked from the bot's menu, so without the slash) says so.
    relay.write("status");
    await expect.poll(() => relay.texts(), { timeout: 15000 }).toContain("needs you");

    const allow = card?.body.find((b) => b.type === "ActionSet")?.actions?.[0]?.data.jig ?? "";
    expect(allow).toMatch(/^p:\w+:a$/);
    relay.tap(allow);
    await expect(page.getByTestId("permission-card")).toHaveCount(0, { timeout: 15000 });
    await expect
      .poll(() => relay.updates.map((u) => JSON.stringify(u.body)).join("\n"), { timeout: 15000 })
      .toContain("Allowed");

    // Anything else goes to Jig itself; its answer comes back to the 1:1 chat.
    relay.write("how is everything going?");
    await expect.poll(() => relay.texts(), { timeout: 20000 }).toContain("<b>Jig</b> · AI");
  } finally {
    await relay.close();
  }
});

// The Jig team (D-380): a project's first message makes its channel, the chat opens as its thread
// there and follows the chat live, and what you write in the thread goes to the chat.
test("phone on Teams: a project's channel, a chat's thread live, a reply from the thread", async ({
  jigHome,
}) => {
  const relay = await fakeRelay({ team: true });
  try {
    const page = await start(jigHome, relay);
    const connected = (await hostCall(page, "phone.connect", { token: CREDENTIAL })) as {
      value: { code: string };
    };
    relay.write(connected.value.code);
    await expect
      .poll(
        async () => ((await hostCall(page, "phone.state")) as { value: { topics?: boolean } }).value.topics,
        { timeout: 15000 },
      )
      .toBe(true);

    await page.keyboard.press("Control+N");
    await page.getByTestId("composer-input").fill("first idea");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chat-status")).toHaveText("Idle", { timeout: 15000 });

    // Open on my phone: the project's channel is made, then the chat's thread in it.
    await page.getByRole("button", { name: "Chat options" }).click();
    await page.getByTestId("session-open-phone").click();
    await expect.poll(() => relay.channels.map((c) => c.name), { timeout: 15000 }).toEqual(["shop"]);
    const channel = relay.channels[0]!.id;
    await expect.poll(() => relay.threads(channel).length, { timeout: 15000 }).toBe(1);
    const thread = relay.threads(channel)[0]!;
    await expect.poll(() => relay.inThread(thread).join("\n"), { timeout: 15000 }).toContain("first idea");

    // A turn from the computer is mirrored into the thread, then Finished.
    await page.getByTestId("composer-input").fill("second idea");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => relay.inThread(thread).join("\n"), { timeout: 20000 })
      .toContain("You, on the computer:</i><br>second idea");
    await expect.poll(() => relay.inThread(thread).join("\n"), { timeout: 20000 }).toContain("Finished");

    // Written in the thread: it goes to the chat.
    relay.writeIn(thread, "from the phone");
    await expect(page.getByTestId("user-message-text").last()).toHaveText("from the phone", {
      timeout: 15000,
    });
  } finally {
    await relay.close();
  }
});
