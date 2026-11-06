import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingCaption } from "../../shared/meetings";
import type { Completer } from "../engine/types";

const hoisted = vi.hoisted(() => ({
  provider: "chatgpt" as "claude" | "chatgpt",
  completers: [] as Array<{ asks: string[]; closed: boolean; fail?: Error }>,
  execs: [] as string[],
  makeCount: 0,
  nextFail: undefined as Error | undefined,
}));

const answer = (prompt: string) =>
  [...prompt.matchAll(/<caption n="(\d+)">\n([\s\S]*?)\n<\/caption>/g)]
    .map((m) => `<t n="${m[1]}">T ${m[2]}</t>`)
    .join("\n");

vi.mock("../config", () => ({
  getConfig: () => ({ engine: { allowApiKey: false, claudePath: "", codexPath: "" } }),
}));
vi.mock("../../shared/aiFeatures", () => ({
  aiChoice: () => ({ provider: hoisted.provider, model: "luna" }),
}));
vi.mock("../log", () => ({ logger: () => ({ warn: () => {}, info: () => {}, error: () => {} }) }));
vi.mock("../providers", () => ({
  resolveCodexModel: async (choice: string) => ({ model: `${choice}-1` }),
  oneShot: async (_provider: string, _model: string, prompt: string) => {
    hoisted.execs.push(prompt);
    return answer(prompt);
  },
}));
vi.mock("../engine", () => ({
  getEngine: () => ({
    completer: (): Completer => {
      const state = { asks: [] as string[], closed: false, fail: hoisted.nextFail };
      hoisted.nextFail = undefined;
      hoisted.completers.push(state);
      hoisted.makeCount++;
      return {
        ask: async (prompt: string) => {
          state.asks.push(prompt);
          if (state.fail) throw state.fail;
          return answer(prompt);
        },
        close: () => {
          state.closed = true;
        },
      };
    },
  }),
}));

import { CaptionTranslator, type TranslatedCaption } from "./translate";

const caption = (id: string, text: string): MeetingCaption => ({ id, text }) as MeetingCaption;

function setup() {
  const done: TranslatedCaption[] = [];
  const untranslated: Array<[string[], string]> = [];
  const failures: unknown[] = [];
  const translator = new CaptionTranslator({
    translated: async (r) => void done.push(r),
    untranslated: async (c, why) => void untranslated.push([c.map((x) => x.captionId), why]),
    failed: (e) => void failures.push(e),
  });
  const settle = () => new Promise((r) => setTimeout(r, 20));
  return { translator, done, untranslated, failures, settle };
}

beforeEach(() => {
  hoisted.provider = "chatgpt";
  hoisted.completers.length = 0;
  hoisted.execs.length = 0;
  hoisted.makeCount = 0;
  hoisted.nextFail = undefined;
});

describe("CaptionTranslator with ChatGPT", () => {
  it("keeps one warm Codex process for every batch and never runs codex exec", async () => {
    const t = setup();
    t.translator.translate("m", caption("1", "hello"), "sv-se");
    await t.settle();
    t.translator.translate("m", caption("2", "world"), "sv-se");
    await t.settle();
    expect(t.done.map((d) => d.text)).toEqual(["T hello", "T world"]);
    expect(hoisted.makeCount).toBe(1);
    expect(hoisted.completers[0]!.asks).toHaveLength(2);
    expect(hoisted.execs).toHaveLength(0);
  });

  it("batches captions that wait together into one warm ask", async () => {
    const t = setup();
    t.translator.translate("m", caption("1", "one"), "sv-se");
    t.translator.translate("m", caption("2", "two"), "sv-se");
    t.translator.translate("m", caption("3", "three"), "sv-se");
    await t.settle();
    expect(t.done.map((d) => d.captionId)).toEqual(["1", "2", "3"]);
    const asked = hoisted.completers[0]!.asks;
    expect(asked.length).toBeLessThanOrEqual(2);
    expect(asked.join("")).toContain('<caption n="1">');
  });

  it("retries a batch with codex exec when the warm process fails, then skips the warm one for a while", async () => {
    hoisted.nextFail = new Error("Codex stopped");
    const t = setup();
    t.translator.translate("m", caption("1", "hello"), "sv-se");
    await t.settle();
    expect(t.done.map((d) => d.text)).toEqual(["T hello"]);
    expect(hoisted.execs).toHaveLength(1);
    expect(hoisted.completers[0]!.closed).toBe(true);
    expect(t.failures).toHaveLength(0);
    expect(t.untranslated).toEqual([]);

    t.translator.translate("m", caption("2", "again"), "sv-se");
    await t.settle();
    expect(hoisted.execs).toHaveLength(2);
    expect(hoisted.makeCount).toBe(1);
  });

  it("uses the warm process again after the retry pause", async () => {
    hoisted.nextFail = new Error("Codex stopped");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = setup();
      t.translator.translate("m", caption("1", "a"), "sv-se");
      await vi.waitFor(() => expect(t.done).toHaveLength(1));
      vi.setSystemTime(Date.now() + 61_000);
      t.translator.translate("m", caption("2", "b"), "sv-se");
      await vi.waitFor(() => expect(t.done).toHaveLength(2));
      expect(hoisted.makeCount).toBe(2);
      expect(hoisted.completers[1]!.asks).toHaveLength(1);
      expect(hoisted.execs).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports Not translated when the exec fallback fails too", async () => {
    hoisted.nextFail = new Error("Codex stopped");
    const providers = await import("../providers");
    const spy = vi.spyOn(providers, "oneShot").mockRejectedValueOnce(new Error("exec failed"));
    const t = setup();
    t.translator.translate("m", caption("1", "hello"), "sv-se");
    await t.settle();
    expect(t.untranslated).toEqual([[["1"], "failed"]]);
    expect(t.failures).toHaveLength(1);
    spy.mockRestore();
  });

  it("stop() closes the warm process", async () => {
    const t = setup();
    t.translator.translate("m", caption("1", "hello"), "sv-se");
    await t.settle();
    t.translator.stop();
    expect(hoisted.completers[0]!.closed).toBe(true);
    t.translator.translate("m", caption("2", "next"), "sv-se");
    await t.settle();
    expect(hoisted.makeCount).toBe(2);
  });
});

describe("CaptionTranslator with Claude", () => {
  it("still uses its own warm completer", async () => {
    hoisted.provider = "claude";
    const t = setup();
    t.translator.translate("m", caption("1", "hello"), "sv-se");
    await t.settle();
    expect(t.done).toHaveLength(1);
    expect(hoisted.execs).toHaveLength(0);
  });
});
