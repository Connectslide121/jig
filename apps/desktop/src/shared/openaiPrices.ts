/**
 * OpenAI API prices of the models ChatGPT chats run on, to estimate what a Codex turn would cost at
 * API prices (D-414). A ChatGPT plan isn't billed per token: this is an estimate to compare with
 * Claude's cost, never a bill. A model missing here has no cost (shown as "—"), never a guess.
 *
 * Source: https://developers.openai.com/api/docs/pricing → Flagship models, Standard pricing, read
 * 2026-11-06. USD per 1M tokens. "Short context: ≤272K input tokens. Long context: >272K input
 * tokens." gpt-5.6-sol's price is promotional until 2026-11-30 (the page doesn't say what follows).
 * Update this list when OpenAI changes it or Codex lists a new model.
 */
import type { Usage } from "./engine";

export interface OpenAiPrice {
  /** Input tokens not read from the cache. */
  input: number;
  /** Input tokens read from the cache. */
  cachedInput: number;
  /** Output tokens (reasoning included: Codex's output count already holds it). */
  output: number;
}

export interface OpenAiModelPrice {
  short: OpenAiPrice;
  /** For a request with more than `LONG_CONTEXT_TOKENS` input tokens. */
  long: OpenAiPrice;
}

/** A request with more input tokens than this is priced at the long-context rate. */
export const LONG_CONTEXT_TOKENS = 272_000;

const p = (input: number, cachedInput: number, output: number): OpenAiPrice => ({
  input,
  cachedInput,
  output,
});

export const OPENAI_PRICES: Record<string, OpenAiModelPrice> = {
  "gpt-6.1-sol": { short: p(2, 0.1, 10), long: p(4, 0.2, 15) },
  "gpt-6-astra": { short: p(10, 1, 50), long: p(20, 2, 75) },
  "gpt-6.1-terra": { short: p(1, 0.05, 5), long: p(2, 0.1, 7.5) },
  "gpt-6-sol": { short: p(2, 0.2, 10), long: p(4, 0.4, 15) },
  "gpt-6-luna": { short: p(0.1, 0.01, 0.5), long: p(0.2, 0.02, 0.75) },
  "gpt-5.6-sol": { short: p(4, 0.4, 20), long: p(8, 0.8, 30) },
  "gpt-5.6-terra": { short: p(2, 0.2, 12), long: p(4, 0.4, 18) },
  "gpt-5.6-luna": { short: p(0.2, 0.02, 1.2), long: p(0.4, 0.04, 1.8) },
};

/** A model's API price, by its exact slug (case-insensitive); undefined when OpenAI publishes none here. */
export function openAiPrice(model: string | undefined): OpenAiModelPrice | undefined {
  return model ? OPENAI_PRICES[model.trim().toLowerCase()] : undefined;
}

/**
 * What tokens cost at a model's API price, in USD, or undefined for a model without a known price.
 * `usage` is Jig's: `inputTokens` without the cache reads, which are `cacheReadTokens` (cache writes
 * are part of the input and priced as input). `requestInput` is one request's whole input, which picks
 * the short- or long-context rate.
 */
export function openAiCost(model: string | undefined, usage: Usage, requestInput = 0): number | undefined {
  const price = openAiPrice(model);
  if (!price) return undefined;
  const rate = requestInput > LONG_CONTEXT_TOKENS ? price.long : price.short;
  return (
    (usage.inputTokens * rate.input +
      usage.cacheReadTokens * rate.cachedInput +
      usage.outputTokens * rate.output) /
    1_000_000
  );
}

/** Why a ChatGPT chat shows no cost, or what its cost is: for tooltips where cost is shown. */
export const CHATGPT_COST_NOTE = "Estimated at OpenAI API prices; your ChatGPT plan isn't billed per token.";
export const CHATGPT_NO_PRICE_NOTE = "No cost: OpenAI publishes no API price Jig knows for this model.";

/** The tooltip for a chat's or a turn's cost: why ChatGPT's is an estimate, or why it has none. */
export function costNote(c: { costEstimated?: boolean; costUnpriced?: boolean }): string | undefined {
  return c.costUnpriced ? CHATGPT_NO_PRICE_NOTE : c.costEstimated ? CHATGPT_COST_NOTE : undefined;
}
