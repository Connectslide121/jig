import { describe, expect, it } from "vitest";
import {
  activeMinutes,
  aiLineHashes,
  lineHash,
  parseLogPatch,
  summarizeWork,
  workedText,
} from "./attribution";
import { type ActivityEvent, mine } from "./mine";
import { correctionSignal, frictionPatterns, pastePatterns, unusedToolPatterns } from "./signals";

const ev = (day: number, kind: ActivityEvent["kind"], text: string, detail?: Record<string, string>) => ({
  at: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  kind,
  text,
  projectId: "p",
  detail,
});

describe("signals", () => {
  it("spots corrections", () => {
    expect(correctionSignal("No, I meant the other file")).toBe(true);
    expect(correctionSignal("that's wrong, use the v2 api")).toBe(true);
    expect(correctionSignal("Undo that")).toBe(true);
    expect(correctionSignal("Now add a test")).toBe(false);
    expect(correctionSignal("Notes for the release")).toBe(false);
  });
  it("turns repeated friction into patterns", () => {
    const events = [
      ev(1, "friction", "stopped", { signal: "interrupt" }),
      ev(1, "friction", "stopped", { signal: "interrupt" }),
      ev(2, "friction", "stopped", { signal: "interrupt" }),
      ev(2, "friction", "npm test", { signal: "script-failed" }),
    ];
    const p = frictionPatterns(events);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      kind: "friction",
      summary: "You stopped Claude mid-turn",
      count: 3,
      days: 2,
    });
  });
  it("counts pastes per kind", () => {
    const events = [
      ev(1, "prompt", "why [pasted http, 20 lines]", { pasted: "http:2" }),
      ev(2, "prompt", "and this [pasted http, 9 lines]", { pasted: "http:2,json:1" }),
      ev(3, "prompt", "again", { pasted: "http:1" }),
    ];
    const p = pastePatterns(events);
    expect(p.map((x) => [x.summary, x.count])).toEqual([
      ["You pasted HTTP requests/responses into chats", 5],
    ]);
  });
  it("notices Claude's browser was never used for UI work", () => {
    const ui = [1, 1, 2, 2, 3].map((d) => ev(d, "prompt", "the button looks wrong on the page"));
    expect(unusedToolPatterns(ui)).toHaveLength(1);
    expect(
      unusedToolPatterns([...ui, ev(3, "session.tool", "{}", { tool: "mcp__jig__jig_browser_open" })]),
    ).toHaveLength(0);
    expect(mine(ui).some((p) => p.kind === "unused-tool")).toBe(true);
  });
});

describe("attribution", () => {
  const log = [
    "\x1eccc\x1f2026-10-20T10:00:00Z\x1ffix: rounding",
    "diff --git a/cart.ts b/cart.ts",
    "--- a/cart.ts",
    "+++ b/cart.ts",
    "@@ -2 +2 @@",
    "-  return a + b + 1;",
    "+  return Math.round(a + b);",
    "\x1ebbb\x1f2026-10-19T10:00:00Z\x1fAdd total",
    "diff --git a/cart.ts b/cart.ts",
    "--- /dev/null",
    "+++ b/cart.ts",
    "@@ -0,0 +1,3 @@",
    "+export function total(a, b) {",
    "+  return a + b + 1;",
    "+}",
  ].join("\n");
  it("parses git log -p, oldest first", () => {
    const commits = parseLogPatch(log);
    expect(commits.map((c) => c.hash)).toEqual(["bbb", "ccc"]);
    expect(commits[0]!.files[0]).toMatchObject({ path: "cart.ts", removed: [] });
    expect(commits[0]!.files[0]!.added).toHaveLength(3);
  });
  it("splits lines by origin, with churn and fixes", () => {
    const ai = new Set(
      aiLineHashes("Write", { content: "export function total(a, b) {\n  return a + b + 1;\n}" }),
    );
    expect(ai.has(lineHash("  return a + b + 1;")!)).toBe(true);
    const s = summarizeWork(parseLogPatch(log), (p) => (p === "cart.ts" ? ai : undefined), "2026-10-19");
    expect(s).toMatchObject({ commits: 2, ai: 2, hand: 1, churn: { ai: 1, hand: 0 } });
    expect(s.fixes).toEqual([{ commit: "ccc", subject: "fix: rounding", origin: "ai" }]);
    expect(workedText(s, 90)).toBe(
      "2 commits: 2 lines by Claude, 1 by hand. 1 recent lines were changed again (1 by Claude, 0 by hand). The fix in ccc changed lines Claude wrote from the days before. About 1.5 h in chats (an estimate).",
    );
    expect(workedText({ ...s, commits: 0 })).toBe("");
  });
  it("estimates active minutes", () => {
    expect(activeMinutes(["2026-10-01T10:00:00Z", "2026-10-01T10:05:00Z", "2026-10-01T11:00:00Z"])).toBe(5);
  });
});
