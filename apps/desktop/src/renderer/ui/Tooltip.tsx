import { cloneElement, type ReactElement, type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * A themed tooltip shown after a short hover. For icon buttons, `title` (IconButton) is enough.
 * `content` may be rich (a card); `side="above"` for anchors at the bottom of the window (status bar).
 */
export function Tooltip({
  content,
  children,
  side = "below",
  delay = 450,
  className,
  interactive,
}: {
  content: ReactNode;
  children: ReactElement<{
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: () => void;
  }>;
  side?: "below" | "above";
  delay?: number;
  className?: string;
  /** The card stays while the pointer is on it, so it can hold buttons. */
  interactive?: boolean;
}) {
  const [at, setAt] = useState<{ x: number; y: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (el: HTMLElement, wait: number) => {
    const rect = el.getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        setAt({
          // Keep a wide card inside the window.
          x: Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170),
          y: side === "above" ? rect.top - 6 : rect.bottom + 6,
        }),
      wait,
    );
  };
  const hide = () => {
    clearTimeout(timer.current);
    // An interactive card waits a moment, so the pointer can cross the gap onto it.
    if (interactive) timer.current = setTimeout(() => setAt(undefined), 250);
    else setAt(undefined);
  };
  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => show(e.currentTarget as HTMLElement, delay),
    onMouseLeave: hide,
    onFocus: (e: React.FocusEvent) => show(e.currentTarget as HTMLElement, 0),
    onBlur: hide,
  });
  return (
    <>
      {child}
      {at &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={interactive ? () => clearTimeout(timer.current) : undefined}
            onMouseLeave={interactive ? hide : undefined}
            style={{ left: at.x, top: at.y }}
            className={cn(
              "fixed z-50 max-w-xs -translate-x-1/2 rounded-md border border-line bg-elevated px-2 py-1 text-xs text-fg shadow-popover",
              !interactive && "pointer-events-none",
              side === "above" && "-translate-y-full",
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
