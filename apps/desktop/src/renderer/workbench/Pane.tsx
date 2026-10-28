import type { ReactNode } from "react";
import { cn, type ResizeEdge, ResizeHandle } from "../ui";
import { useWorkbench, workbench } from "./store";

/** The remembered size of a pane (layout.json `panes`), or `fallback`. */
export function usePaneSize(id: string, fallback: number): number {
  return useWorkbench((s) => s.layout?.panes[id]) ?? fallback;
}

export interface PaneProps {
  /** Unique id; the size is remembered under it (e.g. `jig.terminals.list`, `addon.git.diff`). */
  id: string;
  /** The edge with the drag handle: `left` for a pane on the right of its neighbour, and so on. */
  edge: ResizeEdge;
  defaultSize: number;
  min?: number;
  max?: number;
  className?: string;
  children?: ReactNode;
  label?: string;
}

/**
 * A resizable pane inside a view or tab: a flex child with a fixed width (or height) and a drag handle
 * on one edge. `@jig/sdk/ui` exports it to add-ons.
 */
export function Pane({
  id,
  edge,
  defaultSize,
  min = 120,
  max = 1200,
  className,
  children,
  label,
}: PaneProps) {
  const size = usePaneSize(id, defaultSize);
  const horizontal = edge === "left" || edge === "right";
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={horizontal ? { width: size } : { height: size }}
      data-testid={`pane-${id}`}
    >
      {children}
      <ResizeHandle
        edge={edge}
        size={size}
        min={min}
        max={max}
        label={label ?? "Resize"}
        onResize={(next) => workbench.resizePane(id, next)}
        onReset={() => workbench.resetPane(id)}
      />
    </div>
  );
}

/**
 * The ratio (0.1–0.9) of a two-column split, e.g. the sides of a diff, with a setter that remembers it.
 */
export function useSplitRatio(id: string, fallback = 0.5): [number, (ratio: number) => void, () => void] {
  const ratio = usePaneSize(id, fallback);
  return [
    ratio,
    (r) => workbench.resizePane(id, Math.max(0.1, Math.min(0.9, r))),
    () => workbench.resetPane(id),
  ];
}
