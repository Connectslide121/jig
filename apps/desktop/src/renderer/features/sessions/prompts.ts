import { create } from "zustand";

/** Reusable prompts shown as buttons above the composer (`prompt` slot; add-ons register more). */
export interface PromptButton {
  id: string;
  label: string;
  text: string;
  /** Send immediately instead of putting the text in the composer. */
  send?: boolean;
  owner?: string;
}

const useStore = create<{ prompts: Record<string, PromptButton> }>(() => ({ prompts: {} }));

export function registerPrompt(prompt: PromptButton): () => void {
  useStore.setState((s) => ({ prompts: { ...s.prompts, [prompt.id]: prompt } }));
  return () =>
    useStore.setState((s) => {
      const next = { ...s.prompts };
      delete next[prompt.id];
      return { prompts: next };
    });
}

export const usePrompts = () => useStore((s) => s.prompts);
