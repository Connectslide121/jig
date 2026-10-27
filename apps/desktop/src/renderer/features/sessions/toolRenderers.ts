import type { ReactNode } from "react";
import { create } from "zustand";
import type { ChatItem } from "../../../shared/engine";

/** Custom cards for tool results (`chat.toolRenderer` slot): keyed by tool name. */
export interface ToolRenderer {
  tool: string;
  owner?: string;
  render: (item: Extract<ChatItem, { kind: "tool" }>) => ReactNode;
}

const useStore = create<{ renderers: Record<string, ToolRenderer> }>(() => ({ renderers: {} }));

export function registerToolRenderer(renderer: ToolRenderer): () => void {
  useStore.setState((s) => ({ renderers: { ...s.renderers, [renderer.tool]: renderer } }));
  return () =>
    useStore.setState((s) => {
      const next = { ...s.renderers };
      delete next[renderer.tool];
      return { renderers: next };
    });
}

export const useToolRenderers = () => useStore((s) => s.renderers);
