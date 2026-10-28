import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Suggestion } from "../../shared/learning";
import { ActivityLog, isExcluded, localDay } from "./activity";
import { parseReflection, reflectionPrompt } from "./reflect";
import { LearningService } from "./service";

let dir: string;
let settings: { recording: boolean; exclusions: string[]; retentionDays: number };
let prompts: string[];
let reply: string;
let built: Suggestion[];

function setup() {
  const activity = new ActivityLog(join(dir, "activity"), () => settings);
  const service = new LearningService({
    file: join(dir, "suggestions.json"),
    activity,
    schedule: () => ({ enabled: true, day: 1, hour: 10, minute: 0 }),
    recording: () => settings.recording,
    catalog: () => "- git — Git",
    reflect: async (prompt) => {
      prompts.push(prompt);
      return reply;
    },
    build: async (s) => {
      built.push(s);
      return "b1";
    },
    onChange: () => {},
  });
  return { activity, service };
}

const day = (d: number, h = 9) => new Date(2026, 9, d, h, 0);

async function recordMornings(activity: ActivityLog) {
  for (const d of [19, 20, 21, 22, 23]) {
    await activity.record({ kind: "terminal.command", text: "git pull", projectId: "p" }, day(d, 8));
    await activity.record(
      { kind: "terminal.command", text: "npm run dev", projectId: "p" },
      new Date(2026, 9, d, 8, 1),
    );
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jig-learning-"));
  process.env.JIG_HOME = dir;
  settings = { recording: true, exclusions: [], retentionDays: 90 };
  prompts = [];
  built = [];
  reply = "";
});

describe("ActivityLog", () => {
  it("appends one JSON line per event to the day's file and reads them back", async () => {
    const { activity } = setup();
    expect(await activity.record({ kind: "prompt", text: "hello" }, day(20))).toBe(true);
    await activity.record({ kind: "git", text: "git commit" }, day(21));
    const text = await readFile(join(dir, "activity", `${localDay(day(20))}.jsonl`), "utf8");
    expect(JSON.parse(text.trim())).toMatchObject({ kind: "prompt", text: "hello" });
    expect((await activity.read(30, day(22))).map((e) => e.text)).toEqual(["hello", "git commit"]);
    expect((await activity.read(1, day(22))).map((e) => e.text)).toEqual(["git commit"]);
    expect(await activity.stats()).toMatchObject({ days: 2, events: 2 });
  });

  it("respects pause and exclusions, prunes and clears", async () => {
    const { activity } = setup();
    settings.recording = false;
    expect(await activity.record({ kind: "prompt", text: "x" }, day(20))).toBe(false);
    settings = { recording: true, exclusions: ["Contoso"], retentionDays: 7 };
    expect(await activity.record({ kind: "prompt", text: "the contoso invoice" }, day(20))).toBe(false);
    expect(isExcluded({ kind: "git", text: "x", detail: { repo: "CONTOSO-api" } }, ["contoso"])).toBe(true);
    await activity.record({ kind: "prompt", text: "old" }, day(1));
    await activity.record({ kind: "prompt", text: "new" }, day(20));
    expect(await activity.prune(day(20))).toBe(1);
    expect((await activity.read(60, day(20))).map((e) => e.text)).toEqual(["new"]);
    await activity.clear();
    expect(await activity.stats()).toMatchObject({ days: 0, events: 0 });
  });
});

describe("ActivityLog sanitizing", () => {
  it("keeps a message's pastes only as their kind and masks secrets in every event", async () => {
    const { activity } = setup();
    const message = [
      "Login fails with this response:",
      "HTTP/1.1 401 Unauthorized",
      "Content-Type: application/json",
      "WWW-Authenticate: Bearer",
      "Set-Cookie: session=abcdef123456",
      "X-Request-Id: 7",
      "Date: Tue, 28 Oct 2026",
    ].join("\n");
    await activity.record({ kind: "prompt", text: message }, day(20));
    await activity.record(
      { kind: "session.tool", text: 'curl -H "Authorization: Bearer abcdefgh12345678" https://api/x' },
      day(20),
    );
    await activity.record(
      { kind: "terminal.command", text: "export API_KEY=sk-abcdefghijklmnop1234" },
      day(20),
    );
    const raw = await readFile(join(dir, "activity", `${localDay(day(20))}.jsonl`), "utf8");
    expect(raw).not.toContain("abcdef123456");
    expect(raw).not.toContain("abcdefgh12345678");
    expect(raw).not.toContain("sk-abcdefghijklmnop1234");
    const [prompt, tool, terminal] = await activity.read(30, day(21));
    expect(prompt).toMatchObject({
      text: "Login fails with this response:\n[pasted http, 6 lines]",
      detail: { pasted: "http:1" },
    });
    expect(tool!.text).toBe('curl -H "Authorization: «secret»" https://api/x');
    expect(terminal!.text).toBe("export API_KEY=«secret»");
  });
});

