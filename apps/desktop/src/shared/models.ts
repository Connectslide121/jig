import type { ModelInfo } from "./engine";

/** Stable Claude Code aliases: selecting a family leaves version resolution to Claude Code. */
export const MODEL_ALIASES = [
  { id: "", label: "Default model" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "opusplan", label: "Opus Plan Mode" },
];

/** Alias labels stay stable even when discovery describes their currently resolved versions. */
export function modelName(id: string, models: ModelInfo[] = []): string {
  return (
    MODEL_ALIASES.find((m) => m.id === id)?.label ?? models.find((m) => m.value === id)?.displayName ?? id
  );
}

/** Family aliases first; discovered explicit versions remain available for deliberate selection. */
export function modelOptions(
  models: ModelInfo[] = [],
  hybrid = true,
): Array<{ id: string; label: string; description?: string }> {
  const aliases = MODEL_ALIASES.filter((m) => hybrid || m.id !== "opusplan");
  const list = models.map((m) => ({
    id: m.value === "default" ? "" : m.value,
    label: m.displayName,
    description: m.description,
  }));
  return [
    ...aliases.map((alias) => ({
      ...list.find((m) => m.id === alias.id),
      ...alias,
      ...(alias.id === "opusplan" ? { description: "Opus plans, Sonnet executes" } : {}),
    })),
    ...list.filter((m) => !MODEL_ALIASES.some((a) => a.id === m.id)),
  ];
}
