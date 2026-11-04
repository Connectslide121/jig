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

/**
 * ChatGPT's model families (D-310), like Claude's opus/sonnet/haiku: Jig stores the family and each
 * call uses its newest version. Codex itself only takes exact slugs (`gpt-6.1-sol`), so Jig translates.
 */
export const CHATGPT_FAMILIES = ["sol", "terra", "luna"] as const;
export type ChatGptFamily = (typeof CHATGPT_FAMILIES)[number];

export const CHATGPT_FAMILY_LABELS: Record<ChatGptFamily, string> = {
  sol: "Sol",
  terra: "Terra",
  luna: "Luna",
};

/** A versioned ChatGPT slug's parts: `gpt-6.1-sol` → version [6, 1], family `sol`. Others: undefined. */
export function parseChatGptSlug(slug: string): { version: number[]; family: string } | undefined {
  const m = /^gpt-(\d+(?:\.\d+)*)-([a-z]+)$/i.exec(slug.trim());
  if (!m) return undefined;
  return { version: m[1]!.split(".").map(Number), family: m[2]!.toLowerCase() };
}

/** Compares versions part by part as numbers (6.1 > 6, 6.10 > 6.9); a missing part counts as 0. */
export function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** A family alias is one word without digits or dashes (`sol`, `Terra`); anything else is a slug. */
const isFamilyAlias = (model: string) => /^[a-z]+$/i.test(model);

/** The newest model of a family in a list (versions compared as numbers), or undefined. */
export function newestOfFamily(family: string, models: readonly ModelInfo[]): ModelInfo | undefined {
  let best: { model: ModelInfo; version: number[] } | undefined;
  for (const model of models) {
    const slug = parseChatGptSlug(model.value);
    if (slug?.family !== family.toLowerCase()) continue;
    if (!best || compareVersions(slug.version, best.version) > 0) best = { model, version: slug.version };
  }
  return best?.model;
}

export interface ResolvedChatGptModel {
  /** What to pass to Codex's `--model`; "" = Codex's own default model. */
  model: string;
  /** The family the choice named, when it named one Jig found. */
  family?: string;
  /** Why the choice wasn't used, for the user. */
  notice?: string;
}

/**
 * The exact model for a stored ChatGPT choice (D-310), worked out at call time so a new release (6.2)
 * is used as soon as Codex lists it. A family alias becomes its newest model in `available` (the list
 * Codex reports), else in `CHATGPT_FALLBACK_MODELS`; an exact slug and "" pass through unchanged; an
 * alias no model has falls back to Codex's default model with a notice.
 */
export function resolveChatGptModel(choice: string, available: readonly ModelInfo[]): ResolvedChatGptModel {
  const wanted = choice.trim();
  if (!wanted || !isFamilyAlias(wanted)) return { model: wanted };
  const family = wanted.toLowerCase();
  const found = newestOfFamily(family, available) ?? newestOfFamily(family, CHATGPT_FALLBACK_MODELS);
  if (found) return { model: found.value, family };
  return {
    model: "",
    notice: `ChatGPT has no model family called "${wanted}", so Codex's default model was used.`,
  };
}

/**
 * A ChatGPT model picker's options (D-310): each family first ("Sol (latest) · now GPT-6.1-Sol"),
 * then every exact version for pinning one. A family Codex doesn't list shows its fallback version.
 */
export function chatGptModelChoices(models: readonly ModelInfo[]): {
  families: Array<{ value: ChatGptFamily; label: string }>;
  versions: Array<{ value: string; label: string }>;
} {
  return {
    families: CHATGPT_FAMILIES.map((family) => {
      const now = newestOfFamily(family, models) ?? newestOfFamily(family, CHATGPT_FALLBACK_MODELS);
      const name = `${CHATGPT_FAMILY_LABELS[family]} (latest)`;
      return { value: family, label: now ? `${name} · now ${now.displayName}` : name };
    }),
    versions: models.map((m) => ({ value: m.value, label: m.displayName })),
  };
}

/** Whether a provider can answer now (Settings → AI features disables ChatGPT when it can't). */
export interface ProviderStatus {
  provider: AiProvider;
  ready: boolean;
  /** In words: "Signed in with your ChatGPT account.", "The Codex CLI isn't installed." */
  detail: string;
}
