import { describe, expect, it } from "vitest";
import {
  analyze,
  categorize,
  concurrency,
  crowd,
  emptyTotals,
  type Item,
  merge,
  shellCategory,
  shortName,
  sweep,
} from "./analyze";

const T0 = Date.parse("2026-01-05T10:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

describe("categorize", () => {
  it("counts Jig's browser tools, other browser MCPs and the jig-tester subagent as browser checks", () => {
    expect(categorize("mcp__jig__jig_browser_click")).toBe("browser");
    expect(categorize("mcp__jig__jig_browser_screenshot")).toBe("browser");
    expect(categorize("mcp__jig__jig_test_page")).toBe("browser");
    expect(categorize("mcp__playwright__browser_navigate")).toBe("browser");
    expect(categorize("mcp__Claude_Browser__computer")).toBe("browser");
    expect(categorize("Agent", { subagent_type: "jig-tester", prompt: "check the page" })).toBe("browser");
    expect(categorize("Agent", { subagent_type: "jig-search" })).toBe("subagents");
    expect(categorize("Task", {})).toBe("subagents");
  });

  it("counts the Tests add-on's run and wait as tests, its list as another tool", () => {
    expect(categorize("mcp__jig__addon_tests_run", { suite: "npm:e2e:changed" })).toBe("tests");
    expect(categorize("mcp__jig__addon_tests_wait", { id: "r1" })).toBe("tests");
    expect(categorize("addon_tests_run")).toBe("tests");
    expect(categorize("mcp__jig__addon_tests_list")).toBe("tools");
  });

  it("puts questions and plans under waiting, everything else under tools", () => {
    expect(categorize("AskUserQuestion")).toBe("waiting");
    expect(categorize("ExitPlanMode")).toBe("waiting");
    expect(categorize("Read", { file_path: "src/a.test.ts" })).toBe("tools");
    expect(categorize("mcp__jig__addon_boards_update")).toBe("tools");
  });

  it("sorts shell commands into tests & builds, browser scripts and other shell", () => {
    expect(categorize("Bash", { command: "npm run verify 2>&1 | tail -5" })).toBe("tests");
    expect(categorize("PowerShell", { command: "npm run verify; if ($?) { git commit -m x }" })).toBe(
      "tests",
    );
    expect(categorize("mcp__jig__jig_terminal_run", { command: "npx vitest run" })).toBe("tests");
    expect(categorize("Bash", { command: "git status --short" })).toBe("shell");
  });
});

describe("shellCategory", () => {
  it.each([
    ["npx playwright test e2e/chat.spec.ts", "tests"],
    ["cd apps/web && npm run e2e:changed > ../e2e.log 2>&1", "tests"],
    ["CI=1 npx vitest run addons/tasks", "tests"],
    ["timeout 600 npm test", "tests"],
    ["dotnet test tests/Shop.Tests", "tests"],
    ["npx tsc -p tsconfig.json --noEmit", "tests"],
    ["npm run build > .tmp/build.log 2>&1", "tests"],
    ["node scripts/run-tests.mjs", "tests"],
    ["until grep -q passed /tmp/e2e.log; do sleep 15; done", "tests"],
    ["PW_CHANNEL=chrome node .tmp/check.mjs", "browser"],
    ["node .tmp/browser-check.mjs http://localhost:5173", "browser"],
    // Paths that only mention tests aren't test runs.
    ["rm e2e/zz-align.spec.ts e2e/zz-metrics.spec.ts", "shell"],
    ["cat addons/tasks/lib/tasks.test.ts | head", "shell"],
    ["grep -rn browser.ts src", "shell"],
    ["git commit -m 'Tests: faster e2e'", "shell"],
    ["npm install", "shell"],
    ["npm run dev", "shell"],
  ])("%s → %s", (command, expected) => {
    expect(shellCategory(command)).toBe(expected);
  });

  it("ignores what a heredoc writes", () => {
    const command =
      "python - <<'EOF'\nimport subprocess\nsubprocess.run(['npx', 'vitest'])\nnpm test\nEOF\necho done";
    expect(shellCategory(command)).toBe("shell");
  });
});

describe("shortName", () => {
  it("drops the MCP server and jig/addon prefixes", () => {
    expect(shortName("mcp__jig__jig_browser_click")).toBe("browser_click");
    expect(shortName("mcp__jig__addon_tests_run")).toBe("tests_run");
    expect(shortName("Bash")).toBe("Bash");
  });
});

function tool(
  id: string,
  s: number,
  name: string,
  input: Record<string, unknown> = {},
  extra: Partial<Item> = {},
): Item {
  return { kind: "tool", id, at: at(s), name, input, ...extra };
}
function result(s: number, durationS: number): Item {
  return { kind: "result", id: `r${s}`, at: at(s), durationMs: durationS * 1000 };
}
const meta = { id: "c1", title: "Shop", projectId: "p1", updatedAt: at(0) };

describe("analyze", () => {
  it("counts parallel calls once, for the category that ranks first, and the rest as model time", () => {
    // Turn 0-100 s. A test run 10-60 s and a file read 20-30 s and a shell command 50-70 s in parallel.
    const items = [
      tool("t1", 10, "Bash", { command: "npm test" }),
      tool("t2", 20, "Read", { file_path: "a.ts" }),
      tool("t3", 50, "Bash", { command: "git log" }),
      result(100, 100),
    ];
    const ends = new Map([
      ["t1", T0 + 60_000],
      ["t2", T0 + 30_000],
      ["t3", T0 + 70_000],
    ]);
    const a = analyze({ meta, items }, ends);
    expect(a.turns).toHaveLength(1);
    const t = a.turns[0]?.totals ?? emptyTotals();
    expect(t.tests).toBe(50_000);
    expect(t.tools).toBe(0);
    expect(t.shell).toBe(10_000);
    expect(t.model).toBe(40_000);
    expect(Object.values(t).reduce((s, v) => s + v, 0)).toBe(100_000);
    expect(a.calls.map((c) => c.ms)).toEqual([50_000, 10_000, 20_000]);
  });

  it("never counts more than the turn: a background command's call ends early, a call outliving the turn is cut", () => {
    const items = [
      // run_in_background: the tool result comes back at once while the command keeps running.
      tool(
        "bg",
        0,
        "Bash",
        { command: "npm run e2e", run_in_background: true },
        { output: "Command running in background with ID: b1x. Output…" },
      ),
      tool("hang", 30, "Bash", { command: "sleep 1000" }),
      result(60, 60),
    ];
    const ends = new Map([
      ["bg", T0 + 1000],
      ["hang", T0 + 500_000],
    ]);
    const a = analyze({ meta, items }, ends);
    const t = a.turns[0]?.totals ?? emptyTotals();
    expect(t.tests).toBe(1000);
    expect(t.shell).toBe(30_000);
    expect(t.model).toBe(29_000);
  });

  it("gives a wait on a background command that command's category", () => {
    const items = [
      tool(
        "bg",
        0,
        "Bash",
        { command: "npx playwright test", run_in_background: true },
        { output: "Command running in background with ID: b2y." },
      ),
      tool("wait", 5, "TaskOutput", { task_id: "b2y", block: true }),
      result(100, 100),
    ];
    const ends = new Map([
      ["bg", T0 + 1000],
      ["wait", T0 + 95_000],
    ]);
    const a = analyze({ meta, items }, ends);
    expect(a.calls.find((c) => c.id === "wait")?.category).toBe("tests");
    expect(a.turns[0]?.totals.tests).toBe(91_000);
  });

  it("leaves a subagent's own calls inside its Agent call", () => {
    const items = [
      tool("ag", 0, "Agent", { subagent_type: "jig-tester", prompt: "check" }),
      tool("in", 5, "mcp__jig__jig_browser_click", {}, { parentId: "ag" }),
      result(60, 60),
    ];
    const a = analyze(
      { meta, items },
      new Map([
        ["ag", T0 + 50_000],
        ["in", T0 + 10_000],
      ]),
    );
    expect(a.calls.map((c) => c.id)).toEqual(["ag"]);
    expect(a.turns[0]?.totals.browser).toBe(50_000);
  });

  it("estimates an end from the chat's next step when there is no transcript time", () => {
    const items = [
      tool("t1", 0, "Bash", { command: "ls" }),
      tool("t2", 1, "Read", {}), // same burst: not the end of t1
      { kind: "assistant", id: "a", at: at(20) },
      result(30, 30),
    ];
    const a = analyze({ meta, items }, new Map());
    expect(a.calls[0]).toMatchObject({ id: "t1", ms: 20_000, estimated: true });
  });

  it("counts a call that showed an approval prompt as waiting", () => {
    const items = [
      tool("t1", 0, "Bash", { command: "npm test" }),
      { kind: "permission", id: "p", at: at(1), request: { requestId: "t1" } },
      result(40, 40),
    ];
    const a = analyze({ meta, items }, new Map([["t1", T0 + 30_000]]));
    expect(a.turns[0]?.totals.waiting).toBe(30_000);
    expect(a.turns[0]?.start).toBe(T0);
  });
});

describe("sweep", () => {
  it("ranks waiting over tests over browser over subagents over shell over tools", () => {
    const t = sweep([
      { category: "tools", start: 0, end: 10 },
      { category: "browser", start: 0, end: 5 },
      { category: "waiting", start: 2, end: 3 },
    ]);
    expect(t).toMatchObject({ waiting: 1, browser: 4, tools: 5 });
  });
});

describe("merge", () => {
  it("joins overlapping and touching intervals", () => {
    expect(
      merge([
        { start: 5, end: 8 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 7, end: 9 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 9 },
    ]);
  });
});

describe("concurrency", () => {
  it("counts other chats working at the same time, also ones outside the scope", () => {
    const { perChat, perBucket } = concurrency([
      { id: "a", intervals: [{ start: 0, end: 100 }], inScope: true },
      { id: "b", intervals: [{ start: 50, end: 150 }], inScope: true },
      { id: "x", intervals: [{ start: 0, end: 25 }], inScope: false },
    ]);
    const a = perChat.get("a");
    // a: 0-25 with x (1 other), 25-50 alone, 50-100 with b (1 other).
    expect(a).toMatchObject({ ownMs: 100, othersMs: 75, sharedMs: 75, peak: 1 });
    expect(crowd(a!)).toBeCloseTo(0.75);
    expect(perChat.get("b")).toMatchObject({ ownMs: 100, othersMs: 50, sharedMs: 50, peak: 1 });
    expect(perChat.has("x")).toBe(false);
    // In-scope chats: 200 ms of work in 150 ms of wall clock.
    expect(perBucket.get("")).toMatchObject({ ownMs: 200, othersMs: 125, wallMs: 150, peak: 1 });
  });

  it("splits buckets at the cuts and doesn't count a chat's own overlapping turns twice", () => {
    const { perChat, perBucket } = concurrency(
      [
        {
          id: "a",
          intervals: [
            { start: 0, end: 60 },
            { start: 40, end: 120 },
          ],
          inScope: true,
        },
        { id: "b", intervals: [{ start: 90, end: 110 }], inScope: true },
      ],
      [0, 100],
      (t) => (t < 100 ? "day1" : "day2"),
    );
    expect(perChat.get("a")).toMatchObject({ ownMs: 120, othersMs: 20, peak: 1 });
    expect(perBucket.get("day1")).toMatchObject({ ownMs: 110, othersMs: 20, wallMs: 100 });
    expect(perBucket.get("day2")).toMatchObject({ ownMs: 30, othersMs: 20, wallMs: 20 });
  });

  it("reports 0 for a chat that ran alone", () => {
    const { perChat } = concurrency([{ id: "a", intervals: [{ start: 0, end: 10 }], inScope: true }]);
    expect(crowd(perChat.get("a")!)).toBe(0);
  });
});
