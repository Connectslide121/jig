import { useEffect } from "react";
import { create } from "zustand";
import { EMPTY_USAGE, type PlanUsage } from "../../shared/usage";
import { call, useHostEvent } from "../lib/host";

/** Your Claude plan usage, kept in sync with the host (the meter in the status bar and chat header). */
export const useUsage = create<{ usage: PlanUsage; refreshing: boolean }>(() => ({
  usage: EMPTY_USAGE,
  refreshing: false,
}));

export async function refreshUsage(): Promise<void> {
  useUsage.setState({ refreshing: true });
  try {
    useUsage.setState({ usage: await call("usage.refresh") });
  } finally {
    useUsage.setState({ refreshing: false });
  }
}

/** Mounted once at the root. */
export function useUsageSync(): void {
  useEffect(() => {
    void call("usage.get")
      .then((usage) => useUsage.setState({ usage }))
      .catch(() => {});
  }, []);
  useHostEvent("usage.changed", (usage) => useUsage.setState({ usage }));
}
