import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: string;
  /** What the change is measured against is required: a delta means nothing without it. */
  delta?: { value: string; direction: "up" | "down" | "flat"; good: boolean; against: string };
  /** A short trend, oldest first. */
  trend?: number[];
  /** `data-demo` id for story steps. */
  demo?: string;
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24 - 2}`);
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-20 shrink-0 text-primary @max-xl:hidden" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Four (or two to six) headline numbers. Same height loading, filled or empty. */
export function KpiStrip({ items, loading, className }: { items: Kpi[]; loading?: boolean; className?: string }) {
  const count = loading ? 4 : items.length;
  return (
    <div className={cn("grid grid-cols-2 gap-3 @3xl:grid-cols-4", count > 4 && "@5xl:grid-cols-6", className)}>
      {(loading ? Array.from({ length: 4 }, () => null) : items).map((k, i) =>
        k ? (
          <div key={k.label} data-demo={k.demo} className="flex h-30 flex-col rounded-xl border bg-card p-4 shadow-card">
            <p className="truncate text-sm text-muted-foreground">{k.label}</p>
            <div className="mt-1.5 flex items-end gap-3">
              <p className="flex-1 truncate font-display text-2xl font-semibold tracking-tight tabular-nums">{k.value}</p>
              {k.trend && <Spark values={k.trend} />}
            </div>
            {k.delta && (
              <p className="mt-auto flex items-center gap-1 truncate text-xs text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium tabular-nums",
                    k.delta.direction === "flat" ? "text-muted-foreground" : k.delta.good ? "text-success" : "text-destructive",
                  )}
                >
                  {k.delta.direction === "up" ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : k.delta.direction === "down" ? (
                    <ArrowDownRight className="size-3.5" />
                  ) : (
                    <ArrowRight className="size-3.5" />
                  )}
                  {k.delta.value}
                </span>
                <span className="truncate">{k.delta.against}</span>
              </p>
            )}
          </div>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
          <div key={i} className="flex h-30 flex-col gap-3 rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="mt-auto h-3 w-32" />
          </div>
        ),
      )}
    </div>
  );
}
