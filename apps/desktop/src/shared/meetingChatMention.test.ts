import { describe, expect, it } from "vitest";
import type { TeamsChatSummary } from "./meetingChat";
import {
  CHAT_READ_TOTAL,
  chatCursor,
  chatLine,
  chatMention,
  chatMentionMatches,
  chatReadText,
  chatShortId,
  mentionedChatIds,
  parseChatCursor,
} from "./meetingChatMention";

const chat = (id: string, name: string, at: string, members?: string[]): TeamsChatSummary => ({
  id,
  kind: members ? "group" : "oneOnOne",
  name,
  at,
  unread: false,
  ...(members ? { members } : {}),
});

describe("Teams chat mentions (D-333)", () => {
  const alex = chat("19:a_b@unq.gbl.spaces", "Alex Contoso", "2026-11-03T10:00:00.000Z");
  const portal = chat("19:portal@thread.v2", "Portal planning", "2026-11-02T10:00:00.000Z", [
    "Sam Fabrikam",
    "José Shop",
  ]);

  it("gives a chat a stable 8-character short id and a readable mention", () => {
    expect(chatShortId(alex.id)).toMatch(/^[0-9a-f]{8}$/);
    expect(chatShortId(alex.id)).toBe(chatShortId("19:a_b@unq.gbl.spaces"));
    expect(chatShortId(alex.id)).not.toBe(chatShortId(portal.id));
    expect(chatMention(alex)).toBe(`@chat:alex-contoso-${chatShortId(alex.id)}`);
    expect(chatMention({ id: portal.id, name: "!!!" })).toBe(`@chat:${chatShortId(portal.id)}`);
  });

  it("reads the short ids a message mentions, once each", () => {
    const a = chatMention(alex);
    const p = chatMention(portal);
    expect(mentionedChatIds(`compare ${a} and ${p}, then ${a}.`)).toEqual([
      chatShortId(alex.id),
      chatShortId(portal.id),
    ]);
    expect(mentionedChatIds("mail me@chat:x or @chat:nope")).toEqual([]);
  });

  it("finds chats by name or member, after chat: or chat and a space, newest first", () => {
    expect(chatMentionMatches([portal, alex], "")).toEqual([alex, portal]);
    expect(chatMentionMatches([portal, alex], "chat")).toEqual([alex, portal]);
    expect(chatMentionMatches([portal, alex], "chat:jose")).toEqual([portal]);
    expect(chatMentionMatches([portal, alex], "chat ale")).toEqual([alex]);
    expect(chatMentionMatches([portal, alex], "sam-fab")).toEqual([portal]);
    expect(chatMentionMatches([portal, alex], "chat zz")).toEqual([]);
  });

  it("pages back with a cursor and refuses a made-up one", () => {
    const c = chatCursor("2026-11-01T09:00:00.000Z", 100);
    expect(parseChatCursor(c)).toEqual({ before: "2026-11-01T09:00:00.000Z", read: 100 });
    expect(parseChatCursor(undefined)).toBeUndefined();
    expect(() => parseChatCursor("yesterday")).toThrow();
    expect(CHAT_READ_TOTAL).toBeGreaterThan(100);
  });

  it("writes the chat as plain lines: time, sender, words, pictures and files named", () => {
    const line = chatLine({
      id: "1",
      from: "Robin Shop",
      at: "2026-11-03T14:27:00.000Z",
      text: "The diagram\nand the spec:",
      images: [{ chatId: portal.id, messageId: "1", contentId: "x" }],
      files: [{ name: "Shop spec.docx", url: "https://contoso.sharepoint.com/x", kind: "file" }],
    });
    expect(line).toBe(
      "[2026-11-03 14:27] Robin Shop: The diagram / and the spec: [image] [file: Shop spec.docx]",
    );
    const text = chatReadText(
      { name: "Portal planning", kind: "group", members: ["You", "Sam Fabrikam"] },
      [{ id: "2", from: "You", at: "2026-11-03T15:00:00.000Z", text: "Thanks", mine: true }],
      true,
    );
    expect(text.split("\n")).toEqual([
      "Teams chat: Portal planning (group chat)",
      "Members: You, Sam Fabrikam",
      "1 messages, oldest first (times UTC); older ones: call again with before = nextBefore:",
      "[2026-11-03 15:00] You (the user): Thanks",
    ]);
  });
});
