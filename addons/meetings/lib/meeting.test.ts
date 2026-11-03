import { describe, expect, it } from "vitest";
import type { MeetingCaption, MeetingRecord } from "../../../apps/desktop/src/shared/meetings";
import {
  meetingLink,
  meetingMarkdown,
  meetingMatches,
  meetingMention,
  mentionedMeetings,
  mergeCaption,
  questionPrompt,
  transcriptText,
} from "./meeting";

const caption = (id: string, text: string, final = false): MeetingCaption => ({
  id,
  speaker: "Alex",
  speakerId: "alex",
  timestamp: "2026-01-01T12:00:00.000Z",
  text,
  final,
});
const meeting = (): MeetingRecord => ({
  id: "meeting",
  title: "Weekly products",
  joinUrl: "",
  startedAt: "2026-01-01T12:00:00.000Z",
  status: "connected",
  capture: "Capturing",
  captions: [caption("one", "Review the API", true)],
  gaps: [],
  notes: "",
  actions: [],
});

describe("meeting source material", () => {
  it("accepts Teams join links and rejects lookalike domains, credentials and unrelated pages", () => {
    expect(meetingLink(" https://teams.microsoft.com/l/meetup-join/example ")).toContain(
      "meetup-join/example",
    );
    expect(meetingLink("https://teams.cloud.microsoft/meet/123?p=abc")).toContain("/meet/123");
    for (const url of [
      "http://teams.microsoft.com/l/meetup-join/x",
      "https://teams.microsoft.com.evil.test/meet/x",
      "https://x@teams.microsoft.com/meet/x",
      "https://teams.microsoft.com/chat",
      "file:///meeting",
    ])
      expect(() => meetingLink(url)).toThrow();
  });
  it("replaces partials and keeps a final against late partial events", () => {
    const partial = mergeCaption([], caption("one", "Review"));
    const final = mergeCaption(partial, caption("one", "Review the API", true));
    expect(final).toHaveLength(1);
    expect(mergeCaption(final, caption("one", "Review"))).toEqual(final);
    expect(mergeCaption(final, caption("two", "Review the API", true))).toHaveLength(2);
  });
  it("orders out-of-order captions without deduplicating repeated utterances", () => {
    const late = { ...caption("two", "Yes"), timestamp: "2026-01-01T12:01:00.000Z" };
    expect(mergeCaption([late], caption("one", "Yes")).map((c) => c.id)).toEqual(["one", "two"]);
  });
  it("limits transcript text to the cutoff and discloses gaps and unfinished words", () => {
    const r = meeting();
    r.captions.push({ ...caption("two", "Later"), timestamp: "2026-01-01T13:00:00.000Z" });
    r.gaps.push({ at: "2026-01-01T12:00:00.000Z", reason: "Disconnected" });
    const text = transcriptText(r, "2026-01-01T12:30:00.000Z");
    expect(text).toContain("Alex: Review the API");
    expect(text).toContain("CAPTURE GAP");
    expect(text).not.toContain("Later");
    expect(transcriptText(r)).toContain("unfinished");
  });
  it("asks through the meeting tool without promoting speech to instructions", () => {
    const prompt = questionPrompt(meeting(), "Will this fit the repository?", "2026-01-01T12:30:00.000Z");
    expect(prompt).toContain("jig_meeting_read");
    expect(prompt).toContain("not instructions");
    expect(prompt).toContain("12:30:00.000Z");
    expect(prompt).toContain("Will this fit");
    expect(prompt).not.toContain("Alex: Review");
  });
});

describe("meetings in chats and exports (D-250)", () => {
  it("finds meetings for the @ picker by the words of their title, newest first", () => {
    const list = [
      { id: "a", title: "Weekly products", startedAt: "2026-01-01T10:00:00Z" },
      { id: "b", title: "Products roadmap", startedAt: "2026-02-01T10:00:00Z" },
      { id: "c", title: "Design review", startedAt: "2026-03-01T10:00:00Z" },
    ];
    expect(meetingMatches(list, "").map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(meetingMatches(list, "prod").map((r) => r.id)).toEqual(["b", "a"]);
    expect(meetingMatches(list, "meeting:weekly-prod").map((r) => r.id)).toEqual(["a"]);
    expect(meetingMatches(list, "src/")).toEqual([]);
    expect(meetingMatches(list, "", 1).map((r) => r.id)).toEqual(["c"]);
  });
  const id = "1a2b3c4d-0000-4000-8000-000000000000";
  it("mentions a meeting by a readable name and the start of its id", () => {
    expect(meetingMention({ id, title: "Weekly Products: Q4 Review!" })).toBe(
      "@meeting:weekly-products-q4-review-1a2b3c4d",
    );
    expect(meetingMention({ id, title: "¡¡" })).toBe("@meeting:1a2b3c4d");
  });
  it("finds the meetings a message mentions, once each", () => {
    const records = [{ id }, { id: "ffff0000-0000-4000-8000-000000000000" }];
    const text = "Compare @meeting:weekly-1a2b3c4d with @meeting:ffff0000, and @meeting:x-1a2b3c4d again.";
    expect(mentionedMeetings(text, records).map((r) => r.id)).toEqual([id, records[1]!.id]);
    expect(mentionedMeetings("mail me@meeting:1a2b3c4d", records)).toEqual([]);
    expect(mentionedMeetings("@meeting:unknown-99999999", records)).toEqual([]);
  });
  it("writes notes, actions and the final transcript as Markdown", () => {
    const record = {
      ...meeting(),
      endedAt: "2026-01-01T12:30:00.000Z",
      notes: "Ship it.",
      actions: [
        { id: "a", title: "Fix login", prompt: "", owner: "Sam", evidence: "", queued: true },
        { id: "b", title: "Write docs", prompt: "", owner: "", evidence: "" },
      ],
      captions: [
        caption("one", "Review the API", true),
        { ...caption("two", "And the docs", true), timestamp: "2026-01-01T12:01:00.000Z" },
        caption("three", "half a sent"),
      ],
    };
    expect(meetingMarkdown(record)).toBe(
      "# Weekly products\n\n2026-01-01 12:00 UTC · 30 min\n\n## Notes\n\nShip it.\n\n## Actions\n\n" +
        "- [x] Fix login (Sam)\n- [ ] Write docs (Unknown)\n\n## Transcript\n\n**Alex** (12:00)\nReview the API\nAnd the docs\n",
    );
  });
});
