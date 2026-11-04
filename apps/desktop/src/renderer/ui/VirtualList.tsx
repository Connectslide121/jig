import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * A list that only renders the rows in view (fixed row height), for long histories. `onEndReached`
 * fires when the last rows come into view (load the next page). `initialScrollTop` and `onScrollTop`
 * keep the position across a remount (a view switched away and back).
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  onEndReached,
  className,
  overscan = 8,
  initialScrollTop = 0,
  onScrollTop,
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  onEndReached?: () => void;
  className?: string;
  overscan?: number;
  initialScrollTop?: number;
  onScrollTop?: (top: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: initialScrollTop, height: 800 });
  // Before the first paint, so a restored list never shows its top first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the position it mounted with.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !initialScrollTop) return;
    el.scrollTop = initialScrollTop;
    setScroll({ top: el.scrollTop, height: el.clientHeight });
  }, []);
  const first = Math.max(0, Math.floor(scroll.top / rowHeight) - overscan);
  const last = Math.min(items.length, Math.ceil((scroll.top + scroll.height) / rowHeight) + overscan);
  return (
    <div
      ref={ref}
      className={className}
      style={{ overflowY: "auto", position: "relative" }}
      onScroll={(e) => {
        const el = e.currentTarget;
        setScroll({ top: el.scrollTop, height: el.clientHeight });
        onScrollTop?.(el.scrollTop);
        if (onEndReached && el.scrollTop + el.clientHeight > el.scrollHeight - rowHeight * 20) onEndReached();
      }}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {items.slice(first, last).map((item, i) => (
          <div
            key={first + i}
            style={{
              position: "absolute",
              top: (first + i) * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
            }}
          >
            {renderRow(item, first + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
