import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { expect, hostCall, launchJig, test } from "./fixtures";

const TOKEN = `123456789:${"A".repeat(35)}`;
const ME = 42;

/** A Telegram Bot API on 127.0.0.1: records what Jig sends, hands it what "the phone" writes. */
async function fakeTelegram() {
  const sent: Array<Record<string, unknown>> = [];
  const edits: Array<Record<string, unknown>> = [];
  const queue: Array<Record<string, unknown>> = [];
  let nextUpdate = 1;
  let nextMessage = 1;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const params = body ? JSON.parse(body) : {};
      const method = req.url?.split("/").pop();
      const reply = (result: unknown) => res.end(JSON.stringify({ ok: true, result }));
      if (!req.url?.startsWith(`/bot${TOKEN}/`)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ ok: false, description: "Unauthorized" }));
      }
      if (method === "getMe") return reply({ id: 1, is_bot: true, first_name: "Shop", username: "shop_bot" });
      if (method === "sendMessage") {
        sent.push(params);
        return reply({ message_id: nextMessage++ });
      }
      if (method === "editMessageText") {
        edits.push(params);
        return reply(true);
      }
      if (method === "getUpdates") {
        const ready = () => queue.filter((u) => (u.update_id as number) >= (params.offset ?? 0));
        for (let i = 0; i < 10 && !ready().length; i++) await new Promise((r) => setTimeout(r, 100));
        return reply(ready());
      }
      return reply(true);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const now = () => Math.floor(Date.now() / 1000);
  const from = { id: ME, is_bot: false, first_name: "Alex" };
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sent,
    edits,
    texts: () => sent.map((m) => String(m.text)),
    write: (text: string, replyTo?: number) =>
      queue.push({
        update_id: nextUpdate++,
        message: {
          message_id: 1000 + nextUpdate,
          date: now(),
          chat: { id: ME, type: "private" },
          from,
          text,
          ...(replyTo
            ? { reply_to_message: { message_id: replyTo, date: now(), chat: { id: ME, type: "private" } } }
            : {}),
        },
      }),
    tap: (data: string) => queue.push({ update_id: nextUpdate++, callback_query: { id: "cb", from, data } }),
    close: () => new Promise((r) => server.close(r)),
  };
}

let app: ElectronApplication | undefined;
test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(jigHome: string, telegram: { url: string }): Promise<Page> {
  await writeFile(
    join(jigHome, "config.json"),
    JSON.stringify({ chat: { view: "detailed" }, phone: { when: "always" } }),
  );
  app = await launchJig(jigHome, { JIG_TELEGRAM_API: telegram.url });
  const page = await app.firstWindow();
  await page.waitForSelector("[data-testid=app-root]");
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  return page;
}

// Jig on your phone (D-348): pair a Telegram bot in Settings → Phone, then answer a waiting request
// and talk to a chat from the phone.
test("phone: pair a Telegram bot, then answer a chat from the phone", async ({ jigHome }) => {
  const telegram = await fakeTelegram();
  try {
    const page = await start(jigHome, telegram);
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-nav-phone").click();
    await page.getByTestId("phone-setup").click();
    const dialog = page.getByTestId("phone-setup-dialog");
    await expect(page.getByTestId("phone-connect")).toBeDisabled();
    await page.getByTestId("phone-token").fill(TOKEN);
    await page.getByTestId("phone-connect").click();
    const code = await page.getByTestId("phone-code").textContent();
    expect(code).toMatch(/^\d{6}$/);
    await expect(dialog).toContainText("@shop_bot");

    telegram.write(String(code));
    await expect(dialog).toContainText("Connected to Alex", { timeout: 15000 });
    await expect.poll(() => telegram.texts().join("\n")).toContain("Paired with Jig");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("switch", { name: "Message my phone" })).toBeChecked();

    // A permission card in a chat reaches the phone with buttons; Allow from the phone runs it.
    await page.keyboard.press("Control+N");
    await page.getByTestId("composer-input").fill("run the tests");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("permission-card")).toContainText("npm test", { timeout: 15000 });
    await expect.poll(() => telegram.texts().join("\n"), { timeout: 15000 }).toContain("npm test");
    const request = telegram.sent.find((m) => String(m.text).includes("npm test"));
    const markup = request?.reply_markup as
      | { inline_keyboard: Array<Array<{ callback_data: string }>> }
      | undefined;
    const allow = markup?.inline_keyboard[0]?.[0]?.callback_data ?? "";
    telegram.tap(allow);
    await expect(page.getByTestId("permission-card")).toHaveCount(0, { timeout: 15000 });
    await expect
      .poll(() => telegram.edits.map((e) => String(e.text)).join("\n"), { timeout: 15000 })
      .toContain("Allowed");
    await expect.poll(() => telegram.texts().join("\n"), { timeout: 15000 }).toContain("Finished");

    // A message from the phone goes to that chat.
    telegram.write("hello from the phone");
    await expect(page.getByTestId("user-message-text").last()).toHaveText("hello from the phone", {
      timeout: 15000,
    });
  } finally {
    await telegram.close();
  }
});

test("phone: Claude texts the phone and the reply comes back to the chat", async ({ jigHome }) => {
  const telegram = await fakeTelegram();
  try {
    const page = await start(jigHome, telegram);
    const connected = (await hostCall(page, "phone.connect", { token: TOKEN })) as {
      value: { code: string };
    };
    telegram.write(connected.value.code);
    await expect
      .poll(
        async () => ((await hostCall(page, "phone.state")) as { value: { status: string } }).value.status,
        {
          timeout: 15000,
        },
      )
      .toBe("connected");

    await page.keyboard.press("Control+N");
    await page.getByTestId("composer-input").fill("text my phone when it's done");
    await page.keyboard.press("Enter");
    await expect(page.getByText("I sent it to your phone.")).toBeVisible({ timeout: 15000 });
    await expect.poll(() => telegram.texts().join("\n")).toContain("Shall I deploy it?");
    const asked = telegram.sent.findIndex((m) => String(m.text).includes("Shall I deploy")) + 1;

    telegram.write("yes, deploy", asked);
    await expect(page.getByTestId("user-message-text").last()).toHaveText("yes, deploy", { timeout: 15000 });
  } finally {
    await telegram.close();
  }
});
