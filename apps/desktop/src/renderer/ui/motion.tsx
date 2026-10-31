import { type ReactNode, useEffect, useState } from "react";
import { cn } from "./cn";

export const MOTION_MS = 160;
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Keep closing content mounted until the shared short transition finishes. */
export function usePresence(open: boolean, duration = MOTION_MS): boolean {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(() => setPresent(false), reducedMotion() ? 0 : duration);
    return () => clearTimeout(timer);
  }, [open, duration]);
  return open || present;
}

/** User-triggered inline disclosure: single-axis growth, stable card origin, reduced-motion aware. */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("jig-collapse", className)} data-open={open} aria-hidden={!open} inert={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
