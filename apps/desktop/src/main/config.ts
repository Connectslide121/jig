import { ConfigSchema, type DeepPartial, deepMerge, type JigConfig } from "../shared/config";
import { emit, handle } from "./ipc/router";
import { readJson, writeJson } from "./state/jsonStore";
import { paths } from "./state/paths";

let current: JigConfig | undefined;
const listeners = new Set<(config: JigConfig) => void>();

export async function loadConfig(): Promise<JigConfig> {
  current = await readJson(paths.config(), ConfigSchema);
  return current;
}

export function getConfig(): JigConfig {
  if (!current) throw new Error("Config not loaded");
  return current;
}

export async function updateConfig(patch: DeepPartial<JigConfig>): Promise<JigConfig> {
  const next = ConfigSchema.parse(deepMerge(getConfig(), patch));
  current = next;
  await writeJson(paths.config(), next);
  emit("config.changed", next);
  for (const listener of listeners) listener(next);
  return next;
}

/** Host modules that react to settings changes subscribe here. */
export function onConfigChange(listener: (config: JigConfig) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerConfigHandlers(): void {
  handle("config.get", () => getConfig());
  handle("config.update", (patch) => updateConfig(patch));
}
