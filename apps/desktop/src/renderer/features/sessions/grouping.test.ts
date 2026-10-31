import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../../shared/engine";
import { chatPage, groupChats, movePinned, pinnedInOrder, sortChats } from "./grouping";

const chat = (id: string, patch: Partial<SessionMeta> = {}) =>
  ({ id, title: id, status: "idle", updatedAt: "2026-10-30T10:00:00.000Z", ...patch }) as SessionMeta;
const now = new Date("2026-10-30T12:00:00");

describe("chatPage", () => {
  it("counts pinned chats toward ten and expands ten at a time", () => {
    const chats = Array.from({ length: 25 }, (_, i) => chat(String(i), { pinned: i < 3 }));
    expect(chatPage(chats).chats).toEqual(chats.slice(0, 10));
    expect(chatPage(chats).remaining).toBe(15);
    expect(chatPage(chats, 1).chats).toEqual(chats.slice(0, 20));
    expect(chatPage(chats, 2)).toEqual({ chats, remaining: 0 });
  });
  it("shows all pins even above ten, then expands unpinned chats by ten", () => {
    const chats = Array.from({ length: 30 }, (_, i) => chat(String(i), { pinned: i < 12 }));
    expect(chatPage(chats).chats).toEqual(chats.slice(0, 12));
    expect(chatPage(chats, 1).chats).toEqual(chats.slice(0, 22));
  });
  it("handles empty and short lists without a remaining count", () => {
    expect(chatPage([])).toEqual({ chats: [], remaining: 0 });
    expect(chatPage([chat("one")])).toEqual({ chats: [chat("one")], remaining: 0 });
  });
});

describe("pinned order", () => {
  const list = [
    chat("a", { pinned: true }),
    chat("b", { pinned: true }),
    chat("c", { pinned: true }),
    chat("d"),
  ];

  it("follows the saved order, unlisted pinned chats after it", () => {
    expect(pinnedInOrder(list, ["c", "a"]).map((m) => m.id)).toEqual(["c", "a", "b"]);
  });

  it("puts pinned chats before the rest", () => {
    expect(sortChats(list, ["b"]).map((m) => m.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("moves a chat before another", () => {
    expect(movePinned(list, ["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(movePinned(list, ["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"]);
  });

  it("changes nothing for itself, an unpinned chat or the same place", () => {
    expect(movePinned(list, [], "a", "a")).toBeUndefined();
    expect(movePinned(list, [], "d", "a")).toBeUndefined();
    expect(movePinned(list, ["a", "b", "c"], "a", "b")).toBeUndefined();
  });
});

describe("groupChats", () => {
  const projects = [
    { id: "p1", name: "One" },
    { id: "p2", name: "Two" },
  ];

  it("by project: the active project first, then No project; empty groups stay", () => {
    const groups = groupChats("project", [chat("a", { projectId: "p2" }), chat("b")], projects, "p2", []);
    expect(groups.map((g) => [g.key, g.chats.length])).toEqual([
      ["p2", 1],
      ["p1", 0],
      ["none", 1],
    ]);
  });

  it("by status: pinned first, then by status, skipping empty groups", () => {
    const groups = groupChats(
      "status",
      [
        chat("a", { status: "working" }),
        chat("b", { status: "needs_you" }),
        chat("c", { status: "idle", pinned: true }),
        chat("d", { status: "starting" }),
      ],
      projects,
      undefined,
      [],
    );
    expect(groups.map((g) => [g.key, g.chats.map((m) => m.id).sort()])).toEqual([
      ["pinned", ["c"]],
      ["needs_you", ["b"]],
      ["working", ["a", "d"]],
    ]);
  });

  it("by day: today, yesterday, last 7 days, older", () => {
    const groups = groupChats(
      "recent",
      [
        chat("a", { updatedAt: "2026-10-30T08:00:00" }),
        chat("b", { updatedAt: "2026-10-29T23:00:00" }),
        chat("c", { updatedAt: "2026-10-26T08:00:00" }),
        chat("d", { updatedAt: "2026-09-01T08:00:00" }),
      ],
      projects,
      undefined,
      [],
      now,
    );
    expect(groups.map((g) => [g.title, g.chats[0]?.id])).toEqual([
      ["Today", "a"],
      ["Yesterday", "b"],
      ["Last 7 days", "c"],
      ["Older", "d"],
    ]);
  });

  it("one list has a single headerless group, pinned first", () => {
    const groups = groupChats("all", [chat("a"), chat("b", { pinned: true })], projects, undefined, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.headerless).toBe(true);
    expect(groups[0]?.chats.map((m) => m.id)).toEqual(["b", "a"]);
  });
});
