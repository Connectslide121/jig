import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "./cn";

/**
 * A thin horizontal scrollbar drawn over the bottom edge of a strip that scrolls sideways (the tab
 * strips), like VS Code's: it takes no height, shows while the pointer is over the strip (put it
 * in a `group/strip` parent next to the strip), and can be dragged. The strip hides its own
 * scrollbar (`tab-strip` class).
 */
export function OverlayScrollbar({ target }: { target: RefObject<HTMLElement | null> }) {
  const [thumb, setThumb] = useState<{ left: number; width: number }>();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; scroll: number }>(undefined);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const measure = () => {
      const { scrollWidth, clientWidth, scrollLeft } = el;
      if (scrollWidth <= clientWidth + 1) return setThumb(undefined);
      const width = Math.max(24, (clientWidth / scrollWidth) * clientWidth);
      const left = (scrollLeft / (scrollWidth - clientWidth)) * (clientWidth - width);
      setThumb({ left, width });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Tabs opening, closing or the pane resizing change what overflows.
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const children = new MutationObserver(measure);
    children.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", measure);
      resize.disconnect();
      children.disconnect();
    };
  }, [target]);

  if (!thumb) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-1 opacity-0 transition-opacity duration-150 group-hover/strip:opacity-100",
        dragging && "opacity-100",
      )}
      data-testid="overlay-scrollbar"
    >
      <div
        className="pointer-events-auto absolute h-full cursor-default rounded-full bg-muted opacity-50 hover:opacity-80"
        style={{ left: thumb.left, width: thumb.width }}
        onPointerDown={(e) => {
          const el = target.current;
          if (!el) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, scroll: el.scrollLeft };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const el = target.current;
          if (!el || !drag.current) return;
          // The thumb moves over the strip's width; the strip scrolls over its content's.
          const ratio = (el.scrollWidth - el.clientWidth) / (el.clientWidth - thumb.width);
          el.scrollLeft = drag.current.scroll + (e.clientX - drag.current.x) * ratio;
        }}
        onPointerUp={() => {
          drag.current = undefined;
          setDragging(false);
        }}
      />
    </div>
  );
}
