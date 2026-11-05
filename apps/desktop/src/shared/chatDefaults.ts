import type { JigConfig } from "./config";
import type { ChatProvider, EffortLevel } from "./engine";
import type { Project } from "./projects";

/**
 * A new chat's provider and its defaults (D-309, D-390). The provider: the one asked for, else the
 * project's, else `engine.provider`. The project's model and effort belong to the project's provider;
 * each of them that the project leaves empty (or that a chat on the other provider can't use) falls
 * back to Jig's default for the chat's provider: `defaultModel`/`effort` for Claude,
 * `codexModel`/`codexEffort` for ChatGPT. An empty effort everywhere = the model's own default.
 */
export function chatDefaults(
  engine: Pick<JigConfig["engine"], "provider" | "defaultModel" | "effort" | "codexModel" | "codexEffort">,
  project: Pick<Project, "provider" | "model" | "effort"> | undefined,
  asked: ChatProvider | undefined,
): { provider: ChatProvider; model: string; effort?: EffortLevel } {
  const projectProvider = project?.provider ?? engine.provider;
  const provider = asked ?? projectProvider;
  const own = provider === projectProvider ? project : undefined;
  const codex = provider === "codex";
  return {
    provider,
    model: own?.model || (codex ? engine.codexModel : engine.defaultModel),
    effort: own?.effort || (codex ? engine.codexEffort : engine.effort) || undefined,
  };
}
