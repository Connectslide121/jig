import { useEffect } from "react";
import { create } from "zustand";
import type { ChatProvider, ModelInfo } from "../../shared/engine";
import type { ProviderStatus } from "../../shared/providers";
import { call, useHostEvent } from "../lib/host";

/**
 * What the chat pickers and Settings need to know about the chat providers (D-314): whether ChatGPT
 * can run chats now (the Codex CLI installed and signed in), and each provider's model list. Asked
 * once, and ChatGPT's status again after a Codex sign-in.
 */
export const useProviders = create<{
  chatgpt?: ProviderStatus;
  models: Partial<Record<ChatProvider, ModelInfo[]>>;
}>(() => ({ models: {} }));

let askedStatus = false;
function loadChatGptStatus(force = false): void {
  if (askedStatus && !force) return;
  askedStatus = true;
  void call("ai.providers").then(
    (list) => useProviders.setState({ chatgpt: list.find((p) => p.provider === "chatgpt") }),
    () =>
      useProviders.setState({
        chatgpt: { provider: "chatgpt", ready: false, detail: "Couldn't ask the Codex CLI." },
      }),
  );
}

/** Whether ChatGPT can answer (undefined while Jig asks); asked again after a sign-in. */
export function useChatGptStatus(): ProviderStatus | undefined {
  useEffect(() => loadChatGptStatus(), []);
  useHostEvent("codex.signIn", () => loadChatGptStatus(true));
  return useProviders((s) => s.chatgpt);
}

const loading = new Map<ChatProvider, Promise<ModelInfo[] | undefined>>();

/**
 * A provider's models: Claude Code's own list, or the one Codex reports (`ai.models`, no chat's
 * process is started for it). `sessionId` lets Claude's list come from a chat's running Claude Code
 * when the app-wide request has nothing yet.
 */
export function loadProviderModels(
  provider: ChatProvider,
  sessionId?: string,
): Promise<ModelInfo[] | undefined> {
  const known = useProviders.getState().models[provider];
  if (known?.length) return Promise.resolve(known);
  const pending = loading.get(provider);
  if (pending) return pending;
  const ask = async (): Promise<ModelInfo[]> => {
    if (provider === "codex") return call("ai.models", { provider: "chatgpt" });
    const list = await call("engine.models").catch(() => []);
    return list.length || !sessionId ? list : call("sessions.models", { id: sessionId });
  };
  const next = ask()
    .then((list) => {
      if (list.length) useProviders.setState((s) => ({ models: { ...s.models, [provider]: list } }));
      return list.length ? list : undefined;
    })
    .catch(() => undefined)
    .finally(() => loading.delete(provider));
  loading.set(provider, next);
  return next;
}

/** A provider's models for components (undefined until they come; asks once). */
export function useProviderModels(provider: ChatProvider): ModelInfo[] | undefined {
  useEffect(() => {
    void loadProviderModels(provider);
  }, [provider]);
  return useProviders((s) => s.models[provider]);
}
