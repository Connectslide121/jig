/**
 * Who runs an add-on's chat (D-330): the providers and models the built-in add-ons offer (the Tasks
 * queue and its tasks, a workflow's AI step), shared so they pick and show them the same way. Pure,
 * tested through the add-ons that use it.
 */

/** Claude Code, or ChatGPT through Codex. */
export type TaskProvider = "claude" | "chatgpt";

export const TASK_PROVIDERS: TaskProvider[] = ["claude", "chatgpt"];

export const PROVIDER_LABEL: Record<TaskProvider, string> = { claude: "Claude", chatgpt: "ChatGPT" };

/**
 * The models a chat can pick: each provider's families, which always run its newest version (Claude
 * Code's aliases; ChatGPT's families, D-310). Claude's tools may also give an exact model id.
 */
export const TASK_MODELS: Record<TaskProvider, Array<{ value: string; label: string }>> = {
  claude: [
    { value: "opus", label: "Opus (latest)" },
    { value: "sonnet", label: "Sonnet (latest)" },
    { value: "haiku", label: "Haiku (latest)" },
  ],
  chatgpt: [
    { value: "sol", label: "Sol (latest)" },
    { value: "terra", label: "Terra (latest)" },
    { value: "luna", label: "Luna (latest)" },
  ],
};

/** A model's name for people: its family's ("Opus (latest)"), else the id as given. */
export const modelLabel = (model: string): string =>
  [...TASK_MODELS.claude, ...TASK_MODELS.chatgpt].find((m) => m.value === model.toLowerCase())?.label ??
  model;

/** Whose model an id is: ChatGPT's families and `gpt-…` ids are ChatGPT's, everything else Claude's. */
export function providerOfModel(model: string): TaskProvider {
  const m = model.trim().toLowerCase();
  return TASK_MODELS.chatgpt.some((x) => x.value === m) || /^gpt-|codex/.test(m) ? "chatgpt" : "claude";
}

const MODEL_ID = /^[\w.:[\]-]{1,80}$/;

/** A provider and model a chat runs on; none = the defaults. */
export interface ProviderChoice {
  provider?: TaskProvider;
  model?: string;
}

/** A provider choice as stored: a model alone names its provider; another provider's model is dropped. */
export function providerFields(provider?: TaskProvider, model?: string): ProviderChoice {
  const m = model?.trim();
  const p = provider ?? (m ? providerOfModel(m) : undefined);
  if (!p) return {};
  return { provider: p, ...(m && providerOfModel(m) === p ? { model: m } : {}) };
}

export function parseProvider(value: unknown, where: string): TaskProvider | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "claude" || value === "chatgpt") return value;
  throw new Error(`provider for ${where} must be "claude" or "chatgpt"`);
}

export function parseModel(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const m = String(value).trim();
  if (!MODEL_ID.test(m)) throw new Error(`model for ${where} isn't a model id (e.g. opus, sonnet, sol)`);
  return m;
}

/** A provider and model as Claude gave them, checked against each other. */
export function parseProviderChoice(
  o: Record<string, unknown>,
  where: string,
): { provider?: TaskProvider; model?: string } {
  const provider = parseProvider(o.provider, where);
  const model = parseModel(o.model, where);
  if (provider && model && providerOfModel(model) !== provider)
    throw new Error(`model ${model} for ${where} isn't a ${PROVIDER_LABEL[provider]} model`);
  return { ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
}

/**
 * Where a chat's provider comes from: a task's own choice, the queue's, the project's default, the chat
 * it continues, or (once it started) the chat it ran in; a workflow step's own choice.
 */
export type RunsOnSource = "task" | "queue" | "project" | "chat" | "ran" | "step";

/** "ChatGPT · Sol (latest)", "Claude". */
export const runsOnText = (on: { provider: TaskProvider; model?: string }) =>
  `${PROVIDER_LABEL[on.provider]}${on.model ? ` · ${modelLabel(on.model)}` : ""}`;

/** A model's short name for tight places: "Opus", "Sol", else the id as given. */
export const modelShort = (model: string) => modelLabel(model).replace(/ \(latest\)$/, "");

/** "Claude · Opus", "ChatGPT": for buttons and defaults that have little room. */
export const runsOnShort = (on: { provider: TaskProvider; model?: string }) =>
  `${PROVIDER_LABEL[on.provider]}${on.model ? ` · ${modelShort(on.model)}` : ""}`;
