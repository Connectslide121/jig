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

/**
 * Approval cards for add-ons' own tools (`chat.permissionRenderer` slot), keyed by the tool's full
 * name (`mcp__jig__addon_<addon>_<tool>`): drawn instead of the usual permission card.
 */
export interface PermissionRenderer {
  tool: string;
  owner?: string;
  render: (props: {
    request: { toolName: string; input: Record<string, unknown>; title?: string };
    status: "pending" | "allowed" | "always" | "denied" | "cancelled";
    sessionId: string;
    projectId?: string;
    respond: (
      decision:
        | { behavior: "allow"; input?: Record<string, unknown> }
        | { behavior: "deny"; message?: string },
    ) => Promise<void>;
  }) => ReactNode;
}

const usePermissionStore = create<{ renderers: Record<string, PermissionRenderer> }>(() => ({
  renderers: {},
}));

export function registerPermissionRenderer(renderer: PermissionRenderer): () => void {
  usePermissionStore.setState((s) => ({ renderers: { ...s.renderers, [renderer.tool]: renderer } }));
  return () =>
    usePermissionStore.setState((s) => {
      const next = { ...s.renderers };
      if (next[renderer.tool] === renderer) delete next[renderer.tool];
      return { renderers: next };
    });
}

export const usePermissionRenderer = (tool: string) => usePermissionStore((s) => s.renderers[tool]);
