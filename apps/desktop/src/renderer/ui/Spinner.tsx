import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

/**
 * A loading spinner. `center` is how a panel or section shows it is loading: centered in all the
 * space it has (never "Loading…" text, never in a corner).
 */
export function Spinner({
  size = "md",
  className,
  center,
  tone = "muted",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  center?: boolean;
  /** Buttons inherit their foreground, including primary/danger contrast colours. */
  tone?: "muted" | "inherit";
}) {
  const s = { sm: "size-3.5", md: "size-4", lg: "size-6" }[size];
  const icon = (
    <LoaderCircle
      aria-label="Loading"
      className={cn("block shrink-0 animate-spin", tone === "muted" && "text-muted", s, !center && className)}
    />
  );
  if (!center) return icon;
  return (
    <div
      className={cn("flex min-h-16 flex-1 items-center justify-center self-stretch p-4", className)}
      data-testid="loading"
    >
      {icon}
    </div>
  );
}
