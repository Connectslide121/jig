import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-raised shadow-card", className)} {...rest} />;
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-active text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small round count, e.g. the suggestions badge. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold text-on-accent",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-line bg-surface px-1 font-sans text-2xs text-hint">
      {children}
    </kbd>
  );
}

/**
 * An empty or error state: icon, title, a short description (`children`) and the buttons that get
 * the user going (`actions`), always centred as a group below the text and wrapping in a narrow
 * sidebar. Put buttons in `actions`, never in `children`.
 */
export function Empty({
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-6 text-center", className)}>
      {Icon && (
        <div className="mb-3 grid size-10 shrink-0 place-items-center rounded-full bg-active">
          <Icon className="size-5 text-hint" />
        </div>
      )}
      <div className="max-w-sm text-sm font-medium text-balance text-fg">{title}</div>
      {children && (
        <div className="mt-1.5 max-w-sm space-y-1.5 text-xs leading-relaxed text-pretty text-muted">
          {children}
        </div>
      )}
      {actions && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-1 px-3 text-2xs font-semibold tracking-wide text-hint uppercase">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {actions}
    </div>
  );
}
