import { type ReactNode, useEffect, useRef } from "react";
import { cn, Spinner } from "../../ui";

export interface PickerItem {
  id: string;
  /** What goes in the message box. */
  value: string;
  label: ReactNode;
  description?: string;
  hint?: string;
  icon?: ReactNode;
}

/**
 * The list above the message box for `/` (Claude Code's commands and skills) and `@` (files): ↑/↓
 * choose, Enter or Tab takes it, Esc closes. The message box keeps the focus.
 */
export function ComposerPicker({
  title,
  items,
  selected,
  loading,
  empty,
  onPick,
  onHover,
}: {
  title: string;
  items: PickerItem[];
  selected: number;
  loading?: boolean;
  empty: string;
  onPick: (item: PickerItem) => void;
  onHover: (index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <div
      className="absolute right-0 bottom-full left-0 z-30 mb-1 flex max-h-72 flex-col overflow-hidden rounded-lg border border-line bg-elevated shadow-popover"
      data-testid="composer-picker"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1 text-2xs text-hint">
        <span className="font-semibold tracking-wide uppercase">{title}</span>
        {loading && <Spinner size="sm" />}
        <span className="ml-auto">↑↓ choose · Enter or Tab take · Esc close</span>
      </div>
      <div ref={list} role="listbox" className="min-h-0 overflow-y-auto p-1">
        {items.length === 0 && !loading && <div className="px-2 py-1.5 text-xs text-hint">{empty}</div>}
        {items.map((item, index) => (
          <div
            key={item.id}
            role="option"
            aria-selected={index === selected}
            tabIndex={-1}
            data-index={index}
            data-testid="picker-item"
            onMouseDown={(e) => {
              // Keep the focus in the message box.
              e.preventDefault();
              onPick(item);
            }}
            onMouseMove={() => onHover(index)}
            className={cn(
              "flex min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm",
              index === selected ? "bg-active text-fg" : "text-fg",
            )}
          >
            {item.icon && <span className="flex shrink-0 items-center text-muted">{item.icon}</span>}
            <span className="shrink-0 font-mono text-xs">{item.label}</span>
            {item.hint && <span className="shrink-0 font-mono text-xs text-hint">{item.hint}</span>}
            {item.description && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{item.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
