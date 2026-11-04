import { describe, expect, it } from "vitest";
import {
  CHAT_GROUP_GAP_MS,
  chatChanged,
  chatDayLabel,
  chatDirectory,
  chatFiles,
  chatImages,
  chatPreviewText,
  chatText,
  chatTimeline,
  type MeetingChatMessage,
  meetingChatId,
  mergeChat,
  needsDirectory,
  oneOnOneChatIds,
  senderName,
  TEAMS_CHAT_ID,
  teamsChatLink,
  toChatMessages,
  toChatSummaries,
} from "./meetingChat";

const ME = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";

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
    expect(chatText('<div>Look</div><attachment id="1"></attachment>')).toBe("Look");
    expect(chatText('<p>Nice <img itemtype="http://schema.skype.com/Emoji" alt="😀" src="x"></p>')).toBe(
      "Nice 😀",
    );
    expect(chatText('<p>See <img src="https://example.com/a.png"></p>')).toBe("See (image)");
  });

  describe("pictures and files (D-328)", () => {
    const CHAT = "19:meeting_abc@thread.v2";
    const hosted = (message: string, content: string) =>
      `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(CHAT)}/messages/${message}/hostedContents/${content}/$value`;

    it("finds the pictures Graph hosts, with their size, and leaves out emoji and others", () => {
      const html = `<p>Diagram</p><img src="${hosted("1700", "aWQ9eA==")}" width="640" height="400"><img src="https://evil.example/chats/${CHAT}/messages/1/hostedContents/x/$value"><img itemtype="http://schema.skype.com/Emoji" alt="👍" src="${hosted("1700", "ZW1vamk=")}"><img src='${hosted("1700", "Yg==")}'>`;
      expect(chatImages(html)).toEqual([
        { chatId: CHAT, messageId: "1700", contentId: "aWQ9eA==", width: 640, height: 400 },
        { chatId: CHAT, messageId: "1700", contentId: "Yg==" },
      ]);
      expect(chatText(html)).toBe("Diagram\n(image)👍");
      // A path that isn't a chat, or an id with a slash, isn't read.
      expect(
        chatImages(`<img src="https://graph.microsoft.com/v1.0/chats/x/messages/1/hostedContents/a/$value">`),
      ).toEqual([]);
    });

    it("keeps shared files and https links, and leaves out replies and other addresses", () => {
      expect(
        chatFiles([
          {
            id: "1",
            contentType: "reference",
            name: "Shop spec.docx",
            contentUrl: "https://contoso.sharepoint.com/Shop%20spec.docx",
          },
          {
            id: "2",
            contentType: "reference",
            contentUrl: "https://contoso.sharepoint.com/sites/x/Plan%20B.xlsx",
          },
          { id: "3", contentType: "messageReference", contentUrl: "https://contoso.sharepoint.com/x" },
          {
            id: "4",
            contentType: "reference",
            name: "Old.txt",
            contentUrl: "http://contoso.example/Old.txt",
          },
          { id: "5", contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null },
          { id: "6", contentType: "text/html", name: "Fabrikam", contentUrl: "https://fabrikam.example" },
        ]),
      ).toEqual([
        { name: "Shop spec.docx", url: "https://contoso.sharepoint.com/Shop%20spec.docx", kind: "file" },
        { name: "Plan B.xlsx", url: "https://contoso.sharepoint.com/sites/x/Plan%20B.xlsx", kind: "file" },
        { name: "Fabrikam", url: "https://fabrikam.example", kind: "link" },
      ]);
      expect(chatFiles(undefined)).toEqual([]);
    });

    it("keeps a message that is only a picture or a file, and says (attachment) for what it can't show", () => {
      const [picture, file, card] = toChatMessages([
        {
          id: "1",
          createdDateTime: "2026-11-03T10:01:00Z",
          from: { user: { id: ALEX, displayName: "Alex" } },
          body: { contentType: "html", content: `<img src="${hosted("1", "YQ==")}">` },
        },
        {
          id: "2",
          createdDateTime: "2026-11-03T10:02:00Z",
          from: { user: { id: ALEX, displayName: "Alex" } },
          body: { contentType: "html", content: '<attachment id="f"></attachment>' },
          attachments: [
            {
              id: "f",
              contentType: "reference",
              name: "a.pdf",
              contentUrl: "https://contoso.sharepoint.com/a.pdf",
            },
          ],
        },
        {
          id: "3",
          createdDateTime: "2026-11-03T10:03:00Z",
          from: { user: { id: ALEX, displayName: "Alex" } },
          body: { contentType: "html", content: '<attachment id="c"></attachment>' },
          attachments: [{ id: "c", contentType: "application/vnd.microsoft.card.adaptive" }],
        },
      ]);
      expect(picture).toMatchObject({
        text: "",
        images: [{ chatId: CHAT, messageId: "1", contentId: "YQ==" }],
      });
      expect(picture!.files).toBeUndefined();
      expect(file).toMatchObject({ text: "", files: [{ name: "a.pdf", kind: "file" }] });
      expect(card).toMatchObject({ text: "(attachment)" });
    });

    it("says what a picture or file message is in the chat list", () => {
      expect(chatPreviewText("<p>Hi\nthere</p>")).toBe("Hi there");
      expect(chatPreviewText(`<img src="${hosted("1", "YQ==")}">`)).toBe("Sent an image");
      expect(chatPreviewText('<attachment id="1"></attachment>')).toBe("Sent a file");
      expect(chatPreviewText("Done", "text")).toBe("Done");
    });

    it("counts a picture or file arriving as a change", () => {
      const before = [{ id: "1", from: "Alex", at: "2026-11-03T10:01:00.000Z", text: "Look" }];
      const file = { name: "a.pdf", url: "https://contoso.sharepoint.com/a.pdf", kind: "file" as const };
      expect(chatChanged(before, [{ ...before[0]!, files: [file] }])).toBe(true);
      expect(chatChanged(before, [{ ...before[0]! }])).toBe(false);
    });
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
  describe("sender names (D-327)", () => {
    const oneOnOne = {
      chatType: "oneOnOne",
      members: [
        { userId: ME, displayName: "You" },
        { userId: ALEX, displayName: "Alex Contoso" },
      ],
    };

    it("names members by id and the other person of a one-to-one chat", () => {
      const directory = chatDirectory(oneOnOne, ME);
      expect(directory.names.get(ALEX)).toBe("Alex Contoso");
      expect(directory.peer).toBe("Alex Contoso");
      expect(chatDirectory({ chatType: "group", members: oneOnOne.members }, ME).peer).toBeUndefined();
      // A nameless peer falls back to the chat's title.
      const nameless = {
        chatType: "oneOnOne",
        members: [{ userId: ME }, { userId: ALEX, displayName: " " }],
      };
      expect(chatDirectory(nameless, ME, "Alex from Fabrikam").peer).toBe("Alex from Fabrikam");
      expect(chatDirectory(nameless, ME).peer).toBeUndefined();
    });

    it("uses Graph's name, then the members', then the peer's, then Someone", () => {
      const directory = chatDirectory(
        {
          chatType: "oneOnOne",
          members: [{ userId: ME }, { userId: ALEX.toUpperCase(), displayName: "Alex" }],
        },
        ME,
        "Alex Contoso",
      );
      expect(senderName({ id: ALEX, displayName: "Alex C." }, directory, ME)).toBe("Alex C.");
      expect(senderName({ id: ALEX, displayName: "" }, directory, ME)).toBe("Alex");
      expect(senderName({ id: SAM }, { names: new Map(), peer: "Alex Contoso" }, ME)).toBe("Alex Contoso");
      expect(senderName({ id: ME }, { names: new Map(), peer: "Alex Contoso" }, ME)).toBe("Someone");
      expect(senderName({ id: SAM }, undefined, ME)).toBe("Someone");
    });

    it("needs the members only for a nameless sender it can't name yet", () => {
      const nameless = [{ from: { user: { id: ALEX, displayName: "" } } }];
      expect(needsDirectory([{ from: { user: { id: ALEX, displayName: "Alex" } } }])).toBe(false);
      expect(needsDirectory([{ from: { user: { id: ME } } }], undefined, ME)).toBe(false);
      expect(needsDirectory([{ messageType: "systemEventMessage", from: { user: { id: ALEX } } }])).toBe(
        false,
      );
      expect(needsDirectory(nameless)).toBe(true);
      expect(needsDirectory(nameless, chatDirectory(oneOnOne, ME), ME)).toBe(false);
    });

    it("names nameless senders in messages and in the chat list's preview", () => {
      const at = "2026-11-04T10:00:00Z";
      const messages = toChatMessages(
        [
          {
            id: "1",
            createdDateTime: at,
            from: { user: { id: ALEX, displayName: null as unknown as string } },
            body: { contentType: "text", content: "Hi" },
          },
        ],
        ME,
        chatDirectory(oneOnOne, ME),
      );
      expect(messages[0]!.from).toBe("Alex Contoso");
      const [summary] = toChatSummaries(
        [
          {
            id: `19:${ME}_${ALEX}@unq.gbl.spaces`,
            chatType: "group",
            topic: "Shop",
            members: [...oneOnOne.members, { userId: SAM, displayName: "Sam Fabrikam" }],
            lastMessagePreview: {
              createdDateTime: at,
              from: { user: { id: SAM } },
              body: { content: "Done" },
            },
          },
        ],
        ME,
      );
      expect(summary!.preview?.from).toBe("Sam Fabrikam");
    });

    it("counts a sender's new name as a change", () => {
      const before = [{ id: "1", from: "Someone", at: "2026-11-04T10:00:00Z", text: "Hi" }];
      expect(chatChanged(before, [{ ...before[0]!, from: "Alex Contoso" }])).toBe(true);
    });
  });

  describe("bubbles: groups and days (D-327)", () => {
    const now = new Date(2026, 10, 4, 15, 0); // Wednesday 4 November, local time
    const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
    const msg = (id: string, from: string, when: string, extra: Partial<MeetingChatMessage> = {}) => ({
      id,
      from,
      fromId: from === "You" ? undefined : `${from}-id`,
      at: when,
      text: id,
      ...(from === "You" ? { mine: true } : {}),
      ...extra,
    });

    it("labels days: Today, Yesterday, the weekday this week, else the date", () => {
      expect(chatDayLabel(at(4, 9), now, "en-US")).toBe("Today");
      expect(chatDayLabel(at(3, 23, 59), now, "en-US")).toBe("Yesterday");
      expect(chatDayLabel(at(2, 9), now, "en-US")).toBe("Monday");
      expect(chatDayLabel(new Date(2026, 9, 27, 9).toISOString(), now, "en-US")).toBe("Oct 27");
      expect(chatDayLabel(new Date(2025, 9, 27, 9).toISOString(), now, "en-US")).toBe("Oct 27, 2025");
    });

    it("groups one sender's messages a few minutes apart, and starts a new group otherwise", () => {
      const items = chatTimeline(
        [
          msg("a1", "Alex", at(4, 10, 0)),
          msg("a2", "Alex", at(4, 10, 4)),
          msg("a3", "Alex", at(4, 10, 4 + CHAT_GROUP_GAP_MS / 60_000 + 1)),
          msg("y1", "You", at(4, 10, 20)),
          msg("y2", "You", at(4, 10, 21)),
          msg("s1", "Sam", at(4, 10, 22)),
          msg("a4", "Alex", at(4, 10, 23)),
        ],
        now,
      );
      const groups = items.flatMap((i) => (i.kind === "group" ? [i.group] : []));
      expect(groups.map((g) => g.messages.map((m) => m.id))).toEqual([
        ["a1", "a2"],
        ["a3"],
        ["y1", "y2"],
        ["s1"],
        ["a4"],
      ]);
      expect(groups[2]).toMatchObject({ mine: true, from: "You" });
      expect(groups[0]).toMatchObject({ mine: false, from: "Alex", fromId: "Alex-id" });
    });

    it("tells senders apart by id, so two people with one name don't merge", () => {
      const items = chatTimeline(
        [msg("1", "Alex", at(4, 10)), { ...msg("2", "Alex", at(4, 10, 1)), fromId: "other-alex" }],
        now,
      );
      expect(items.filter((i) => i.kind === "group")).toHaveLength(2);
    });

    it("puts a divider before each day's first message and breaks groups at midnight", () => {
      const items = chatTimeline(
        [msg("1", "Alex", at(3, 23, 58)), msg("2", "Alex", at(4, 0, 1)), msg("3", "Alex", at(4, 0, 2))],
        now,
        CHAT_GROUP_GAP_MS,
        "en-US",
      );
      expect(
        items.map((i) => (i.kind === "day" ? i.label : i.group.messages.map((m) => m.id).join())),
      ).toEqual(["Yesterday", "1", "Today", "2,3"]);
      expect(chatTimeline([], now)).toEqual([]);
    });
  });
});
