import { describe, expect, it } from "vitest";
import type { TeamsChatSummary } from "./meetingChat";
import {
  CHAT_SEARCH_MIN,
  chatKindOf,
  chatMatches,
  chatPasses,
  chatSearchRequest,
  chatSections,
  MAX_CHAT_PINS,
  newChatName,
  newChatRequest,
  normalizePins,
  setPin,
  toChatSearchHits,
} from "./meetingChatList";

const ME = "00000000-0000-4000-8000-0000000000ee";
const ALEX = "00000000-0000-4000-8000-00000000a1e5";
const SAM = "00000000-0000-4000-8000-0000000005a3";

const chat = (id: string, over: Partial<TeamsChatSummary> = {}): TeamsChatSummary => ({
  id: `19:${id}@thread.v2`,
  kind: "group",
  name: id,
  at: "2026-11-03T10:00:00.000Z",
  unread: false,
  ...over,
});

describe("chat list toolbar", () => {
  const alex = chat("alex", {
    kind: "oneOnOne",
    name: "Alex Contoso",
    preview: { from: "Alex Contoso", text: "Spec is ready" },
    unread: true,
  });
  const portal = chat("portal", { name: "Portal planning", members: ["Sam Fabrikam", "José Shop"] });
  const review = chat("meeting_review", { kind: "meeting", name: "Contoso weekly review" });

  it("matches every word in the name, the members or the last message, ignoring case and accents", () => {
    expect(chatMatches(alex, "")).toBe(true);
    expect(chatMatches(alex, "alex")).toBe(true);
    expect(chatMatches(alex, "SPEC ready")).toBe(true);
    expect(chatMatches(alex, "spec portal")).toBe(false);
    expect(chatMatches(portal, "jose")).toBe(true);
    expect(chatMatches(portal, "sam planning")).toBe(true);
  });

  it("filters unread chats, chats with people and meeting chats", () => {
    expect([alex, portal, review].filter((c) => chatPasses(c, "unread"))).toEqual([alex]);
    expect([alex, portal, review].filter((c) => chatPasses(c, "chats"))).toEqual([alex, portal]);
    expect([alex, portal, review].filter((c) => chatPasses(c, "meetings"))).toEqual([review]);
    expect([alex, portal, review].filter((c) => chatPasses(c))).toHaveLength(3);
  });

  it("keeps pins once each, valid ids only, in pin order and at most the limit", () => {
    expect(normalizePins([portal.id, "nope", portal.id, alex.id])).toEqual([portal.id, alex.id]);
    const many = Array.from({ length: MAX_CHAT_PINS + 5 }, (_, i) => `19:c${i}@thread.v2`);
    expect(normalizePins(many)).toHaveLength(MAX_CHAT_PINS);
    expect(setPin([portal.id], alex.id, true)).toEqual([portal.id, alex.id]);
    expect(setPin([alex.id, portal.id], alex.id, true)).toEqual([portal.id, alex.id]);
    expect(setPin([alex.id, portal.id], alex.id, false)).toEqual([portal.id]);
  });

  it("lists pinned chats in pin order above the others, both narrowed by search and filter", () => {
    const all = [alex, portal, review];
    expect(chatSections(all, [review.id, alex.id])).toEqual({ pinned: [review, alex], recent: [portal] });
    expect(chatSections(all, [review.id], "contoso")).toEqual({ pinned: [review], recent: [alex] });
    expect(chatSections(all, [review.id], "", "chats")).toEqual({ pinned: [], recent: [alex, portal] });
    // A pin of a chat that isn't loaded shows nothing.
    expect(chatSections(all, ["19:gone@thread.v2"]).pinned).toEqual([]);
  });

  it("asks Microsoft Search for Teams messages", () => {
    expect(CHAT_SEARCH_MIN).toBeGreaterThan(1);
    expect(chatSearchRequest(" invoices ")).toEqual({
      requests: [{ entityTypes: ["chatMessage"], query: { queryString: "invoices" }, from: 0, size: 25 }],
    });
  });

  it("reads search hits in chats, as plain text, each once, channel posts left out", () => {
    const hit = (id: string, chatId: string | undefined, summary: string) => ({
      summary,
      resource: {
        id,
        chatId,
        createdDateTime: "2026-11-02T09:00:00Z",
        from: { emailAddress: { name: "Kim Fabrikam" } },
      },
    });
    const response = {
      value: [
        {
          hitsContainers: [
            {
              hits: [
                hit("1", `19:${ME}_${ALEX}@unq.gbl.spaces`, "The <c0>invoices</c0> are sent<ddd/>"),
                hit("1", `19:${ME}_${ALEX}@unq.gbl.spaces`, "again"),
                hit("2", undefined, "A channel post about <c0>invoices</c0>"),
                hit("3", "not a chat", "x"),
                { resource: { id: "4", chatId: "19:x@thread.v2", createdDateTime: "nope" } },
              ],
            },
          ],
        },
      ],
    };
    expect(toChatSearchHits(response)).toEqual([
      {
        chatId: `19:${ME}_${ALEX}@unq.gbl.spaces`,
        messageId: "1",
        from: "Kim Fabrikam",
        at: "2026-11-02T09:00:00.000Z",
        text: "The invoices are sent…",
      },
    ]);
    expect(toChatSearchHits(undefined)).toEqual([]);
    expect(toChatSearchHits({ value: [{ hitsContainers: [{}] }] })).toEqual([]);
  });

  it("guesses a chat's kind from its id", () => {
    expect(chatKindOf(`19:${ME}_${ALEX}@unq.gbl.spaces`)).toBe("oneOnOne");
    expect(chatKindOf("19:meeting_abc@thread.v2")).toBe("meeting");
    expect(chatKindOf("19:abc@thread.v2")).toBe("group");
  });

  it("builds a one-to-one or group chat with you and everyone as owners", () => {
    const bind = (id: string) => `https://graph.microsoft.com/v1.0/users('${id}')`;
    const one = newChatRequest(ME, [ALEX, ME], "ignored");
    expect(one.chatType).toBe("oneOnOne");
    expect(one).not.toHaveProperty("topic");
    expect(one.members.map((m) => m["user@odata.bind"])).toEqual([bind(ME), bind(ALEX)]);
    expect(one.members.every((m) => m.roles[0] === "owner")).toBe(true);
    const group = newChatRequest(ME, [ALEX, SAM, ALEX.toUpperCase()], "  Launch  ");
    expect(group).toMatchObject({ chatType: "group", topic: "Launch" });
    expect(group.members).toHaveLength(3);
    expect(newChatRequest(ME, [ALEX, SAM], " ")).not.toHaveProperty("topic");
    expect(() => newChatRequest(ME, [ME])).toThrow();
  });

  it("names a new chat by its name, else its people", () => {
    const people = ["Alex", "Sam", "Kim", "Lee"].map((name) => ({ name }));
    expect(newChatName(people.slice(0, 1), "Ignored")).toBe("Alex");
    expect(newChatName(people.slice(0, 2), " Launch ")).toBe("Launch");
    expect(newChatName(people)).toBe("Alex, Sam, Kim +1");
  });
});