describe("reflection", () => {
  const pattern = {
    key: "c-1",
    kind: "command" as const,
    summary: "git pull",
    count: 5,
    days: 5,
    projects: 1,
    examples: [],
    score: 5,
  };

  it("builds a prompt with keys, evidence, catalog and past answers", () => {
    const prompt = reflectionPrompt([pattern], "- git — Git", [{ title: "Old idea", status: "never" }]);
    expect(prompt).toContain('key: c-1 | command | "git pull" | 5 times on 5 day(s)');
    expect(prompt).toContain("- Old idea: never");
  });

  it("parses at most 3 valid suggestions and keeps only known pattern keys", () => {
    const text = `Here you go:\n{"suggestions":[{"title":"Morning start","why":"5 days in a row","goal":"A button that pulls and starts dev","level":2,"kind":"new-addon","minutesPerWeek":10,"patternKeys":["c-1","nope"]}]}`;
    const [s] = parseReflection(text, [pattern]);
    expect(s).toMatchObject({ title: "Morning start", patternKeys: ["c-1"], status: "new", level: 2 });
    expect(s?.evidence[0]?.summary).toBe("git pull");
    expect(() => parseReflection("no json", [pattern])).toThrow("no JSON");
    expect(() => parseReflection('{"suggestions":[{"title":"x"}]}', [pattern])).toThrow("format");
    const four = JSON.stringify({
      suggestions: Array(4).fill({ title: "abc", why: "abc", goal: "abc", level: 1, kind: "layout" }),
    });
    expect(() => parseReflection(four, [pattern])).toThrow();
  });
});

describe("LearningService", () => {
  it("makes no AI call when nothing repeats enough", async () => {
    const { activity, service } = setup();
    await activity.record({ kind: "terminal.command", text: "echo once" }, new Date());
    const run = await service.run("manual");
    expect(run).toMatchObject({
      ok: true,
      patterns: 0,
      suggestions: 0,
      note: "Nothing repeats often enough yet.",
    });
    expect(prompts).toEqual([]);
  });

  it("mines, reflects, and fills the inbox; answers are remembered", async () => {
    const { activity, service } = setup();
    await recordMornings(activity);
    const state0 = await service.state();
    expect(state0.stats.events).toBe(10);
    reply = "";
    // Use the real pattern key from the prompt.
    const realReflect = async () => {
      const key = /key: (\S+) \| sequence/.exec(prompts[0] ?? "")?.[1] ?? "x";
      return JSON.stringify({
        suggestions: [
          {
            title: "Start the morning",
            why: "pull + dev on 5 days",
            goal: "A button that runs git pull then npm run dev",
            level: 2,
            kind: "new-addon",
            patternKeys: [key],
          },
        ],
      });
    };
    (service as unknown as { options: { reflect: (p: string) => Promise<string> } }).options.reflect = async (
      p,
    ) => {
      prompts.push(p);
      return realReflect();
    };
    const run = await service.run("manual", day(24));
    expect(run).toMatchObject({ ok: true, suggestions: 1 });
    expect(prompts[0]).toContain("git pull → npm run dev");
    const [s] = (await service.state(day(24))).suggestions;
    expect(s).toMatchObject({ title: "Start the morning", status: "new" });
    expect(await service.newCount()).toBe(1);

    await service.answer(s!.id, "snooze", day(24));
    expect((await service.state(day(25))).suggestions[0]?.status).toBe("snoozed");
    expect((await service.state(day(40))).suggestions[0]?.status).toBe("new");

    await service.answer(s!.id, "build", day(40));
    expect(built[0]?.goal).toContain("git pull then npm run dev");
    expect((await service.state(day(40))).suggestions[0]).toMatchObject({ status: "built", buildId: "b1" });

    // The same pattern isn't suggested again.
    prompts = [];
    const again = await service.run("manual", day(24));
    expect(again.patterns).toBeLessThan(run.patterns);
  });

  it("Never blocks the patterns for good", async () => {
    const { activity, service } = setup();
    await recordMornings(activity);
    (service as unknown as { options: { reflect: (p: string) => Promise<string> } }).options.reflect = async (
      p,
    ) => {
      const keys = [...p.matchAll(/key: (\S+)/g)].map((m) => m[1]);
      return JSON.stringify({
        suggestions: [
          {
            title: "Everything",
            why: "all of it",
            goal: "do it",
            level: 2,
            kind: "new-addon",
            patternKeys: keys,
          },
        ],
      });
    };
    await service.run("manual", day(24));
    const [s] = (await service.state()).suggestions;
    await service.answer(s!.id, "never");
    const run = await service.run("manual", day(24));
    expect(run.patterns).toBe(0);
  });

  it("records failed reflections", async () => {
    const { activity, service } = setup();
    await recordMornings(activity);
    reply = "not json";
    const run = await service.run("manual", day(24));
    expect(run).toMatchObject({ ok: false, error: "The reply had no JSON" });
    expect((await service.state()).runs[0]?.ok).toBe(false);
  });
});
