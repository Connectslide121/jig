import { cloneElement, type ReactElement, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** A themed tooltip shown after a short hover. For icon buttons, `title` (IconButton) is enough. */
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactElement<{ onMouseEnter?: (e: React.MouseEvent) => void; onMouseLeave?: () => void }>;
}) {
  const [at, setAt] = useState<{ x: number; y: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setAt({ x: rect.left + rect.width / 2, y: rect.bottom + 6 }), 450);
    },
    onMouseLeave: () => {
      clearTimeout(timer.current);
      setAt(undefined);
    },
  });
  return (
    <>
      {child}
      {at &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: at.x, top: at.y }}
            className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 rounded-md border border-line bg-elevated px-2 py-1 text-xs text-fg shadow-popover"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
