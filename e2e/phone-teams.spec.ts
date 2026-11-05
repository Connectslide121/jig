import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { AZ_ARGV, expect, hostCall, launchJig, settledBox, test } from "./fixtures";

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
async function fakeRelay(options: { team?: boolean; key?: () => string } = {}) {
  const sent: Sent[] = [];
  /** Where each sent message went: its conversation (a thread's is `<channel>;messageid=<root>`). */
  const where: string[] = [];
  const updates: Array<{ id: string; body: Sent }> = [];
  const pairing: string[] = [];
  const channels: Array<{ id: string; name: string }> = [];
  const queue: Array<{ cursor: number; received: number; activity: Record<string, unknown> }> = [];
  let cursor = 0;
  let nextId = 1;
  /** What the relay has seen of the app (Teams setup ticks its rows with it). */
  const installed = { app: false, team: Boolean(options.team) };
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const reply = (status: number, value: unknown) => {
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(value));
      };
      if (req.headers["x-jig-relay-key"] !== (options.key?.() ?? KEY))
        return reply(401, { error: "relay_key" });
      const url = new URL(req.url ?? "/", "http://relay");
      const params = body ? JSON.parse(body) : {};
      if (url.pathname === "/api/health")
        return reply(200, {
          version: "test",
          paired: pairing.length > 0,
          personal: true,
          app: installed.app,
          ...(installed.team ? { team: { id: TEAM, name: "Jig" } } : {}),
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
    installed,
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

/**
 * An `az` for Teams setup (D-370): answers each command Create runs like the Azure CLI, logs every
 * run to `az-log.txt`, and writes the relay key it was given (the settings file's JIG_RELAY_KEY) to
 * `relay-key.txt`, so the fake relay accepts it.
 */
const SETUP_AZ = (home: string) => `
const fs = require("node:fs");
const path = require("node:path");
const args = ${AZ_ARGV};
const home = ${JSON.stringify(home)};
const line = args.join(" ");
fs.appendFileSync(path.join(home, "az-log.txt"), line.replace(/\\s+/g, " ") + "\\n");
const out = (v) => console.log(JSON.stringify(v));
const TENANT = "11111111-1111-4111-8111-111111111111";
if (line.startsWith("account show")) out({ tenantId: TENANT, user: "ann@contoso.example.com", tenant: "Contoso" });
else if (line.startsWith("account list")) out([{ id: "22222222-2222-4222-8222-222222222222", name: "Contoso dev", tenantId: TENANT, isDefault: true }]);
else if (line.startsWith("functionapp list-flexconsumption-locations")) out(["westeurope", "eastus"]);
else if (line.startsWith("ad app create")) out({ appId: "33333333-3333-4333-8333-333333333333" });
else if (line.startsWith("functionapp show")) out({ host: "jig-phone-test.azurewebsites.net" });
else if (line.startsWith("ad app credential reset")) out({ password: "fake-secret" });
else if (line.startsWith("functionapp config appsettings set")) {
  const settings = JSON.parse(args[args.indexOf("--settings") + 1]);
  fs.writeFileSync(path.join(home, "relay-key.txt"), settings.find((s) => s.name === "JIG_RELAY_KEY").value);
  out(settings.map((s) => s.name));
} else if (line.startsWith("provider register")) process.exit(0);
else out({ id: "x" });
`;

// Settings → Phone → Teams (phase 27 session 5): pick Teams, Create runs the listed az commands in
// order (here a fake az), the app package is written, the rows tick when the relay sees the app,
// the code pairs, and Disconnect lists what to delete without deleting it.
test("phone on Teams: set up in Settings, Create, the app package, pair, Disconnect", async ({ jigHome }) => {
  const keyFile = join(jigHome, "relay-key.txt");
  // The key setup generated, as the fake az wrote it down (none yet: nothing matches).
  const key = () => (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : "\0");
  const relay = await fakeRelay({ key });
  try {
    const zip = join(jigHome, "relay.zip");
    await writeFile(zip, "zip");
    app = await launchJig(jigHome, { JIG_TEAMS_RELAY: relay.url, JIG_TEAMS_RELAY_ZIP: zip });
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const bin = join(jigHome, "fake-bin");
    await writeFile(join(bin, "az-signed-out.cjs"), SETUP_AZ(jigHome));
    await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${SETUP_AZ(jigHome)}`);
    const azLog = async () =>
      (await readFile(join(jigHome, "az-log.txt"), "utf8").catch(() => "")).trim().split("\n");

    // The channel is picked at the top; nothing was set up, so it switches without asking.
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-nav-phone").click();
    await page.getByTestId("phone-channel-teams").click();
    await expect(page.getByTestId("phone-channel-teams")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("phone-setup").click();

    const dialog = page.getByTestId("teams-setup-dialog");
    await expect(dialog.getByTestId("teams-tenant")).toContainText("Contoso");
    await expect(dialog.getByTestId("teams-subscription")).toHaveValue(
      "22222222-2222-4222-8222-222222222222",
    );
    await expect(dialog.getByTestId("teams-region")).toHaveValue("westeurope");
    // Opening it only read where things can go.
    expect((await azLog()).map((l) => l.split(" ").slice(0, 2).join(" "))).toEqual([
      "account show",
      "account list",
      "functionapp list-flexconsumption-locations",
    ]);

    // Every command is listed before it runs.
    await dialog.getByTestId("teams-step-bot").click();
    await expect(dialog.getByTestId("teams-commands")).toContainText("az bot create");
    await expect(dialog.getByTestId("teams-commands")).toContainText("--appid <app id>");
    const nav = dialog.getByRole("navigation", { name: "Setup steps" });
    const box = await settledBox(nav);

    await dialog.getByTestId("teams-create").click();
    const connectStep = dialog.getByTestId("teams-step-connect").locator("[data-status]");
    await expect(connectStep).toHaveAttribute("data-status", "done", { timeout: 30000 });
    // Nothing moved while the steps ran.
    expect(await settledBox(nav)).toEqual(box);
    const log = await azLog();
    expect(log.findIndex((l) => l.startsWith("ad app create"))).toBeLessThan(
      log.findIndex((l) => l.startsWith("bot create")),
    );
    expect(log.some((l) => l.startsWith("bot msteams create"))).toBe(true);
    // The secret went to Azure in the settings file only.
    expect(
      log.filter((l) => l.includes("fake-secret") && !l.startsWith("functionapp config appsettings set")),
    ).toEqual([]);
    expect(key()).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // The app package: the bot, both scopes, the team permissions, the icons.
    await dialog.getByTestId("teams-package").click();
    await expect(dialog.getByTestId("teams-package")).toHaveText("Show the app package");
    const files = unzipSync(await readFile(join(jigHome, "teams", "jig-teams-app.zip")));
    expect(Object.keys(files).sort()).toEqual(["color.png", "manifest.json", "outline.png"]);
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]!).toString("utf8"));
    expect(manifest.bots[0]).toMatchObject({
      botId: "33333333-3333-4333-8333-333333333333",
      scopes: ["personal", "team"],
    });
    expect(
      manifest.authorization.permissions.resourceSpecific.map((p: { name: string }) => p.name),
    ).toContain("ChannelMessage.Read.Group");

    // The rows tick when the relay sees the app, for yourself and in the team.
    const status = (row: string) => dialog.getByTestId(`teams-step-${row}`).locator("[data-status]");
    relay.installed.app = true;
    await expect(status("upload")).toHaveAttribute("data-status", "done", { timeout: 15000 });
    relay.installed.team = true;
    await expect(status("teamApp")).toHaveAttribute("data-status", "done", { timeout: 15000 });

    // Pair: the code from the 1:1 chat.
    await dialog.getByTestId("teams-step-pair").click();
    const code = (await dialog.getByTestId("teams-code").textContent()) ?? "";
    relay.write(code);
    await expect(dialog.getByTestId("teams-paired")).toBeVisible({ timeout: 15000 });
    expect(await settledBox(nav)).toEqual(box);
    await dialog.getByRole("button", { name: "Done", exact: true }).click();

    // Disconnect lists what to delete in Azure, with the command, and deletes nothing.
    await page.getByTestId("phone-disconnect").click();
    await expect(page.getByTestId("teams-disconnect-message")).toContainText(
      "az group delete --name jig-phone --subscription 22222222-2222-4222-8222-222222222222",
    );
    await page.getByTestId("dialog-confirm").click();
    await expect
      .poll(async () => ((await hostCall(page, "phone.state")) as { value: { status: string } }).value.status)
      .toBe("off");
    expect((await azLog()).some((l) => l.includes("delete"))).toBe(false);
  } finally {
    await relay.close();
  }
});
