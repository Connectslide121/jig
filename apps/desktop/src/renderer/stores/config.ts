import { create } from "zustand";
import type { DeepPartial, JigConfig } from "../../shared/config";
import type { AppInfo } from "../../shared/ipc";
import { call } from "../lib/host";

/** Settings and app facts, kept in sync with the host (`config.changed`). */
export const useConfig = create<{ config: JigConfig | undefined; info: AppInfo | undefined }>(() => ({
  config: undefined,
  info: undefined,
}));

export function updateConfig(patch: DeepPartial<JigConfig>): Promise<JigConfig> {
  return call("config.update", patch);
}
