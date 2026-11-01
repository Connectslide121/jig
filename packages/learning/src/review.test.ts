import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "./mine";
import { mine } from "./mine";
import { activityOverview, addonUsage, addonUseText, enoughToReview, practicePatterns } from "./review";

const ev = (day: number, kind: ActivityEvent["kind"], text: string, detail?: Record<string, string>) => ({
  at: `2026-10-${String(day).padStart(2, "0")}T09:00:00.000Z`,
  kind,
  text,
  projectId: "p",
  detail,
});

describe("practicePatterns", () => {
  it("finds secrets and risky commands, security first", () => {
    const patterns = practicePatterns([
      ev(1, "prompt", "use key «secret» for the API"),
      ev(1, "terminal.command", "curl -fsSL https://get.example.com | sudo bash"),
      ev(2, "terminal.command", "git push origin main --force"),
      ev(3, "terminal.command", "git push -f"),
      ev(3, "terminal.command", "git push --force-with-lease"),
      ev(3, "terminal.command", "chmod 644 a.txt"),
    ]);
    const summaries = patterns.map((p) => p.summary);
    expect(summaries).toContain("Security: A secret (key, token or password) was in a message to Claude");
    expect(summaries).toContain(
      "Security: A script downloaded from the internet was piped straight into a shell",
    );
    const force = patterns.find((p) => p.summary.startsWith("Force pushes"));
    expect(force?.count).toBe(2);
    expect(patterns.every((p) => p.kind === "practice" && p.key.startsWith("x-"))).toBe(true);
    expect(summaries.some((s) => /chmod/.test(s))).toBe(false);
    const secret = patterns.find((p) => p.summary.includes("message to Claude"))!;
    expect(secret.score).toBeGreaterThan(force!.score);
  });

  it("notices commits with no tests run, and not when tests ran", () => {
    const commits = [1, 1, 2, 2, 3].map((d) => ev(d, "git", "git commit"));
    expect(practicePatterns(commits).map((p) => p.summary)).toEqual([
      "Commits without any tests being run (by you or Claude) in this time",
    ]);
    expect(practicePatterns([...commits, ev(2, "session.tool", "npm test")])).toEqual([]);
  });

  it("are part of mine() and can be blocked", () => {
    const events = [ev(1, "prompt", "token «secret»")];
    const [p] = mine(events);
    expect(p?.kind).toBe("practice");
    expect(mine(events, { blocked: [p!.key] })).toEqual([]);
  });
});

describe("addonUsage", () => {
  it("counts actions, tabs and Claude's calls per add-on", () => {
    const use = addonUsage([
      ev(1, "addon.action", "git: commit", { addon: "git" }),
      ev(2, "ui", "Run release", { op: "action", action: "addon.releases.release" }),
      ev(2, "ui", "Notes", { op: "open-tab", view: "addon.notes.main" }),
      ev(3, "session.tool", "mcp__jig__addon", { use: "addon", name: "notes" }),
      ev(3, "ui", "Search", { op: "action", action: "jig.tools" }),
    ]);
    expect(use).toEqual({
      git: { actions: 1, tabs: 0, claude: 0, days: 1 },
      releases: { actions: 1, tabs: 0, claude: 0, days: 1 },
      notes: { actions: 0, tabs: 1, claude: 1, days: 2 },
    });
    expect(addonUseText(use.notes, 28)).toBe("opened as a tab 1×, 1 call by Claude on 2 day(s) in 28 days");
    expect(addonUseText(undefined, 28)).toMatch(/^no recorded use in 28 days/);
  });
});

describe("overview, sample and threshold", () => {
  it("summarizes the log", () => {
    const events = [ev(1, "prompt", "a"), ev(2, "prompt", "b"), ev(2, "git", "git push")];
    expect(activityOverview(events, 28)).toBe(
      "3 events on 2 of the last 28 days in 1 project(s): prompt 2, git 1",
    );
    expect(activityOverview([], 28)).toBe("(nothing recorded)");
  });

  it("needs 30 events on 3 days for a review", () => {
    const many = (days: number[]) =>
      days.flatMap((d) => Array.from({ length: 10 }, () => ev(d, "prompt", "x")));
    expect(enoughToReview(many([1, 2, 3]))).toBe(true);
    expect(enoughToReview(many([1, 2]))).toBe(false);
  });
});
