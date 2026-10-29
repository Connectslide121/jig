import { describe, expect, it } from "vitest";
import {
  type ActivityEvent,
  commandPatterns,
  isRunDue,
  jaccard,
  lastOccurrence,
  mine,
  nextOccurrence,
  normalizeCommand,
  promptPatterns,
  promptTokens,
  sequencePatterns,
} from "./index";

const at = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, d, h, m)).toISOString();
const cmd = (text: string, when: string, projectId = "p1"): ActivityEvent => ({
  at: when,
  kind: "terminal.command",
  text,
  projectId,
});

describe("normalizeCommand", () => {
  it("replaces paths, numbers, hashes, ids, strings and urls", () => {
    expect(normalizeCommand("dotnet test C:\\src\\shop\\Api.Tests --filter Category=Fast")).toBe(
      "dotnet test <path> --filter Category=Fast",
    );
    expect(normalizeCommand("git show 3f2a9c1d")).toBe("git show <hash>");
    expect(normalizeCommand("echo deadbeef cafebabe")).toBe("echo deadbeef cafebabe");
    expect(normalizeCommand('git commit -m "fix the cart"')).toBe("git commit -m <str>");
    expect(normalizeCommand("curl https://api.example.com/v1/orders/42")).toBe("curl <url>");
    expect(normalizeCommand("az pipelines runs show --id 1234")).toBe("az pipelines runs show --id <n>");
    expect(normalizeCommand("kubectl logs pod/web-6f7c --since 10m")).toBe("kubectl logs <path> --since 10m");
    expect(normalizeCommand("npm run build --prefix=apps/web")).toBe("npm run build --prefix=<path>");
    expect(normalizeCommand("cat ./src/app.ts")).toBe("cat <path>");
    expect(normalizeCommand("open 3c2b9f2e-1111-2222-3333-444455556666")).toBe("open <id>");
  });

  it("treats branch arguments as placeholders and collapses repeats", () => {
    expect(normalizeCommand("git checkout feature/pay-123")).toBe("git checkout <branch>");
    expect(normalizeCommand("git switch -c x")).toBe("git switch -c x");
    expect(normalizeCommand("rm a/b/c d/e/f")).toBe("rm <path>…");
  });
});

describe("prompt similarity", () => {
  it("keeps letters outside ASCII in prompt words", () => {
    expect(promptTokens("Åtgärda överföringen!")).toEqual(["åtgärda", "överföringen"]);
  });

  it("tokenizes content words and measures overlap", () => {
    expect(promptTokens("Please write the release notes for this week!")).toEqual([
      "write",
      "release",
      "notes",
      "week",
    ]);
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
});

describe("mining", () => {
  const events: ActivityEvent[] = [
    // Every morning: pull, then restore + run the API.
    ...[20, 21, 22, 23].flatMap((d) => [
      cmd("git pull", at(d, 8, 0)),
      cmd("dotnet restore", at(d, 8, 1)),
      cmd("dotnet run --project src/Api/Api.csproj", at(d, 8, 2)),
    ]),
    // Noise.
    cmd("ls", at(20, 9)),
    cmd("git status", at(21, 9)),
    cmd("echo once", at(22, 9)),
    // A prompt asked in similar words on three days.
    { at: at(20, 16), kind: "prompt", text: "Write the release notes for the shop API" },
    { at: at(21, 16), kind: "prompt", text: "write release notes for shop API changes" },
    { at: at(24, 16), kind: "prompt", text: "Release notes for the shop API please" },
    { at: at(24, 17), kind: "prompt", text: "Why is the build red?" },
  ];

  it("counts command templates across days, ignoring trivial commands", () => {
    const patterns = commandPatterns(events, { count: 4, days: 2 });
    expect(patterns.map((p) => [p.summary, p.count, p.days])).toEqual(
      expect.arrayContaining([
        ["git pull", 4, 4],
        ["dotnet restore", 4, 4],
        ["dotnet run --project <path>", 4, 4],
      ]),
    );
    expect(patterns.some((p) => p.summary === "ls" || p.summary === "git status")).toBe(false);
  });

  it("finds the repeated sequence and keeps the longest", () => {
    const seqs = sequencePatterns(events);
    expect(seqs.map((s) => [s.summary, s.count])).toEqual([
      ["git pull → dotnet restore → dotnet run --project <path>", 4],
    ]);
    expect(seqs[0]?.examples[0]?.text).toContain("git pull  →  dotnet restore");
  });

  it("does not chain commands far apart or in different projects", () => {
    const apart = [
      cmd("a1 x", at(20, 8)),
      cmd("b1 y", at(20, 9)),
      cmd("a1 x", at(21, 8)),
      cmd("b1 y", at(21, 9)),
      cmd("a1 x", at(22, 8)),
      cmd("b1 y", at(22, 9)),
    ];
    expect(sequencePatterns(apart)).toEqual([]);
    const projects = [20, 21, 22].flatMap((d) => [
      cmd("a1 x", at(d, 8), "p1"),
      cmd("b1 y", at(d, 8, 1), "p2"),
    ]);
    expect(sequencePatterns(projects)).toEqual([]);
  });

  it("clusters similar prompts", () => {
    const prompts = promptPatterns(events);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ kind: "prompt", count: 3, days: 3 });
  });

  it("ranks patterns, applies thresholds and blocks", () => {
    const all = mine(events, { minCommand: { count: 4, days: 2 } });
    expect(all[0]?.kind).toBe("sequence");
    expect(all.map((p) => p.kind)).toContain("prompt");
    const blocked = mine(events, { minCommand: { count: 4, days: 2 }, blocked: [all[0]!.key] });
    expect(blocked.some((p) => p.key === all[0]!.key)).toBe(false);
    // Keys are stable.
    expect(mine(events, { minCommand: { count: 4, days: 2 } })[0]?.key).toBe(all[0]?.key);
    expect(mine([], {})).toEqual([]);
  });
});

describe("schedule", () => {
  const monday10 = { enabled: true, day: 1, hour: 10, minute: 0 };

  it("finds the last and next Monday 10:00 (local time)", () => {
    const wed = new Date(2026, 9, 28, 15, 0); // Wednesday
    expect(lastOccurrence(wed, monday10)).toEqual(new Date(2026, 9, 26, 10, 0));
    expect(nextOccurrence(wed, monday10)).toEqual(new Date(2026, 10, 2, 10, 0));
    const mondayEarly = new Date(2026, 9, 26, 9, 0);
    expect(lastOccurrence(mondayEarly, monday10)).toEqual(new Date(2026, 9, 19, 10, 0));
    expect(lastOccurrence(new Date(2026, 9, 26, 10, 0), monday10)).toEqual(new Date(2026, 9, 26, 10, 0));
  });

  it("catches up a missed run at launch", () => {
    const wed = new Date(2026, 9, 28, 15, 0);
    expect(isRunDue(wed, monday10, undefined)).toBe(true);
    expect(isRunDue(wed, monday10, new Date(2026, 9, 20).toISOString())).toBe(true);
    expect(isRunDue(wed, monday10, new Date(2026, 9, 26, 11).toISOString())).toBe(false);
    expect(isRunDue(wed, { ...monday10, enabled: false }, undefined)).toBe(false);
  });
});
