import { cn } from "./cn";

// Jig's logo on a 1024 grid — the same shapes as scripts/make-icon.mjs (the app icon).
const FENCE =
  "M284 252h92a24 24 0 0 1 24 24v348h348a24 24 0 0 1 24 24v92a24 24 0 0 1-24 24H284a24 24 0 0 1-24-24V276a24 24 0 0 1 24-24Z";

/**
 * Jig's logo: a corner jig — an L-shaped fence holding a square piece, in the accent colour, with no
 * tile behind it (the app icon is the same). `mark` is cropped close (top bar); `icon` keeps the app
 * icon's small margin (About).
 */
export function JigLogo({ variant = "mark", className }: { variant?: "mark" | "icon"; className?: string }) {
  return (
    <svg
      viewBox={variant === "icon" ? "230 226 572 572" : "244 244 536 536"}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Jig"
    >
      <path d={FENCE} className="fill-accent" />
      <rect x="440" y="292" width="292" height="292" rx="24" className="fill-accent" />
    </svg>
  );
}
