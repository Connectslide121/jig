import { describe, expect, it } from "vitest";
import { eventTime, sameDay, timeAgo } from "./time";

describe("timeAgo", () => {
  it("says how long ago, in the largest unit", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(timeAgo("2026-10-29T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-29T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-29T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-27T12:00:00Z", now)).toBe("2 d ago");
  });
});

describe("chat event times (D-306)", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0).getTime();
  const at = (h: number, m: number, s = 0, d = 4) => new Date(2026, 10, d, h, m, s).toISOString();
  it("says how long after the previous step, and the day only when it isn't today", () => {
    expect(eventTime(at(11, 3, 42), undefined, now)).not.toContain("after");
    expect(eventTime(at(11, 3, 42), at(11, 3, 42), now)).toContain("right after the previous step");
    expect(eventTime(at(11, 3, 42), at(11, 3, 30), now)).toContain("12 s after the previous step");
    expect(eventTime(at(11, 5, 42), at(11, 3, 42), now)).toContain("2 min after the previous step");
    expect(eventTime(at(13, 5), at(11, 3), now)).toContain("2 h 2 min after the previous step");
    expect(eventTime(at(11, 3, 0, 3), undefined, now)).toMatch(/3/);
    expect(eventTime(at(11, 3, 0, 4), undefined, now).includes(",")).toBe(false);
  });
  it("knows when the day changes", () => {
    expect(sameDay(at(1, 0), at(23, 0))).toBe(true);
    expect(sameDay(at(23, 0, 0, 3), at(1, 0))).toBe(false);
  });
});
