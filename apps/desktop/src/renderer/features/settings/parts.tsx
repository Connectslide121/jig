import type { ReactNode } from "react";
import { cn } from "../../ui";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-raised">
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  // In a narrow pane the control goes under the text, instead of squeezing it into a column of words.
  return (
    <div className="@container px-4 py-3">
      <div className="flex gap-4 @max-md:flex-col @max-md:items-start @max-md:gap-2 @md:items-center">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-fg">{label}</div>
          {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * A few choices side by side, one picked (a radio group): equal-width segments, so picking another
 * one never moves anything. A segment can carry a mark before its label and be disabled.
 */
export function SegmentedSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string; leading?: ReactNode; disabled?: boolean; title?: string }>;
  onChange: (id: T) => void;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-md border border-line bg-surface p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          title={o.title}
          data-testid={testId ? `${testId}-${o.id}` : undefined}
          onClick={() => value !== o.id && onChange(o.id)}
          className={cn(
            "flex h-6 items-center justify-center gap-1.5 rounded-sm px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50",
            value === o.id ? "bg-active text-fg shadow-card" : "text-muted enabled:hover:text-fg",
          )}
        >
          {o.leading}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * One group of rows in a settings section, under its own header (an icon, a name, a short line) and
 * a badge slot at the far right that keeps its place whether or not it shows anything.
 */
export function SettingsGroup({
  title,
  description,
  leading,
  badge,
  children,
  testId,
}: {
  title: string;
  description?: ReactNode;
  leading?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col divide-y divide-line rounded-lg border border-line bg-raised"
      data-testid={testId}
    >
      <div className="flex min-h-11 items-center gap-2 px-4 py-2">
        {leading}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{title}</div>
          {description && <div className="text-xs text-muted">{description}</div>}
        </div>
        <span className="flex w-16 shrink-0 justify-end">{badge}</span>
      </div>
      {children}
    </div>
  );
}
