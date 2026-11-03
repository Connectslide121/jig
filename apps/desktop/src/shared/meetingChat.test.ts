import { describe, expect, it } from "vitest";
import {
  chatChanged,
  chatText,
  meetingChatId,
  mergeChat,
  oneOnOneChatIds,
  TEAMS_CHAT_ID,
  teamsChatLink,
  toChatMessages,
  toChatSummaries,
} from "./meetingChat";

const ME = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";

describe("meeting chat", () => {
  it("finds the chat thread in a Teams join link", () => {
    expect(
      meetingChatId(
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZmFrZQ%40thread.v2/0?context=%7b%22Tid%22%3a%22x%22%7d",
      ),
    ).toBe("19:meeting_ZmFrZQ@thread.v2");
    expect(meetingChatId("https://teams.microsoft.com/meet/123456?p=abc")).toBeUndefined();
    expect(meetingChatId("https://teams.microsoft.com/l/meetup-join/%E0%A4%A/0")).toBeUndefined();
  });

  it("gives both possible one-to-one chat ids, and none for a bad id", () => {
    expect(oneOnOneChatIds(ME, ALEX)).toEqual([
      `19:${ME}_${ALEX}@unq.gbl.spaces`,
      `19:${ALEX}_${ME}@unq.gbl.spaces`,
    ]);
    expect(oneOnOneChatIds(ME, "8:orgid:x")).toEqual([]);
  });

  it("turns a Teams message into plain text", () => {
    expect(chatText('<p>Hi <at id="0">Alex</at>,</p><p>see&nbsp;&lt;this&gt; &amp; that&#33;</p>')).toBe(
      "Hi Alex,\nsee <this> & that!",
    );
    expect(chatText('<div>Look</div><attachment id="1"></attachment>')).toBe("Look\n(attachment)");
  });

  it("keeps people's messages, oldest first, and marks yours", () => {
    const messages = toChatMessages(
      [
        {
          id: "3",
          createdDateTime: "2026-11-03T10:02:00Z",
          from: { user: { id: ME, displayName: "Jon" } },
          body: { contentType: "text", content: "On it" },
        },
        {
          id: "2",
          messageType: "systemEventMessage",
          createdDateTime: "2026-11-03T10:01:30Z",
          from: null,
          body: { content: "<systemEventMessage/>" },
        },
        {
          id: "1",
          createdDateTime: "2026-11-03T10:01:00Z",
          from: { user: { id: ALEX, displayName: "Alex" } },
          body: { contentType: "html", content: "<p>Link: https://example.com</p>" },
        },
        {
          id: "4",
          createdDateTime: "2026-11-03T10:03:00Z",
          deletedDateTime: "2026-11-03T10:04:00Z",
          from: { user: { id: ALEX, displayName: "Alex" } },
          body: { content: "gone" },
        },
      ],
      ME,
    );
    expect(messages).toEqual([
      {
        id: "1",
        from: "Alex",
        fromId: ALEX,
        at: "2026-11-03T10:01:00.000Z",
        text: "Link: https://example.com",
      },
      { id: "3", from: "Jon", fromId: ME, at: "2026-11-03T10:02:00.000Z", text: "On it", mine: true },
    ]);
  });

  it("merges new messages and edits, and says when something changed", () => {
    const a = { id: "1", from: "Alex", at: "2026-11-03T10:01:00.000Z", text: "Hi" };
    const b = { id: "2", from: "Sam", at: "2026-11-03T10:02:00.000Z", text: "Hello" };
    const merged = mergeChat([a], [b, { ...a, text: "Hi all" }]);
    expect(merged.map((m) => m.text)).toEqual(["Hi all", "Hello"]);
    expect(chatChanged([a], merged)).toBe(true);
    expect(chatChanged(merged, mergeChat(merged, [b]))).toBe(false);
  });

  describe("chat list (D-296)", () => {
    const one = {
      id: `19:${ME}_${ALEX}@unq.gbl.spaces`,
      chatType: "oneOnOne",
      members: [
        { userId: ME, displayName: "Me" },
        { userId: ALEX, displayName: "Alex Contoso" },
      ],
      lastMessagePreview: {
        createdDateTime: "2026-11-03T10:00:00Z",
        from: { user: { id: ALEX, displayName: "Alex Contoso" } },
        body: { contentType: "html", content: "<p>Spec&nbsp;is<br><b>ready</b></p>" },
      },
      viewpoint: { lastMessageReadDateTime: "2026-11-03T09:00:00Z" },
    };
    const group = {
      id: "19:abc@thread.v2",
      chatType: "group",
      topic: null,
      lastUpdatedDateTime: "2026-11-02T10:00:00Z",
      members: ["Me", "Sam", "Robin", "Kim", "Lee"].map((n, i) => ({
        userId: i ? `id-${n}` : ME,
        displayName: n,
      })),
      lastMessagePreview: {
        createdDateTime: "2026-11-02T10:00:00Z",
        from: { user: { id: ME, displayName: "Me" } },
        body: { contentType: "text", content: "Thanks" },
      },
    };
    it("names chats, previews the last message and sorts newest first", () => {
      const [a, b] = toChatSummaries([group, one], ME);
      expect(a).toEqual({
        id: one.id,
        kind: "oneOnOne",
        name: "Alex Contoso",
        peerId: ALEX,
        preview: { from: "Alex Contoso", text: "Spec is ready" },
        at: "2026-11-03T10:00:00.000Z",
        unread: true,
      });
      expect(b).toMatchObject({ kind: "group", name: "Sam, Robin, Kim +1", unread: false });
      expect(b!.preview).toEqual({ from: "You", text: "Thanks", mine: true });
    });
    it("counts a chat opened in Jig as read and leaves hidden ones out", () => {
      const read = new Map([[one.id, "2026-11-03T10:00:00Z"]]);
      expect(toChatSummaries([one], ME, read)[0]!.unread).toBe(false);
      expect(toChatSummaries([{ ...one, viewpoint: { isHidden: true } }], ME)).toEqual([]);
      expect(toChatSummaries([{ ...group, topic: "Portal" }], ME)[0]!.name).toBe("Portal");
    });
    it("accepts only Teams chat ids and links to chats", () => {
      expect(TEAMS_CHAT_ID.test(one.id)).toBe(true);
      expect(TEAMS_CHAT_ID.test("19:abc@thread.v2")).toBe(true);
      expect(TEAMS_CHAT_ID.test("../me")).toBe(false);
      expect(teamsChatLink({ email: "alex@contoso.com" })).toBe(
        "https://teams.microsoft.com/l/chat/0/0?users=alex%40contoso.com",
      );
    });
  });
});
