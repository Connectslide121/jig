import { describe, expect, it } from "vitest";
import { buildActivity, keepActivity, trimActivity } from "./activities.ts";
import type { RelayActivity } from "./protocol.ts";
import { relayKeyMatches } from "./relayKey.ts";

const TENANT = "tenant-1";
const msg = (over: Partial<RelayActivity> = {}): RelayActivity => ({
  type: "message",
  text: "hello",
  from: { id: "29:alex", aadObjectId: "oid-alex", name: "Alex" },
  conversation: { id: "a:1", conversationType: "personal", tenantId: TENANT },
  ...over,
});
const pairing = { aadObjectId: "oid-alex", tenantId: TENANT };

describe("keepActivity", () => {
  it("keeps only a pairing code from a 1:1 chat before pairing", () => {
    expect(keepActivity(msg({ text: " 123456 " }), TENANT, undefined)).toBe(true);
    expect(keepActivity(msg(), TENANT, undefined)).toBe(false);
    expect(
      keepActivity(
        msg({ text: "123456", conversation: { id: "19:c", conversationType: "channel", tenantId: TENANT } }),
        TENANT,
        undefined,
      ),
    ).toBe(false);
  });

  it("keeps only the paired account once paired", () => {
    expect(keepActivity(msg(), TENANT, pairing)).toBe(true);
    expect(keepActivity(msg({ from: { id: "29:sam", aadObjectId: "oid-sam" } }), TENANT, pairing)).toBe(
      false,
    );
    expect(keepActivity(msg({ from: undefined }), TENANT, pairing)).toBe(false);
  });

  it("never keeps another tenant's, and always the bot's install and channel events", () => {
    const other = msg({ conversation: { id: "a:1", conversationType: "personal", tenantId: "t2" } });
    expect(keepActivity(other, TENANT, pairing)).toBe(false);
    const install = msg({
      type: "conversationUpdate",
      from: { id: "29:sam", aadObjectId: "oid-sam" },
      channelData: { tenant: { id: TENANT }, eventType: "teamMemberAdded" },
    });
    expect(keepActivity(install, TENANT, pairing)).toBe(true);
    expect(keepActivity({ ...install, channelData: { tenant: { id: "t2" } } }, TENANT, pairing)).toBe(false);
  });
});

describe("trimActivity", () => {
  it("keeps what Jig reads and drops attachments' contents and everything else", () => {
    const raw = {
      type: "message",
      id: "1",
      text: "x".repeat(20_000),
      serviceUrl: "https://s/",
      channelId: "msteams",
      from: { id: "29:a", aadObjectId: "oid", name: "Alex", role: "user" },
      conversation: { id: "a:1", conversationType: "personal", tenantId: TENANT, isGroup: false },
      attachments: [{ contentType: "image/png", contentUrl: "https://secret/", content: { big: 1 } }],
      entities: [{ type: "clientInfo" }],
    };
    const a = trimActivity(raw);
    expect(a.text).toHaveLength(16_000);
    expect(a.attachments).toEqual([{ contentType: "image/png" }]);
    expect(a.from).toEqual({ id: "29:a", aadObjectId: "oid", name: "Alex" });
    expect(a.conversation).toEqual({ id: "a:1", conversationType: "personal", tenantId: TENANT });
    expect(a).not.toHaveProperty("serviceUrl");
    expect(a).not.toHaveProperty("entities");
  });
});

describe("buildActivity", () => {
  it("sends Jig's HTML as xml text, with a card and a picture as attachments", () => {
    const card = { type: "AdaptiveCard", version: "1.5", body: [] };
    const a = buildActivity({
      text: "<b>Done</b>",
      card,
      image: { contentType: "image/png", data: "iVBORw0K" },
      summary: "Done",
    });
    expect(a).toEqual({
      type: "message",
      text: "<b>Done</b>",
      textFormat: "xml",
      summary: "Done",
      attachments: [
        { contentType: "application/vnd.microsoft.card.adaptive", content: card },
        { contentType: "image/png", contentUrl: "data:image/png;base64,iVBORw0K" },
      ],
    });
  });

  it("puts an escaped @mention in front", () => {
    const a = buildActivity({ text: "needs you" }, { id: "29:a", name: "Alex <A>" });
    expect(a.text).toBe("<at>Alex &lt;A&gt;</at> needs you");
    expect(a.entities).toEqual([
      { type: "mention", text: "<at>Alex &lt;A&gt;</at>", mentioned: { id: "29:a", name: "Alex <A>" } },
    ]);
  });

  it("refuses empty messages, long text and pictures Teams won't show", () => {
    expect(() => buildActivity({})).toThrow("empty");
    expect(() => buildActivity({ text: "x".repeat(90_000) })).toThrow("text_too_long");
    expect(() => buildActivity({ image: { contentType: "image/gif", data: "AA==" } })).toThrow("image_type");
    expect(() => buildActivity({ image: { contentType: "image/png", data: "not base64!" } })).toThrow(
      "image_data",
    );
    expect(() => buildActivity({ image: { contentType: "image/png", data: "A".repeat(1_500_000) } })).toThrow(
      "image_too_big",
    );
  });
});

describe("relayKeyMatches", () => {
  const key = "k".repeat(43);
  it("matches only the exact key, and never a short configured one", () => {
    expect(relayKeyMatches(key, key)).toBe(true);
    expect(relayKeyMatches(`${key}x`, key)).toBe(false);
    expect(relayKeyMatches("", key)).toBe(false);
    expect(relayKeyMatches(null, key)).toBe(false);
    expect(relayKeyMatches("short", "short")).toBe(false);
  });
});
