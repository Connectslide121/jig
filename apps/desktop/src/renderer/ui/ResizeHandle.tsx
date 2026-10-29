import { useRef, useState } from "react";
import { cn } from "./cn";

/** Which edge of the resized box the handle sits on; dragging away from the box makes it bigger. */
export type ResizeEdge = "left" | "right" | "top" | "bottom";

export interface ResizeHandleProps {
  edge: ResizeEdge;
  /** The current size in px. */
  size: number;
  onResize: (size: number) => void;
  /** Double-click (and Enter) resets. */
  onReset?: () => void;
  min?: number;
  max?: number | (() => number);
  label?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * A drag handle on the edge of a box: an 8px hit area centred on the border, a visible line on hover
 * and while dragging, arrow keys move it by 16px (Shift: 64px).
 */
export function ResizeHandle({
  edge,
  size,
  onResize,
  onReset,
  min = 120,
  max = 4000,
  label = "Resize",
  className,
  ...rest
}: ResizeHandleProps) {
  const start = useRef<{ pos: number; size: number }>(undefined);
  const [dragging, setDragging] = useState(false);
  const vertical = edge === "left" || edge === "right";
  const sign = edge === "right" || edge === "bottom" ? 1 : -1;
  const limit = (value: number) => {
    const top = typeof max === "function" ? max() : max;
    return Math.round(Math.max(min, Math.min(Math.max(min, top), value)));
  };
  const end = () => {
    start.current = undefined;
    setDragging(false);
    document.body.classList.remove("jig-resizing", "jig-resizing-row");
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(size)}
      title={`${label} — drag, or double-click to reset`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start.current = { pos: vertical ? event.clientX : event.clientY, size };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.classList.add(vertical ? "jig-resizing" : "jig-resizing-row");
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const pos = vertical ? event.clientX : event.clientY;
        onResize(limit(start.current.size + sign * (pos - start.current.pos)));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 64 : 16;
        const grow = vertical
          ? { ArrowRight: sign, ArrowLeft: -sign }[event.key]
          : { ArrowDown: sign, ArrowUp: -sign }[event.key];
        if (grow) {
          event.preventDefault();
          onResize(limit(size + grow * step));
        } else if (event.key === "Enter" && onReset) {
          event.preventDefault();
          onReset();
        }
      }}
      className={cn(
        "group absolute z-20 flex touch-none justify-center outline-none",
        vertical ? "top-0 h-full w-2 cursor-col-resize" : "left-0 h-2 w-full cursor-row-resize flex-col",
        edge === "right" && "-right-1",
        edge === "left" && "-left-1",
        edge === "bottom" && "-bottom-1",
        edge === "top" && "-top-1",
        className,
      )}
      {...rest}
    >
      <div
        className={cn(
          "pointer-events-none transition-colors group-hover:bg-accent group-focus-visible:bg-accent",
          vertical ? "h-full w-0.5" : "h-0.5 w-full",
          dragging ? "bg-accent" : "bg-transparent",
        )}
      />
    </div>
  );
}
