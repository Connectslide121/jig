import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** A clickable row in a list (sessions, projects, commits, files…). */
export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  { selected, leading, trailing, description, disabled, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      tabIndex={-1}
      className={cn(
        "group flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 text-sm",
        selected ? "bg-active text-fg" : "text-fg hover:bg-hover",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      {...rest}
    >
      {leading && <span className="flex shrink-0 items-center text-muted">{leading}</span>}
      <span className="min-w-0 flex-1 py-1">
        <span className="block truncate">{children}</span>
        {description && <span className="block truncate text-xs text-muted">{description}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-1 text-xs text-muted">{trailing}</span>}
    </div>
  );
});
