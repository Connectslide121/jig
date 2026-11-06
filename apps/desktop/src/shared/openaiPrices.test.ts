import { describe, expect, it } from "vitest";
import {
  CHATGPT_COST_NOTE,
  CHATGPT_NO_PRICE_NOTE,
  costNote,
  LONG_CONTEXT_TOKENS,
  OPENAI_PRICES,
  openAiCost,
  openAiPrice,
} from "./openaiPrices";

const usage = (inputTokens: number, cacheReadTokens: number, outputTokens: number) => ({
  inputTokens,
  cacheReadTokens,
  outputTokens,
  cacheWriteTokens: 0,
});

describe("OpenAI API prices (D-414)", () => {
  it("prices input, cache reads and output each at their own rate", () => {
    // gpt-6.1-sol: $2 input, $0.10 cached input, $10 output per 1M tokens.
    expect(openAiCost("gpt-6.1-sol", usage(1_000_000, 0, 0))).toBeCloseTo(2, 9);
    expect(openAiCost("gpt-6.1-sol", usage(0, 1_000_000, 0))).toBeCloseTo(0.1, 9);
    expect(openAiCost("gpt-6.1-sol", usage(0, 0, 1_000_000))).toBeCloseTo(10, 9);
    expect(openAiCost("gpt-6.1-sol", usage(500, 1500, 20))).toBeCloseTo(
      (500 * 2 + 1500 * 0.1 + 20 * 10) / 1e6,
      12,
    );
  });

  it("uses the long-context rate only for a request over 272K input tokens", () => {
    const u = usage(1000, 0, 0);
    expect(openAiCost("gpt-6-luna", u, LONG_CONTEXT_TOKENS)).toBeCloseTo((1000 * 0.1) / 1e6, 12);
    expect(openAiCost("gpt-6-luna", u, LONG_CONTEXT_TOKENS + 1)).toBeCloseTo((1000 * 0.2) / 1e6, 12);
  });

  it("has no cost for a model without a known price, and finds slugs case-insensitively", () => {
    expect(openAiCost("gpt-reserve", usage(1000, 0, 10))).toBeUndefined();
    expect(openAiCost("sol", usage(1000, 0, 10))).toBeUndefined();
    expect(openAiCost(undefined, usage(1000, 0, 10))).toBeUndefined();
    expect(openAiPrice("GPT-6.1-Sol")).toBe(OPENAI_PRICES["gpt-6.1-sol"]);
  });

  it("every price is a positive number, cached below input, long above short", () => {
    for (const { short, long } of Object.values(OPENAI_PRICES)) {
      for (const rate of [short, long]) {
        expect(rate.cachedInput).toBeGreaterThan(0);
        expect(rate.cachedInput).toBeLessThan(rate.input);
        expect(rate.output).toBeGreaterThan(rate.input);
      }
      expect(long.input).toBeGreaterThan(short.input);
    }
  });

  it("explains an estimate or a missing price in the cost's tooltip", () => {
    expect(costNote({})).toBeUndefined();
    expect(costNote({ costEstimated: true })).toBe(CHATGPT_COST_NOTE);
    expect(costNote({ costEstimated: true, costUnpriced: true })).toBe(CHATGPT_NO_PRICE_NOTE);
  });
});
