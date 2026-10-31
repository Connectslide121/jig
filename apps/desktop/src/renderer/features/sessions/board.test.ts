import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../../shared/engine";
import { boardColumnOf, boardColumns, boardSummary, RECENT_LIMIT } from "./board";

// Local times, so "today" is the same day in every time zone.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
const now = new Date(2026, 9, 16, 12).getTime();
const chat = (id: string, patch: Partial<SessionMeta> = {}): SessionMeta =>
  ({
    id,
    title: id,
    cwd: "/shop",
    createdAt: at(16, 8),
    updatedAt: at(16, 10),
    model: "",
    permissionMode: "default",
    status: "idle",
    authSource: "subscription",
    costUsd: 0,
    usage: {},
    turns: 1,
    ...patch,
  }) as SessionMeta;

describe("chats board", () => {
  it("puts each chat where it needs you", () => {
    expect(boardColumnOf(chat("a", { status: "needs_you" }), 0)).toBe("needs_you");
    expect(boardColumnOf(chat("a", { status: "starting" }), 0)).toBe("working");
    expect(boardColumnOf(chat("a", { status: "error" }), 0)).toBe("error");
    expect(boardColumnOf(chat("a", { turns: 3 }), 2)).toBe("unread");
    expect(boardColumnOf(chat("a", { turns: 3 }), 3)).toBe("recent");
    // Not opened since Jig started: nothing to call new.
    expect(boardColumnOf(chat("a", { turns: 3 }), undefined)).toBe("recent");
  });

  it("leaves out builds, archived and old quiet chats; newest first", () => {
    const columns = boardColumns(
      [
        chat("old", { updatedAt: at(1, 10) }),
        chat("older-but-stuck", { updatedAt: at(1, 10), status: "error" }),
        chat("build", { kind: "builder" }),
        chat("gone", { archived: true }),
        chat("b", { updatedAt: at(16, 9) }),
        chat("c", { updatedAt: at(16, 11) }),
      ],
      {},
      now,
    );
    const ids = (key: string) => columns.find((c) => c.key === key)!.chats.map((m) => m.id);
    expect(columns.map((c) => c.key)).toEqual(["needs_you", "working", "unread", "error", "recent"]);
    expect(ids("recent")).toEqual(["c", "b"]);
    expect(ids("error")).toEqual(["older-but-stuck"]);
    const many = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => chat(`m${i}`));
    expect(boardColumns(many, {}, now).find((c) => c.key === "recent")!.chats).toHaveLength(RECENT_LIMIT);
  });

  it("sums up what is going on and today's cost", () => {
    const metas = [
      chat("a", { status: "needs_you", costUsd: 1.5 }),
      chat("b", { status: "working", costUsd: 0.25 }),
      chat("c", { costUsd: 9, updatedAt: at(10, 10) }),
    ];
    expect(boardSummary(boardColumns(metas, {}, now), metas, now)).toBe(
      "1 needs you · 1 working · ≈ $1.75 today",
    );
    expect(boardSummary(boardColumns([], {}, now), [], now)).toBe("Nothing needs you");
  });
});
