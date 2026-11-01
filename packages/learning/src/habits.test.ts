import { describe, expect, it } from "vitest";
import { chatSample, chatsOf, habitPatterns, promptStats } from "./habits";
import type { ActivityEvent } from "./mine";
import { mine } from "./mine";

const at = (day: number, minute = 0) =>
  `2026-10-${String(day).padStart(2, "0")}T09:${String(minute).padStart(2, "0")}:00.000Z`;
const prompt = (day: number, chat: string, text: string, minute = 0): ActivityEvent => ({
  at: at(day, minute),
  kind: "prompt",
  text,
  projectId: "p",
  detail: { chat },
});
const tool = (day: number, chat: string, name: string, minute = 0): ActivityEvent => ({
  at: at(day, minute),
  kind: "session.tool",
  text: name,
  projectId: "p",
  detail: { chat, tool: name },
});

const piecemealChat = (day: number, chat: string) => [
  prompt(day, chat, "write a function that validates orders", 1),
  prompt(day, chat, "now write an endpoint for it", 2),
  prompt(day, chat, "ok now add a service that calls it", 3),
  prompt(day, chat, "then create the tests", 4),
];

describe("chatsOf", () => {
  it("groups messages and Claude's edits by chat, and notes a plan", () => {
    const chats = chatsOf([
      prompt(1, "a", "plan the refactor first"),
      tool(1, "a", "Edit", 1),
      tool(1, "a", "Read", 2),
      tool(1, "b", "ExitPlanMode"),
      prompt(1, "b", "go"),
      tool(1, "c", "Edit"),
    ]);
    expect(chats.map((c) => [c.id, c.prompts.length, c.edits, c.planned])).toEqual([
      ["a", 1, 1, true],
      ["b", 1, 0, true],
    ]);
  });
});

describe("habitPatterns", () => {
  it("finds building piece by piece, with one whole sequence in order as examples", () => {
    const [p] = habitPatterns([...piecemealChat(1, "a"), ...piecemealChat(2, "b")]);
    expect(p?.kind).toBe("habit");
    expect(p?.key).toMatch(/^h-/);
    expect(p?.summary).toMatch(/piece by piece/);
    expect(p?.count).toBe(2);
    expect(p?.examples.map((e) => e.text)).toEqual(piecemealChat(1, "a").map((e) => e.text));
  });

  it("needs piece-by-piece chats on two days", () => {
    expect(habitPatterns([...piecemealChat(1, "a"), ...piecemealChat(1, "b")])).toEqual([]);
  });

  it("finds mostly one-off short asks", () => {
    const events = Array.from({ length: 6 }, (_, i) => prompt(1 + (i % 3), `c${i}`, "fix this bug"));
    const found = habitPatterns(events);
    expect(found.map((p) => p.summary)).toEqual([expect.stringMatching(/one-off/)]);
    // Not when most chats are real conversations.
    const talks = Array.from({ length: 6 }, (_, i) => [
      prompt(1, `t${i}`, "let's look at the cart"),
      prompt(1, `t${i}`, "and the totals"),
    ]).flat();
    expect(habitPatterns([...events, ...talks])).toEqual([]);
  });

  it("finds big changes without a plan, but not planned ones", () => {
    const big = (day: number, chat: string, planned: boolean) => [
      prompt(day, chat, planned ? "make a plan for checkout" : "rework checkout"),
      ...Array.from({ length: 15 }, (_, i) => tool(day, chat, "Edit", i + 1)),
    ];
    const unplanned = [...big(1, "a", false), ...big(2, "b", false), ...big(2, "c", false)];
    expect(habitPatterns(unplanned).map((p) => p.summary)).toEqual([expect.stringMatching(/without asking/)]);
    expect(habitPatterns([...big(1, "a", true), ...big(2, "b", true), ...big(2, "c", true)])).toEqual([]);
  });

  it("is part of mine()", () => {
    expect(mine([...piecemealChat(1, "a"), ...piecemealChat(2, "b")]).some((p) => p.kind === "habit")).toBe(
      true,
    );
  });
});

describe("promptStats", () => {
  it("sums up how they prompt", () => {
    const text = promptStats([
      ...piecemealChat(1, "a"),
      prompt(2, "b", "add a discount field to the cart; done when the tests pass"),
    ]);
    expect(text).toContain("2 chats, 5 messages");
    expect(text).toContain('one more piece ("now add…", "write a…"): 100%');
    expect(text).toContain("how to check it's done (tests, criteria): 50%");
    expect(promptStats([])).toBe("(no chats recorded)");
  });
});

describe("chatSample", () => {
  it("shows recent chats message by message, shortened, oldest chat first", () => {
    const sample = chatSample(
      [...piecemealChat(1, "a"), prompt(2, "b", `long ${"x".repeat(50)}`), tool(2, "b", "Edit", 1)],
      6,
      3,
      20,
    );
    expect(sample).toHaveLength(2);
    expect(sample[0]).toContain("4 message(s), 0 edit(s)");
    expect(sample[0]).toContain("1. write a function tha…");
    expect(sample[0]).toContain("(+1 more)");
    expect(sample[1]).toContain(`1. long ${"x".repeat(15)}…`);
    expect(sample[1]).toContain("1 edit(s)");
  });
});
