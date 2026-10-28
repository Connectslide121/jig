import { describe, expect, it } from "vitest";
import { periodStart, standupPrompt } from "./digest";

describe("standup digest", () => {
  it("starts at the previous working day", () => {
    const at = (s: string) => periodStart("workday", new Date(s)).toDateString();
    expect(at("2026-10-28T10:00:00")).toBe(new Date("2026-10-27T00:00:00").toDateString()); // Wed → Tue
    expect(at("2026-10-26T10:00:00")).toBe(new Date("2026-10-23T00:00:00").toDateString()); // Mon → Fri
    expect(at("2026-10-25T10:00:00")).toBe(new Date("2026-10-23T00:00:00").toDateString()); // Sun → Fri
    expect(periodStart("week", new Date("2026-10-28T10:00:00")).toDateString()).toBe(
      new Date("2026-10-21T00:00:00").toDateString(),
    );
  });

  it("gives Claude only repositories with work, and the chats", () => {
    const p = standupPrompt(
      new Date("2026-10-27T00:00:00"),
      [
        { name: "shop", branch: "main", commits: ["Add discount"], uncommitted: 2 },
        { name: "idle", branch: "main", commits: [], uncommitted: 0 },
      ],
      [{ project: "shop", title: "Fix cart", turns: 3, status: "idle" }],
    );
    expect(p).toContain("### shop (branch main)\n- commit: Add discount\n- 2 uncommitted file(s)");
    expect(p).not.toContain("### idle");
    expect(p).toContain('- [shop] "Fix cart" (3 turns, idle)');
  });
});
