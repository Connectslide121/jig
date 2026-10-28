import { getConfig } from "../config";
import { getEngine } from "../engine";
import { sessionEnv } from "../engine/types";
import { emit, handle } from "../ipc/router";
import { UsageService } from "./service";

let service: UsageService | undefined;

export function usageService(): UsageService {
  if (!service) throw new Error("Usage not started");
  return service;
}

/** Plan usage for the meter in the status bar and the chat header (docs/reference/usage.md). */
export function startUsage(): void {
  const s = new UsageService({
    fetch: () => {
      const { engine } = getConfig();
      return getEngine().planUsage({
        env: sessionEnv(process.env, engine.allowApiKey),
        claudePath: engine.claudePath,
      });
    },
    onChange: (usage) => emit("usage.changed", usage),
  });
  service = s;
  s.start();
  handle("usage.get", () => {
    s.refreshIfOlder(2 * 60_000);
    return s.current();
  });
  handle("usage.refresh", () => s.refresh());
}

export function stopUsage(): void {
  service?.stop();
}
