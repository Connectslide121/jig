import { cn } from "./cn";

// Jig's logo on a 1024 grid — the same shapes as scripts/make-icon.mjs (the app icon).
const BAR =
  "M604 161H735A28 28 0 0 1 763 189V591A8 8 0 0 1 755 599H584A8 8 0 0 1 576 591V189A28 28 0 0 1 604 161Z";
const HOOK =
  "M260 618A14 14 0 0 1 274 604H425A8 8 0 0 1 433 612V628A71.5 71.5 0 0 0 576 628V629A8 8 0 0 1 584 621H753A10 10 0 0 1 763 631L761 631A251.5 251.5 0 0 1 261 618Z";

/**
 * Jig's logo: the "J" of a bar and a hook. `mark` is the J alone in the accent colour (top bar);
 * `icon` adds the rounded square in the canvas colour, so it follows the theme (graphite in Jig Dark).
 */
export function JigLogo({ variant = "mark", className }: { variant?: "mark" | "icon"; className?: string }) {
  return (
    <svg
      viewBox={variant === "icon" ? "0 0 1024 1024" : "250 150 524 710"}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Jig"
    >
      {variant === "icon" && (
        <rect
          x="32"
          y="32"
          width="960"
          height="960"
          rx="216"
          className="fill-canvas stroke-line"
          strokeWidth="8"
        />
      )}
      <path d={BAR} className="fill-accent" />
      <path d={HOOK} className="fill-accent" />
    </svg>
  );
}
