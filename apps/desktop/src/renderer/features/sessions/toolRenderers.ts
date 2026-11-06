import type { ReactNode } from "react";
import { create } from "zustand";
import type { ChatItem } from "../../../shared/engine";

/** Custom cards for tool results (`chat.toolRenderer` slot): keyed by tool name. */
export interface ToolRenderer {
  tool: string;
  owner?: string;
  /** Shown in the chat even where steps fold into one line, without the tool's own header (`promote`). */
  promote?: boolean;
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

/** A finished tool call whose add-on asked for its card to stand in the chat (`promote`). */
export const isPromoted = (renderers: Record<string, ToolRenderer>, item: ChatItem): boolean =>
  item.kind === "tool" && item.status === "done" && Boolean(renderers[item.name]?.promote);

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
