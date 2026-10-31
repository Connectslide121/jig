import type { ChatItem } from "./engine";
import { modelName } from "./models";

/** The actual reported model id stays in tooltips; remove redundant provider/date text in small labels. */
export function reportedModelName(model: string): string {
  return modelName(model)
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "");
}

/** Models reported by a subagent's own messages/calls. Never infer them from the current chat setting. */
export function agentModels(items: ChatItem[]): string[] {
  return [
    ...new Set(
      items.flatMap((item) =>
        (item.kind === "assistant" || item.kind === "tool") && item.model ? [item.model] : [],
      ),
    ),
  ].sort();
}
