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
  to: { kind: string; conversationId?: string };
  text?: string;
  card?: { body: Array<{ type: string; text?: string; actions?: Array<{ data: { jig: string } }> }> };
  image?: { contentType: string };
}

/**
 * The Teams relay (D-370) on 127.0.0.1, as `relay/teams/src/protocol.ts` describes it: records what
 * Jig sends and updates, hands Jig what "Teams" posted to the bot.
 */
async function fakeRelay() {
  const sent: Sent[] = [];
  const updates: Array<{ id: string; body: Sent }> = [];
  const pairing: string[] = [];
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
          channels: 0,
          rsc: "unknown",
        });
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
        sent.push(params);
        return reply(200, { id: `a${nextId++}`, conversationId: "a:personal" });
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
    texts: () => sent.map(words).join("\n"),
    write: (text: string) => post({ text }),
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
