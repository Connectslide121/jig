import { cn } from "@/lib/utils";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, { dot: string; badge: string }> = {
  neutral: { dot: "bg-muted-foreground/60", badge: "bg-muted text-muted-foreground" },
  primary: { dot: "bg-primary", badge: "bg-primary/10 text-foreground" },
  success: { dot: "bg-success", badge: "bg-success/12 text-foreground" },
  warning: { dot: "bg-warning", badge: "bg-warning/15 text-foreground" },
  danger: { dot: "bg-destructive", badge: "bg-destructive/10 text-foreground" },
  info: { dot: "bg-info", badge: "bg-info/12 text-foreground" },
};

export const toneDot = (tone: Tone) => TONES[tone].dot;

/** A status as a soft pill with a dot (the dot carries the colour; the text stays readable). Put it at the row's right edge, in a fixed-width column. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        TONES[tone].badge,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", TONES[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}
