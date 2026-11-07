import { describe, expect, it } from "vitest";
import { ChannelError } from "./channel";
import { type TelegramApi, TelegramChannel, TelegramError, type TelegramUpdate } from "./telegram";

function fake(fail?: Error) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api: TelegramApi = {
    async call<T>(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (fail) throw fail;
      if (method === "getUpdates") return [{ update_id: 7 }, { update_id: 9 }] as T;
      if (method === "getMe") return { id: 1, username: "shop_bot", has_topics_enabled: true } as T;
      if (method === "createForumTopic") return { message_thread_id: 55 } as T;
      return { message_id: 3 } as T;
    },
    async photo<T>() {
      return { message_id: 4 } as T;
    },
    async voice<T>() {
      return true as T;
    },
    async download() {
      return Buffer.from("");
    },
  };
  return { channel: new TelegramChannel(api), calls };
}

describe("TelegramChannel", () => {
  it("edits a card sent with a picture through its caption (D-468)", async () => {
    const calls: string[] = [];
    const api = {
      async call(method: string) {
        calls.push(method);
        if (method === "editMessageText")
          throw new TelegramError("Bad Request: there is no text in the message to edit", 400);
        return true;
      },
    } as unknown as TelegramApi;
    await new TelegramChannel(api).edit({ chat: 42 }, 9, { text: "✅ Approved" });
    expect(calls).toEqual(["editMessageText", "editMessageCaption"]);
  });

  it("reads messages and taps in Jig's words", () => {
    const { channel } = fake();
    const message = {
      update_id: 1,
      message: {
        message_id: 5,
        date: 100,
        chat: { id: 42, type: "private" },
        from: { id: 42, first_name: "Alex" },
        text: "hi",
        message_thread_id: 12,
        is_topic_message: true,
        reply_to_message: { message_id: 4 },
      },
    } as TelegramUpdate;
    expect(channel.read(message)).toEqual({
      kind: "message",
      id: 5,
      date: 100,
      chat: 42,
      private: true,
      from: { id: 42, name: "Alex" },
      place: 12,
      replyTo: 4,
      text: "hi",
    });
    const tap = {
      update_id: 2,
      callback_query: { id: "cb", from: { id: 42, username: "alex" }, data: "p:a:a" },
    } as TelegramUpdate;
    expect(channel.read(tap)).toEqual({
      kind: "tap",
      id: "cb",
      from: { id: 42, name: "@alex" },
      data: "p:a:a",
    });
    expect(channel.read({ update_id: 3 })).toBeUndefined();
  });

  it("asks for updates after the last one it got", async () => {
    const { channel, calls } = fake();
    await channel.poll(new AbortController().signal);
    await channel.poll(new AbortController().signal);
    expect(calls.map((c) => c.params.offset)).toEqual([0, 10]);
  });

  it("names why it failed", async () => {
    const reason = (error: Error) =>
      fake(error)
        .channel.poll(new AbortController().signal)
        .catch((e: ChannelError) => e.reason);
    expect(await reason(new TelegramError("Unauthorized", 401))).toBe("auth");
    expect(await reason(new TelegramError("Conflict", 409))).toBe("conflict");
    expect(await reason(new TelegramError("Telegram can't be reached."))).toBe("unreachable");
    await expect(fake(new TelegramError("Not Found", 404)).channel.identify()).rejects.toMatchObject({
      reason: "auth",
    });
    await expect(
      fake(new TelegramError("Bad Request: message thread not found", 400)).channel.send(
        { chat: 42, place: 12 },
        { text: "x" },
      ),
    ).rejects.toBeInstanceOf(ChannelError);
  });

  it("renders Jig's messages as Telegram HTML with an inline keyboard and makes topics", async () => {
    const { channel, calls } = fake();
    await channel.send(
      { chat: 42, place: 12 },
      { text: "<b>Hi</b>", silent: true, buttons: [[{ text: "Allow", data: "p:k:a" }]] },
    );
    expect(calls.at(-1)).toEqual({
      method: "sendMessage",
      params: {
        chat_id: 42,
        parse_mode: "HTML",
        message_thread_id: 12,
        disable_notification: true,
        reply_markup: { inline_keyboard: [[{ text: "Allow", callback_data: "p:k:a" }]] },
        text: "<b>Hi</b>",
        link_preview_options: { is_disabled: true },
      },
    });
    expect(await channel.createPlace(42, { kind: "project", name: "Shop", color: "info" })).toBe(55);
    expect(calls.at(-1)?.params).toEqual({ chat_id: 42, name: "Shop", icon_color: 7322096 });
    expect(await channel.identify()).toEqual({ bot: "shop_bot", places: true });
  });
});
