import { useEffect } from "react";
import { create } from "zustand";
import { EMPTY_USAGE_BY_PROVIDER, type UsageByProvider } from "../../shared/usage";
import { call, useHostEvent } from "../lib/host";

/** Whether the footer showed ChatGPT's usage last time, so it reserves the space from the start. */
const CHATGPT_SHOWN = "jig.usage.chatgptShown";

function remember(usage: UsageByProvider) {
  const { state, windows } = usage.chatgpt;
  if (state === "unknown") return;
  try {
    localStorage.setItem(CHATGPT_SHOWN, state === "ok" || windows.length ? "1" : "0");
  } catch {
    // Storage unavailable: the footer just doesn't remember.
  }
}

function rememberedChatGpt(): boolean {
  try {
    return localStorage.getItem(CHATGPT_SHOWN) === "1";
  } catch {
    return false;
  }
}

/**
 * Your plans' usage per provider (Claude from Claude Code, ChatGPT from the Codex CLI; D-298), kept in
 * sync with the host for the meter in the status bar.
 */
export const useUsage = create<{ usage: UsageByProvider; refreshing: boolean; chatgptShown: boolean }>(
  () => ({
    usage: EMPTY_USAGE_BY_PROVIDER,
    refreshing: false,
    chatgptShown: rememberedChatGpt(),
  }),
);

function setUsage(usage: UsageByProvider) {
  remember(usage);
  const { state, windows } = usage.chatgpt;
  useUsage.setState((s) => ({
    usage,
    chatgptShown: state === "unknown" ? s.chatgptShown : state === "ok" || windows.length > 0,
  }));
}

/** Asks Claude Code and Codex again (the meter's click and the card's refresh button). */
export async function refreshUsage(): Promise<void> {
  useUsage.setState({ refreshing: true });
  try {
    setUsage(await call("usage.refresh"));
  } finally {
    useUsage.setState({ refreshing: false });
  }
}

/** Mounted once at the root. */
export function useUsageSync(): void {
  useEffect(() => {
    void call("usage.get")
      .then(setUsage)
      .catch(() => {});
  }, []);
  useHostEvent("usage.changed", setUsage);
}
