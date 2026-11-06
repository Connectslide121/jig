import { describe, expect, it } from "vitest";
import { meetingExcerpt, meetingSources } from "./meetingExcerpt";
import type { MeetingRecord } from "./meetings";

const caption = (i: number, text: string, final = true) => ({
  id: `c${i}`,
  speakerId: "s",
  speaker: i % 2 ? "Alex" : "Sam",
  timestamp: new Date(2026, 0, 1, 9, i).toISOString(),
  text,
  final,
});

const record = (over: Partial<MeetingRecord> = {}): MeetingRecord =>
  ({
    id: "m1",
    title: "Shop weekly",
    joinUrl: "",
    startedAt: "2026-01-01T09:00:00.000Z",
    status: "ended",
    capture: "",
    captions: [],
    gaps: [],
    notes: "",
    actions: [],
    ...over,
  }) as MeetingRecord;

describe("meetingExcerpt", () => {
  it("has the title, the notes and the final captions", () => {
    const text = meetingExcerpt(
      record({ notes: "**TL;DR** Swap shifts", captions: [caption(1, "Hello"), caption(2, "draft", false)] }),
    );
    expect(text).toContain("# Shop weekly");
    expect(text).toContain("## Notes");
    expect(text).toContain("Alex: Hello");
    expect(text).not.toContain("draft");
  });

  it("keeps the end of a long transcript within the size", () => {
    const captions = Array.from({ length: 400 }, (_, i) => caption(i, `line ${i} ${"x".repeat(40)}`));
    const text = meetingExcerpt(record({ captions }), 2000);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain("line 399");
    expect(text).not.toContain("line 0 ");
  });

  it("is only the head without captions", () => {
    expect(meetingExcerpt(record())).toBe("# Shop weekly\n");
  });
});

describe("meetingSources", () => {
  it("lists ended meetings, newest first, at most the limit", () => {
    const list = meetingSources(
      [
        record({ id: "a", startedAt: "2026-01-01T09:00:00.000Z" }),
        record({ id: "b", startedAt: "2026-01-02T09:00:00.000Z", status: "interrupted" }),
        record({ id: "c", startedAt: "2026-01-03T09:00:00.000Z", status: "connected" }),
      ],
      5,
    );
    expect(list.map((m) => m.id)).toEqual(["b", "a"]);
    expect(meetingSources([record({ id: "a" }), record({ id: "b" })], 1)).toHaveLength(1);
  });
});
