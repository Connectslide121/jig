import { describe, expect, it } from "vitest";
import { timeAgo } from "./time";

describe("timeAgo", () => {
  it("says how long ago, in the largest unit", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(timeAgo("2026-10-29T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-29T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-29T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-27T12:00:00Z", now)).toBe("2 d ago");
  });
});
