import { describe, expect, it, vi } from "vitest";
import type { PhoneChannelId } from "../../shared/phone";
import { PhoneService, type PhoneSettings, type SavedPhone } from "./service";
import type { TelegramApi } from "./telegram";

/** `phone.channel` (D-377): one channel at a time, each with its saved state apart. */
describe("PhoneService channels", () => {
  function setup(channel: PhoneChannelId) {
    const store = new Map<PhoneChannelId, SavedPhone>([
      ["telegram", { token: "t", bot: "shop_bot", owner: { chatId: 42, name: "Alex" } }],
    ]);
    const sent: string[] = [];
    const api: TelegramApi = {
      async call<T>(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
        if (method === "getUpdates")
          return new Promise<T>((_, reject) =>
            signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          );
        if (method === "sendMessage") sent.push(String(params.text));
        if (method === "getMe") return { id: 1, username: "shop_bot" } as T;
        return { message_id: 1 } as T;
      },
      photo: async <T>() => ({ message_id: 2 }) as T,
      voice: async <T>() => true as T,
      download: async () => Buffer.from(""),
    };
    const settings: PhoneSettings = {
      channel,
      enabled: true,
      when: "always",
      awayMinutes: 5,
      finished: true,
      keepAwake: false,
      screenshots: false,
    };
    const service = new PhoneService({
      chats: {
        list: async () => [],
        snapshot: async () => {
          throw new Error("not_found");
        },
        send: async () => undefined,
        answer: async () => undefined,
      },
      store: {
        load: async (id = "telegram") => store.get(id),
        save: async (saved, id = "telegram") => void (saved ? store.set(id, saved) : store.delete(id)),
        remembered: true,
      },
      api: () => api,
      settings: () => settings,
      away: () => true,
      enable: async () => undefined,
      onChange: () => undefined,
      code: () => "123456",
      pause: async () => undefined,
    });
    return { service, store, sent, settings };
  }

  it("reads the picked channel's saved state", async () => {
    const t = setup("telegram");
    await t.service.start();
    expect(t.service.state()).toMatchObject({ channel: "telegram", status: "connected", owner: "Alex" });
    t.service.stop();
  });

  it("switching parks the other channel and keeps its setup", async () => {
    const t = setup("telegram");
    await t.service.start();
    const before = t.store.get("telegram");
    t.settings.channel = "teams";
    t.service.refresh();
    await vi.waitFor(() => expect(t.service.state()).toMatchObject({ channel: "teams", status: "off" }));
    expect(t.sent).toEqual([]);
    expect(t.store.get("telegram")).toBe(before);
    // Switching back is connected again, with nothing sent and nothing set up.
    t.settings.channel = "telegram";
    t.service.refresh();
    await vi.waitFor(() =>
      expect(t.service.state()).toMatchObject({ channel: "telegram", status: "connected", owner: "Alex" }),
    );
    expect(t.sent).toEqual([]);
    expect(t.store.get("telegram")).toBe(before);
    t.settings.channel = "teams";
    t.service.refresh();
    await vi.waitFor(() => expect(t.service.state()).toMatchObject({ channel: "teams", status: "off" }));
    // Teams takes its relay's address and key; without a Teams channel (`deps.channel`) it's unavailable.
    await expect(t.service.connect("key")).rejects.toMatchObject({ code: "invalid_token" });
    const credential = `https://shop-relay.example.net#${"k".repeat(43)}`;
    await expect(t.service.connect(credential)).rejects.toMatchObject({ code: "unavailable" });
    t.service.stop();
  });
});
