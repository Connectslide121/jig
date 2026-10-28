import { type ReactNode, useRef, useState } from "react";

/**
 * A list that only renders the rows in view (fixed row height), for long histories. `onEndReached`
 * fires when the last rows come into view (load the next page).
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  onEndReached,
  className,
  overscan = 8,
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  onEndReached?: () => void;
  className?: string;
  overscan?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 800 });
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
