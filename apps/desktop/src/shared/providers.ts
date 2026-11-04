/**
 * AI providers for Jig's non-chat features (D-294): one-shot text-in/text-out calls run on Claude Code
 * or on OpenAI's Codex CLI signed in with the user's ChatGPT account. Chats pick their engine
 * separately (`ChatProvider`, D-309).
 * Documented in docs/reference/engine.md → Providers.
 */
import type { ModelInfo } from "./engine";

export const AI_PROVIDERS = ["claude", "chatgpt"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT (Codex)",
};

/**
 * ChatGPT models when the Codex CLI can't list its own (`codex debug models`). Keep it short and
 * current: the list Codex reports wins whenever it answers.
 */
export const CHATGPT_FALLBACK_MODELS: ModelInfo[] = [
  { value: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", description: "Codex's workhorse model." },
  { value: "gpt-6.1-terra", displayName: "GPT-6.1 Terra", description: "Faster, lighter answers." },
  { value: "gpt-6-luna", displayName: "GPT-6-Luna", description: "Fastest and cheapest." },
];

/** Whether a provider can answer now (Settings → AI features disables ChatGPT when it can't). */
export interface ProviderStatus {
  provider: AiProvider;
  ready: boolean;
  /** In words: "Signed in with your ChatGPT account.", "The Codex CLI isn't installed." */
  detail: string;
}
